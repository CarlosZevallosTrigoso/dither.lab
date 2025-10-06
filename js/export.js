// ============================================================================
// FUNCIONES DE EXPORTACIÓN
// ============================================================================

async function exportGifCore(p, media, config, startTime, endTime, fps, progressCallback) {
  const duration = endTime - startTime;
  const frameCount = Math.ceil(duration * fps);
  const frameDelay = 1000 / fps;
  
  return new Promise((resolve, reject) => {
    const gif = new GIF({
      workers: 2,
      quality: parseInt(document.getElementById('gifQualitySlider').value),
      width: p.width,
      height: p.height,
      workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'
    });
    
    gif.on('finished', blob => resolve(blob));
    gif.on('progress', prog => {
      if (progressCallback) progressCallback(prog);
    });
    
    (async () => {
      const wasPlaying = media.elt && !media.elt.paused;
      if (wasPlaying) media.pause();
      
      for (let i = 0; i < frameCount; i++) {
        const time = startTime + (i / fps);
        media.time(time);
        
        // Esperar a que el frame se cargue
        await new Promise(r => setTimeout(r, 50));
        
        // Forzar redibujado en p5
        p.redraw();
        await new Promise(r => setTimeout(r, 50));
        
        // Capturar canvas
        const canvas = p.canvas.elt;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, p.width, p.height);
        
        gif.addFrame(imageData, {delay: frameDelay});
        
        if (progressCallback) {
          progressCallback((i + 1) / frameCount * 0.5); // 50% durante captura
        }
      }
      
      if (wasPlaying) media.loop();
      
      gif.render();
    })().catch(reject);
  });
}

async function exportSpriteSheet(p, media, cols, frameCount) {
  const duration = media.duration();
  const frameWidth = p.width;
  const frameHeight = p.height;
  const rows = Math.ceil(frameCount / cols);
  
  const sheet = p.createGraphics(frameWidth * cols, frameHeight * rows);
  sheet.pixelDensity(1);
  
  const wasPlaying = media.elt && !media.elt.paused;
  if (wasPlaying) media.pause();
  
  for (let i = 0; i < frameCount; i++) {
    const time = (i / frameCount) * duration;
    media.time(time);
    await new Promise(r => setTimeout(r, 100));
    
    const col = i % cols;
    const row = Math.floor(i / cols);
    sheet.image(p.get(), col * frameWidth, row * frameHeight);
  }
  
  sheet.save(`sprite_sheet_${cols}x${rows}_${Date.now()}.png`);
  if (wasPlaying) media.loop();
}

async function exportPNGSequence(p, media, startTime, endTime, fps) {
  const duration = endTime - startTime;
  const frameCount = Math.ceil(duration * fps);
  
  const wasPlaying = media.elt && !media.elt.paused;
  if (wasPlaying) media.pause();
  
  for (let i = 0; i < frameCount; i++) {
    const time = startTime + (i / fps);
    media.time(time);
    await new Promise(r => setTimeout(r, 100));
    p.saveCanvas(`frame_${String(i).padStart(4, '0')}`, 'png');
    await new Promise(r => setTimeout(r, 50));
  }
  
  if (wasPlaying) media.loop();
}
