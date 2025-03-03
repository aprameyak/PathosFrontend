const emotionColors = {
  happy: '#4CAF50',
  sad: '#2196F3',
  angry: '#F44336',
  fear: '#9C27B0',
  surprise: '#FFC107',
  disgust: '#795548',
  neutral: '#9E9E9E'
};

let isCapturing = false;
let videoFrameId = null;
let emotionProcessingId = null;
let captureStream = null;
let currentRegion = null;
let videoElement, canvasElement, canvasContext, emotionsContainer;

let emotionBuffer = [];
let lastUpdateTime = 0;
const UPDATE_INTERVAL = 2000;

document.addEventListener('DOMContentLoaded', () => {
  videoElement = document.getElementById('videoElement');
  canvasElement = document.getElementById('canvasElement');
  canvasContext = canvasElement.getContext('2d');
  emotionsContainer = document.getElementById('emotionsContainer');

  const container = document.querySelector('.video-container');
  canvasElement.width = container.offsetWidth;
  canvasElement.height = container.offsetHeight;

  videoElement.style.display = 'none';
  canvasElement.style.display = 'block';

  document.getElementById('startButton').addEventListener('click', startCapture);
  document.getElementById('stopButton').addEventListener('click', stopCapture);
});

async function startCapture() {
  try {
    captureStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'window',
        width: { ideal: 1920, max: 3840 },
        height: { ideal: 1080, max: 2160 },
        frameRate: { ideal: 60, max: 60 }  
      },
      audio: false
    });

    videoElement.srcObject = captureStream;
    await videoElement.play();

    await new Promise((resolve) => {
      if (videoElement.readyState >= 2) {
        resolve();
      } else {
        videoElement.addEventListener('loadeddata', resolve, { once: true });
      }
    });

    isCapturing = true;
    emotionBuffer = [];
    lastUpdateTime = Date.now();
    document.getElementById('startButton').disabled = true;
    document.getElementById('stopButton').disabled = false;

    
    startVideoProcessing();
    startEmotionProcessing();

    captureStream.getVideoTracks()[0].onended = stopCapture;
  } catch (err) {
    console.error('Error starting capture:', err);
    stopCapture();
  }
}

function stopCapture() {
  isCapturing = false;

  if (videoFrameId) {
    cancelAnimationFrame(videoFrameId);
    videoFrameId = null;
  }

  if (emotionProcessingId) {
    clearTimeout(emotionProcessingId);
    emotionProcessingId = null;
  }

  if (captureStream) {
    captureStream.getTracks().forEach(track => track.stop());
    captureStream = null;
  }

  videoElement.srcObject = null;
  document.getElementById('startButton').disabled = false;
  document.getElementById('stopButton').disabled = true;

  emotionBuffer = [];
  currentRegion = null;
  canvasContext.clearRect(0, 0, canvasElement.width, canvasElement.height);
  emotionsContainer.innerHTML = '';
}

function startVideoProcessing() {
  const processVideoFrame = () => {
    if (!isCapturing) return;

    if (currentRegion) {
      displayFaceRegion(currentRegion);
    } else {
      canvasContext.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    }

    videoFrameId = requestAnimationFrame(processVideoFrame);
  };

  processVideoFrame();
}

function startEmotionProcessing() {
  const processEmotions = async () => {
    if (!isCapturing) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = videoElement.videoWidth;
    tempCanvas.height = videoElement.videoHeight;
    const tempContext = tempCanvas.getContext('2d');
    tempContext.drawImage(videoElement, 0, 0, tempCanvas.width, tempCanvas.height);
    
    const base64Frame = tempCanvas.toDataURL('image/jpeg');

    try {
      const response = await fetch('http://localhost:5001/analyze_screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frame: base64Frame })
      });

      if (!response.ok) throw new Error('Network response was not ok');
      
      const detections = await response.json();
      
      if (detections && detections.length > 0) {
        emotionBuffer.push(detections[0]);
        currentRegion = detections[0].region;

        const currentTime = Date.now();
        if (currentTime - lastUpdateTime >= UPDATE_INTERVAL) {
          const averagedEmotions = calculateAverageEmotions(emotionBuffer);
          updateEmotionsDisplay(averagedEmotions);
          emotionBuffer = [];
          lastUpdateTime = currentTime;
        }
      }
    } catch (err) {
      console.error('Emotion detection error:', err);
    }

    emotionProcessingId = setTimeout(processEmotions, 100); 
  };

  processEmotions();
}

function calculateAverageEmotions(detections) {
  if (!detections.length) return null;

  const totalScores = {};
  
  detections.forEach(detection => {
    Object.entries(detection.emotion_scores).forEach(([emotion, score]) => {
      totalScores[emotion] = (totalScores[emotion] || 0) + score;
    });
  });

  const averageScores = {};
  Object.entries(totalScores).forEach(([emotion, total]) => {
    averageScores[emotion] = total / detections.length;
  });

  const dominantEmotion = Object.entries(averageScores).reduce(
    (max, [emotion, score]) => score > max.score ? {emotion, score} : max,
    {emotion: '', score: -1}
  ).emotion;

  return {
    dominant_emotion: dominantEmotion,
    emotion_scores: averageScores
  };
}

function displayFaceRegion(region) {
  const { x, y, w, h } = region;
  
  const padding = 0.2;
  const paddedWidth = w * (1 + 2 * padding);
  const paddedHeight = h * (1 + 2 * padding);
  const paddedX = Math.max(0, x - (w * padding));
  const paddedY = Math.max(0, y - (h * padding));

  const sourceWidth = Math.min(paddedWidth, videoElement.videoWidth - paddedX);
  const sourceHeight = Math.min(paddedHeight, videoElement.videoHeight - paddedY);

  canvasContext.clearRect(0, 0, canvasElement.width, canvasElement.height);

  const sourceAspect = sourceWidth / sourceHeight;
  const canvasAspect = canvasElement.width / canvasElement.height;

  let drawWidth = canvasElement.width;
  let drawHeight = canvasElement.height;
  let offsetX = 0;
  let offsetY = 0;

  if (sourceAspect > canvasAspect) {
    drawHeight = drawWidth / sourceAspect;
    offsetY = (canvasElement.height - drawHeight) / 2;
  } else {
    drawWidth = drawHeight * sourceAspect;
    offsetX = (canvasElement.width - drawWidth) / 2;
  }

  canvasContext.drawImage(
    videoElement,
    paddedX,
    paddedY,
    sourceWidth,
    sourceHeight,
    offsetX,
    offsetY,
    drawWidth,
    drawHeight
  );
}

function updateEmotionsDisplay(emotions) {
  if (!emotions) {
    emotionsContainer.innerHTML = '';
    return;
  }

  const bgColor = emotionColors[emotions.dominant_emotion.toLowerCase()] || '#666';
  
  emotionsContainer.innerHTML = `
    <div class="emotion-card" style="
      background-color: ${bgColor};
      padding: 12px;
      border-radius: 4px;
      text-align: center;
      font-size: 1.2rem;
      font-weight: bold;
      color: white;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
    ">
      ${emotions.dominant_emotion.toUpperCase()}
    </div>
  `;
}