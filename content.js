const emotionColors = {
    happy: '#4CAF50',
    sad: '#2196F3',
    angry: '#F44336',
    fear: '#9C27B0',
    surprise: '#FFC107',
    disgust: '#795548',
    neutral: '#9E9E9E'
  };
  
  async function startContinuousCapture() {
    try {
      window._emotionDetectorStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'window',
          width: { ideal: 1920, max: 3840 },
          height: { ideal: 1080, max: 2160 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: false
      });
  
      const videoElement = document.createElement('video');
      videoElement.srcObject = window._emotionDetectorStream;
      await new Promise(resolve => {
        videoElement.onloadedmetadata = resolve;
      });
      videoElement.play();
  
      const processFrame = async () => {
        if (!window._emotionDetectorRunning) return;
  
        const canvas = window._emotionDetectorCanvas;
        const context = canvas.getContext('2d');
        
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        const base64Frame = canvas.toDataURL('image/jpeg');
  
        try {
          const response = await fetch('http://localhost:5001/analyze_screen', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ frame: base64Frame })
          });
  
          if (!response.ok) throw new Error('Network response was not ok');
  
          const detectedEmotions = await response.json();
          drawFacesWithEmotions(detectedEmotions, context, canvas);
        } catch (error) {
          console.error('Emotion detection error:', error);
        }
  
        window._emotionDetectorAnimationFrame = requestAnimationFrame(processFrame);
      };
  
      processFrame();
  
      window._emotionDetectorStream.getVideoTracks()[0].onended = stopDetection;
    } catch (error) {
      console.error('Capture initialization error:', error);
      stopDetection();
    }
  }
  
  function drawFacesWithEmotions(detectedEmotions, context, canvas) {
    context.clearRect(0, 0, canvas.width, canvas.height);
  
    detectedEmotions.forEach(emotion => {
      const { x, y, w, h } = emotion.region;
      const color = emotionColors[emotion.dominant_emotion.toLowerCase()];
      
      context.strokeStyle = color;
      context.lineWidth = 4;
      context.shadowBlur = 10;
      context.shadowColor = color;
      context.strokeRect(x, y, w, h);
  
      context.font = '16px Arial';
      context.fillStyle = color;
      context.fillText(
        emotion.dominant_emotion.toUpperCase(),
        x,
        y - 10
      );
    });
  }