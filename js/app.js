// Estado de la aplicación
class AppState {
  constructor() {
    this.media = null;
    this.mediaType = null;
    this.isPlaying = false;
    this.isRecording = false;
    this.playbackSpeed = 1;
    
    this.config = {
      effect: 'floyd-steinberg',
      isMonochrome: false,
      useOriginalColor: false,
      colorCount: 4,
      colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
      ditherScale: 2,
      serpentineScan: false,
      diffusionStrength: 1,
      patternStrength: 0.5,
      // --- NUEVAS PROPIEDADES AÑADIDAS ---
      brightness: 0,    // Rango -100 a 100
      contrast: 1.0,    // Rango 0.0 a 2.0 (se guarda como factor)
      saturation: 1.0   // Rango 0.0 a 2.0 (se guarda como factor)
    };
    
    this.timeline = {
      markerInTime: null,
      markerOutTime: null,
      loopSection: false
    };
    
    this.metrics = { psnr: 0, ssim: 0, compression: 0, paletteSize: 0, processTime: 0 };
    this.listeners = [];
  }
  
  update(changes) { Object.assign(this, changes); this.notify(); }
  updateConfig(changes) { Object.assign(this.config, changes); this.notify(); }
  updateTimeline(changes) { Object.assign(this.timeline, changes); this.notify(); }
  updateMetrics(changes) { Object.assign(this.metrics, changes); }
  subscribe(callback) { this.listeners.push(callback); }
  notify() { this.listeners.forEach(fn => fn(this)); }
}

// Sketch p5.js
document.addEventListener('DOMContentLoaded', () => {
  const sketch = p => {
    let canvas, currentFileURL = null, updateTimelineUI = null;
    let recorder, chunks = [], originalDitherScale, originalCanvasWidth, originalCanvasHeight;
    
    const appState = new AppState();
    const bufferPool = new BufferPool();
    const colorCache = new ColorCache(p);
    const lumaLUT = new LumaLUT();
    const bayerLUT = new BayerLUT();
    const blueNoiseLUT = new BlueNoiseLUT();
    const ui = new UIManager();
    
    const fpsHistory = [], frameTimeHistory = [];
    
    p.setup = () => {
      canvas = p.createCanvas(400, 225);
      canvas.elt.getContext('2d', { willReadFrequently: true });
      canvas.parent('canvasContainer');
      p.pixelDensity(1);
      p.textFont('monospace');
      p.textStyle(p.BOLD);
      p.textAlign(p.CENTER, p.CENTER);
      p.textSize(20);
      
      const p5colors = colorCache.getColors(appState.config.colors);
      lumaLUT.build(p5colors, p);
      
      ui.init();
      initializeEventListeners();
      ui.createIconicPalettesUI(appState, colorCache, lumaLUT, p);
      ui.updateColorPickers(appState, colorCache, lumaLUT, p);
      ui.updatePanelsVisibility(appState.config);
      updatePresetList();
      setupKeyboardShortcuts();
    };
    
    p.draw = () => {
      p.background(0);
      
      if (!appState.media) {
        p.fill(128);
        p.text('Arrastra un video o imagen\npara comenzar', p.width/2, p.height/2);
        updateFrameStats();
        return;
      }
      
      if (appState.mediaType === 'video' && appState.timeline.loopSection && 
          appState.timeline.markerInTime !== null && appState.timeline.markerOutTime !== null) {
        const currentTime = appState.media.time();
        if (currentTime >= appState.timeline.markerOutTime) {
          appState.media.time(appState.timeline.markerInTime);
        }
      }
      
      const cfg = appState.config;
      const isDitheringActive = cfg.effect !== 'none';
      
      if (isDitheringActive) {
        const p5colors = colorCache.getColors(cfg.colors);
        if (lumaLUT.needsRebuild(p5colors)) lumaLUT.build(p5colors, p);
        
        const pw = Math.floor(p.width / cfg.ditherScale);
        const ph = Math.floor(p.height / cfg.ditherScale);
        const buffer = bufferPool.get(pw, ph, p);
        
        if (cfg.effect === 'posterize') {
          drawPosterize(p, buffer, appState.media, p.width, p.height, cfg, lumaLUT);
        } else if (cfg.effect === 'blue-noise') {
          drawBlueNoise(p, buffer, appState.media, p.width, p.height, cfg, lumaLUT, blueNoiseLUT);
        } else if (cfg.effect === 'variable-error') {
          drawVariableError(p, buffer, appState.media, p.width, p.height, cfg, lumaLUT);
        } else {
          drawDither(p, buffer, appState.media, p.width, p.height, cfg, lumaLUT, bayerLUT);
        }
        
        p.image(buffer, 0, 0, p.width, p.height);
      } else {
        p.image(appState.media, 0, 0, p.width, p.height);
      }
      
      if (updateTimelineUI && appState.mediaType === 'video') updateTimelineUI();
      updateFrameStats();
    };
    
    function initializeEventListeners() {
      // Drag & Drop
      document.body.addEventListener("dragover", e => {
        e.preventDefault();
        ui.elements.dropZone.classList.add("border-cyan-400");
      });
      document.body.addEventListener("dragleave", () => ui.elements.dropZone.classList.remove("border-cyan-400"));
      document.body.addEventListener("drop", e => {
        e.preventDefault();
        ui.elements.dropZone.classList.remove("border-cyan-400");
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
      });
      
      ui.elements.dropZone.addEventListener("click", () => ui.elements.fileInput.click());
      ui.elements.fileInput.addEventListener("change", e => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
      });
      
      // Controles
      ui.elements.playBtn.addEventListener("click", togglePlay);
      ui.elements.restartBtn.addEventListener("click", () => {
        if (appState.media && appState.mediaType === 'video') {
          appState.media.time(0);
          showToast('Reiniciado');
        }
      });
      
      ui.elements.effectSelect.addEventListener("change", e => {
        appState.updateConfig({ effect: e.target.value });
        ui.updatePanelsVisibility(appState.config);
      });
      
      ui.elements.monochromeToggle.addEventListener("change", e => {
        appState.updateConfig({ isMonochrome: e.target.checked });
        ui.updateColorPickers(appState, colorCache, lumaLUT, p, true);
      });
      
      const debouncedColorCountChange = debounce((value) => {
        appState.updateConfig({ colorCount: parseInt(value) });
        ui.updateColorPickers(appState, colorCache, lumaLUT, p, true);
      }, 100);
      
      ui.elements.colorCountSlider.addEventListener("input", e => {
        ui.elements.colorCountVal.textContent = e.target.value;
        debouncedColorCountChange(e.target.value);
      });
      
      ui.elements.originalColorToggle.addEventListener("change", e => {
        appState.updateConfig({ useOriginalColor: e.target.checked });
        ui.togglePaletteControls(e.target.checked);
      });

      // --- NUEVOS EVENT LISTENERS PARA AJUSTES DE IMAGEN ---
      ui.elements.brightnessSlider.addEventListener('input', e => {
        const value = parseInt(e.target.value);
        appState.updateConfig({ brightness: value });
        ui.elements.brightnessVal.textContent = value;
      });

      ui.elements.contrastSlider.addEventListener('input', e => {
        const value = parseInt(e.target.value);
        appState.updateConfig({ contrast: value / 100 });
        ui.elements.contrastVal.textContent = value;
      });

      ui.elements.saturationSlider.addEventListener('input', e => {
        const value = parseInt(e.target.value);
        appState.updateConfig({ saturation: value / 100 });
        ui.elements.saturationVal.textContent = value;
      });

      ui.elements.resetImageAdjustmentsBtn.addEventListener('click', () => {
        appState.updateConfig({ brightness: 0, contrast: 1.0, saturation: 1.0 });
        ui.elements.brightnessSlider.value = 0;
        ui.elements.contrastSlider.value = 100;
        ui.elements.saturationSlider.value = 100;
        ui.elements.brightnessVal.textContent = 0;
        ui.elements.contrastVal.textContent = 100;
        ui.elements.saturationVal.textContent = 100;
        showToast('Ajustes de imagen reseteados');
      });
      
      ui.elements.ditherScale.addEventListener("input", e => {
        appState.updateConfig({ ditherScale: parseInt(e.target.value) });
        ui.elements.ditherScaleVal.textContent = e.target.value;
      });
      
      ui.elements.serpentineToggle.addEventListener("change", e => {
        appState.updateConfig({ serpentineScan: e.target.checked });
      });
      
      ui.elements.diffusionStrengthSlider.addEventListener("input", e => {
        appState.updateConfig({ diffusionStrength: parseInt(e.target.value) / 100 });
        ui.elements.diffusionStrengthVal.textContent = e.target.value;
      });
      
      ui.elements.patternStrengthSlider.addEventListener("input", e => {
        appState.updateConfig({ patternStrength: parseInt(e.target.value) / 100 });
        ui.elements.patternStrengthVal.textContent = e.target.value;
      });
      
      // Timeline
      ui.elements.setInBtn.addEventListener('click', () => {
        if (appState.media && appState.mediaType === 'video') {
          appState.updateTimeline({ markerInTime: appState.media.time() });
          showToast(`Entrada: ${formatTime(appState.timeline.markerInTime)}`);
        }
      });
      
      ui.elements.setOutBtn.addEventListener('click', () => {
        if (appState.media && appState.mediaType === 'video') {
          appState.updateTimeline({ markerOutTime: appState.media.time() });
          showToast(`Salida: ${formatTime(appState.timeline.markerOutTime)}`);
        }
      });
      
      ui.elements.clearMarkersBtn.addEventListener('click', () => {
        appState.updateTimeline({ markerInTime: null, markerOutTime: null });
        showToast('Marcadores limpiados');
      });
      
      ui.elements.loopSectionToggle.addEventListener('change', e => {
        appState.updateTimeline({ loopSection: e.target.checked });
      });
      
      ui.elements.playbackSpeedSlider.addEventListener('input', e => {
        const speed = parseInt(e.target.value) / 100;
        appState.update({ playbackSpeed: speed });
        if (appState.media && appState.mediaType === 'video') appState.media.speed(speed);
        ui.elements.playbackSpeedVal.textContent = speed.toFixed(2);
      });
      
      document.querySelectorAll('.speed-preset').forEach(btn => {
        btn.addEventListener('click', () => {
          const speed = parseInt(btn.dataset.speed) / 100;
          ui.elements.playbackSpeedSlider.value = speed * 100;
          appState.update({ playbackSpeed: speed });
          if (appState.media && appState.mediaType === 'video') appState.media.speed(speed);
          ui.elements.playbackSpeedVal.textContent = speed.toFixed(2);
        });
      });
      
      ui.elements.prevFrameBtn.addEventListener('click', () => {
        if (!appState.media || appState.mediaType !== 'video') return;
        appState.media.pause();
        appState.update({ isPlaying: false });
        ui.elements.playBtn.textContent = 'Play';
        appState.media.time(Math.max(0, appState.media.time() - 1/30));
      });
      
      ui.elements.nextFrameBtn.addEventListener('click', () => {
        if (!appState.media || appState.mediaType !== 'video') return;
        appState.media.pause();
        appState.update({ isPlaying: false });
        ui.elements.playBtn.textContent = 'Play';
        appState.media.time(Math.min(appState.media.duration(), appState.media.time() + 1/30));
      });
      
      // Exportación
      ui.elements.recBtn.addEventListener("click", startRecording);
      ui.elements.stopBtn.addEventListener("click", stopRecording);
      ui.elements.downloadImageBtn.addEventListener("click", () => {
        if (appState.media) p.saveCanvas(canvas, `dithering_${appState.config.effect}_${Date.now()}`, 'png');
      });
      
      ui.elements.gifFpsSlider.addEventListener('input', e => {
        ui.elements.gifFpsVal.textContent = e.target.value;
      });
      
      ui.elements.gifQualitySlider.addEventListener('input', e => {
        ui.elements.gifQualityVal.textContent = e.target.value;
      });
      
      ui.elements.exportGifBtn.addEventListener('click', exportGif);
      
      ui.elements.spriteColsSlider.addEventListener('input', e => {
        ui.elements.spriteCols.textContent = e.target.value;
      });
      
      ui.elements.spriteFrameCountSlider.addEventListener('input', e => {
        ui.elements.spriteFrameCount.textContent = e.target.value;
      });
      
      ui.elements.exportSpriteBtn.addEventListener('click', () => {
        if (appState.media && appState.mediaType === 'video') {
          const cols = parseInt(ui.elements.spriteColsSlider.value);
          const frameCount = parseInt(ui.elements.spriteFrameCountSlider.value);
          exportSpriteSheet(p, appState.media, cols, frameCount);
        }
      });
      
      ui.elements.exportSequenceBtn.addEventListener('click', () => {
        if (appState.media && appState.mediaType === 'video') {
          const startTime = appState.timeline.markerInTime || 0;
          const endTime = appState.timeline.markerOutTime || appState.media.duration();
          exportPNGSequence(p, appState.media, startTime, endTime, 15);
        }
      });
      
      // Presets
      ui.elements.savePresetBtn.addEventListener("click", () => {
        const name = ui.elements.presetNameInput.value.trim();
        if (name) {
          const presets = JSON.parse(localStorage.getItem("dither_presets") || "{}");
          presets[name] = appState.config;
          localStorage.setItem("dither_presets", JSON.stringify(presets));
          ui.elements.presetNameInput.value = "";
          updatePresetList();
          showToast(`Preset "${name}" guardado`);
        }
      });
      
      ui.elements.deletePresetBtn.addEventListener("click", () => {
        const name = ui.elements.presetSelect.value;
        if (name) {
          const presets = JSON.parse(localStorage.getItem("dither_presets") || "{}");
          delete presets[name];
          localStorage.setItem("dither_presets", JSON.stringify(presets));
          updatePresetList();
          showToast(`Preset "${name}" eliminado`);
        }
      });
      
      ui.elements.presetSelect.addEventListener("change", e => {
        if (e.target.value) applyPreset(e.target.value);
      });
      
      // Modals
      ui.elements.shortcutsBtn.addEventListener('click', () => {
        ui.elements.shortcutsModal.style.display = 'flex';
      });
      
      ui.elements.closeShortcutsBtn.addEventListener('click', () => {
        ui.elements.shortcutsModal.style.display = 'none';
      });
      
      ui.elements.shortcutsModal.addEventListener('click', (e) => {
        if (e.target === ui.elements.shortcutsModal) ui.elements.shortcutsModal.style.display = 'none';
      });
      
      ui.elements.metricsBtn.addEventListener('click', () => {
        ui.elements.metricsModal.style.display = 'flex';
      });
      
      ui.elements.closeMetricsBtn.addEventListener('click', () => {
        ui.elements.metricsModal.style.display = 'none';
      });
      
      ui.elements.metricsModal.addEventListener('click', (e) => {
        if (e.target === ui.elements.metricsModal) ui.elements.metricsModal.style.display = 'none';
      });
      
      ui.elements.updateMetricsBtn.addEventListener('click', updateMetrics);
      
      ui.elements.togglePalettesBtn.addEventListener('click', () => {
        const isHidden = ui.elements.iconicPalettesContainer.classList.toggle('hidden');
        ui.elements.togglePalettesBtn.textContent = isHidden ? '▼ Mostrar' : '▲ Ocultar';
      });
    }
    
    function handleFile(file) {
      if (appState.media) {
        if (appState.mediaType === 'video') {
          appState.media.pause();
          appState.media.remove();
        }
        appState.update({ media: null, mediaType: null });
      }
      
      if (currentFileURL) {
        URL.revokeObjectURL(currentFileURL);
        currentFileURL = null;
      }
      
      const fileType = file.type;
      const isVideo = fileType.startsWith('video/');
      const isImage = fileType.startsWith('image/');
      
      if (!isVideo && !isImage) {
        showToast('Formato no soportado');
        return;
      }
      
      currentFileURL = URL.createObjectURL(file);
      appState.update({ mediaType: isVideo ? 'video' : 'image' });
      
      if (isVideo) {
        const media = p.createVideo([currentFileURL], () => {
          // Limitar resolución a 2048px
          const maxDim = 2048;
          let w = media.width;
          let h = media.height;
          
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.floor(h * (maxDim / w));
              w = maxDim;
            } else {
              w = Math.floor(w * (maxDim / h));
              h = maxDim;
            }
          }
          
          p.resizeCanvas(w, h);
          appState.update({ media, isPlaying: false });
          media.volume(0);
          media.speed(appState.playbackSpeed);
          ui.elements.playBtn.textContent = 'Play';
          ui.elements.recBtn.disabled = false;
          
          ui.elements.mediaType.textContent = 'VIDEO';
          ui.elements.mediaType.className = 'bg-blue-600 px-2 py-1 rounded text-xs';
          ui.elements.mediaDimensions.textContent = `${w}x${h} - ${formatTime(media.duration())}`;
          
          ui.elements.timelinePanel.classList.remove('hidden');
          ui.elements.gifExportPanel.classList.remove('hidden');
          ui.elements.spriteSheetPanel.classList.remove('hidden');
          ui.elements.exportSequenceBtn.classList.remove('hidden');
          
          updateTimelineUI = setupTimeline();
          ui.elements.status.textContent = 'Listo';
          showToast('Video cargado');
        });
        media.hide();
      } else {
        const media = p.loadImage(currentFileURL, () => {
          // Limitar resolución a 2048px
          const maxDim = 2048;
          let w = media.width;
          let h = media.height;
          
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.floor(h * (maxDim / w));
              w = maxDim;
            } else {
              w = Math.floor(w * (maxDim / h));
              h = maxDim;
            }
            media.resize(w, h);
          }
          
          p.resizeCanvas(w, h);
          appState.update({ media });
          ui.elements.playBtn.textContent = 'N/A';
          ui.elements.playBtn.disabled = true;
          ui.elements.recBtn.disabled = true;
          
          ui.elements.mediaType.textContent = 'IMAGEN';
          ui.elements.mediaType.className = 'bg-purple-600 px-2 py-1 rounded text-xs';
          ui.elements.mediaDimensions.textContent = `${w}x${h}`;
          
          ui.elements.timelinePanel.classList.add('hidden');
          ui.elements.gifExportPanel.classList.add('hidden');
          ui.elements.spriteSheetPanel.classList.add('hidden');
          ui.elements.exportSequenceBtn.classList.add('hidden');
          
          ui.elements.status.textContent = 'Imagen cargada';
          showToast('Imagen cargada');
        });
      }
    }
    
    function togglePlay() {
      if (!appState.media || appState.mediaType !== 'video') return;
      
      if (appState.isPlaying) {
        appState.media.pause();
        ui.elements.playBtn.textContent = 'Play';
        showToast('Pausado');
      } else {
        appState.media.loop();
        ui.elements.playBtn.textContent = 'Pause';
        showToast('Reproduciendo');
      }
      appState.update({ isPlaying: !appState.isPlaying });
    }
    
    function startRecording() {
      if (appState.isRecording || !appState.media || appState.mediaType !== 'video') return;
      
      originalDitherScale = appState.config.ditherScale;
      originalCanvasWidth = p.width;
      originalCanvasHeight = p.height;
      
      const recordScale = parseInt(ui.elements.recordQuality.value);
      appState.updateConfig({ ditherScale: recordScale });
      
      let startTime = 0;
      let endTime = appState.media.duration();
      
      const useMarkers = ui.elements.webmUseMarkersToggle && ui.elements.webmUseMarkersToggle.checked;
      
      if (useMarkers) {
        if (appState.timeline.markerInTime !== null) startTime = appState.timeline.markerInTime;
        if (appState.timeline.markerOutTime !== null) endTime = appState.timeline.markerOutTime;
      }
      
      appState.media.time(startTime);
      
      const maxDimension = 1080;
      let exportWidth = appState.media.width;
      let exportHeight = appState.media.height;
      
      const longestSide = Math.max(exportWidth, exportHeight);
      if (longestSide > maxDimension) {
        const scale = maxDimension / longestSide;
        exportWidth = Math.floor(exportWidth * scale);
        exportHeight = Math.floor(exportHeight * scale);
      }
      
      p.resizeCanvas(exportWidth, exportHeight);
      
      if (!appState.isPlaying) {
        appState.media.loop();
        appState.update({ isPlaying: true });
        ui.elements.playBtn.textContent = 'Pause';
      }
      
      appState.update({ isRecording: true });
      chunks = [];
      
      const stream = canvas.elt.captureStream(30);
      recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 12000000
      });
      
      recorder.ondataavailable = ev => { if (ev.data.size > 0) chunks.push(ev.data); };
      
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dithering_${appState.config.effect}_${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 100);
        
        appState.updateConfig({ ditherScale: originalDitherScale });
        p.resizeCanvas(originalCanvasWidth, originalCanvasHeight);
        
        ui.elements.status.textContent = 'WebM descargado';
        ui.elements.recBtn.disabled = false;
        ui.elements.stopBtn.classList.add('hidden');
        ui.elements.recIndicator.classList.add('hidden');
        showToast('Video exportado');
      };
      
      let checkInterval = null;
      if (useMarkers && appState.timeline.markerOutTime !== null) {
        checkInterval = setInterval(() => {
          if (appState.media.time() >= endTime) stopRecording();
        }, 100);
      }
      
      recorder.checkInterval = checkInterval;
      recorder.start();
      ui.elements.recBtn.disabled = true;
      ui.elements.stopBtn.classList.remove('hidden');
      ui.elements.status.textContent = 'Grabando...';
      ui.elements.recIndicator.classList.remove('hidden');
    }
    
    function stopRecording() {
      if (!appState.isRecording || !recorder) return;
      if (recorder.checkInterval) {
        clearInterval(recorder.checkInterval);
        recorder.checkInterval = null;
      }
      if (recorder.state !== 'inactive') recorder.stop();
      appState.update({ isRecording: false });
    }
    
    async function exportGif() {
      if (!appState.media || appState.mediaType !== 'video') return;
      
      const fps = parseInt(ui.elements.gifFpsSlider.value);
      const useMarkers = ui.elements.gifUseMarkersToggle.checked;
      
      let startTime = 0;
      let endTime = appState.media.duration();
      
      if (useMarkers) {
        if (appState.timeline.markerInTime !== null) startTime = appState.timeline.markerInTime;
        if (appState.timeline.markerOutTime !== null) endTime = appState.timeline.markerOutTime;
      }
      
      ui.elements.exportGifBtn.disabled = true;
      ui.elements.gifProgress.classList.remove('hidden');
      
      try {
        const blob = await exportGifCore(p, appState.media, appState.config, startTime, endTime, fps, progress => {
          const percent = Math.round(progress * 100);
          ui.elements.gifProgressText.textContent = `${percent}%`;
          ui.elements.gifProgressBar.style.width = `${percent}%`;
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dithering_${appState.config.effect}_${Date.now()}.gif`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 100);
        
        showToast('GIF exportado');
      } catch (error) {
        console.error('Error:', error);
        showToast('Error al exportar GIF');
      }
      
      ui.elements.exportGifBtn.disabled = false;
      ui.elements.gifProgress.classList.add('hidden');
    }
    
    function updateMetrics() {
      if (!appState.media) { showToast('Carga un medio primero'); return; }
      
      const origBuffer = p.createGraphics(p.width, p.height);
      origBuffer.pixelDensity(1);
      origBuffer.image(appState.media, 0, 0, p.width, p.height);
      
      const processedBuffer = p.get();
      
      const psnr = calculatePSNR(origBuffer, processedBuffer);
      const ssim = calculateSSIM(origBuffer, processedBuffer);
      const compression = calculateCompression(processedBuffer);
      
      appState.updateMetrics({
        psnr: psnr,
        ssim: ssim,
        compression: compression.ratio,
        paletteSize: appState.config.colorCount
      });
      
      $('metricPSNR').textContent = psnr === Infinity ? '∞ dB' : psnr.toFixed(2) + ' dB';
      $('metricSSIM').textContent = ssim.toFixed(4);
      $('metricCompression').textContent = compression.ratio.toFixed(2) + '% (' + compression.unique + ' colores únicos)';
      $('metricPaletteSize').textContent = appState.config.colorCount + ' colores';
      $('metricProcessTime').textContent = appState.metrics.processTime.toFixed(2) + ' ms';
      
      origBuffer.remove();
      showToast('Métricas actualizadas');
    }
    
    function setupTimeline() {
      const timeline = ui.elements.timeline;
      const scrubber = ui.elements.timelineScrubber;
      const progress = ui.elements.timelineProgress;
      const timeDisplay = ui.elements.timelineTime;
      const markerIn = ui.elements.markerIn;
      const markerOut = ui.elements.markerOut;
      
      let isDragging = false;
      let isDraggingMarker = null;
      
      timeline.addEventListener('mousedown', (e) => {
        if (e.target === markerIn || e.target === markerOut) {
          isDraggingMarker = e.target;
          return;
        }
        isDragging = true;
        updateScrubPosition(e);
      });
      
      document.addEventListener('mousemove', (e) => {
        if (isDragging) updateScrubPosition(e);
        else if (isDraggingMarker) updateMarkerPosition(e, isDraggingMarker);
      });
      
      document.addEventListener('mouseup', () => {
        isDragging = false;
        isDraggingMarker = null;
      });
      
      function updateScrubPosition(e) {
        const media = appState.media;
        if (!media) return;
        const rect = timeline.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const percent = x / rect.width;
        const time = percent * media.duration();
        media.time(time);
        updateTimelineUI();
      }
      
      function updateMarkerPosition(e, marker) {
        const media = appState.media;
        if (!media) return;
        const rect = timeline.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const percent = x / rect.width;
        const time = percent * media.duration();
        
        if (marker === markerIn) {
          appState.timeline.markerInTime = time;
          if (appState.timeline.markerOutTime !== null && time > appState.timeline.markerOutTime) {
            appState.timeline.markerOutTime = time;
          }
        } else {
          appState.timeline.markerOutTime = time;
          if (appState.timeline.markerInTime !== null && time < appState.timeline.markerInTime) {
            appState.timeline.markerInTime = time;
          }
        }
        updateTimelineUI();
      }
      
      function updateTimelineUI() {
        const media = appState.media;
        if (!media || media.duration() === 0) return;
        
        const currentTime = media.time();
        const duration = media.duration();
        const percent = (currentTime / duration) * 100;
        
        scrubber.style.left = percent + '%';
        progress.style.width = percent + '%';
        timeDisplay.textContent = formatTime(currentTime);
        
        if (appState.timeline.markerInTime !== null) {
          const inPercent = (appState.timeline.markerInTime / duration) * 100;
          markerIn.style.left = inPercent + '%';
          markerIn.style.display = 'block';
        } else {
          markerIn.style.display = 'none';
        }
        
        if (appState.timeline.markerOutTime !== null) {
          const outPercent = (appState.timeline.markerOutTime / duration) * 100;
          markerOut.style.left = outPercent + '%';
          markerOut.style.display = 'block';
        } else {
          markerOut.style.display = 'none';
        }
      }
      
      return updateTimelineUI;
    }
    
    function setupKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
        
        const key = e.key.toLowerCase();
        
        switch(key) {
          case ' ': e.preventDefault(); togglePlay(); break;
          case 'arrowleft': e.preventDefault(); ui.elements.prevFrameBtn.click(); break;
          case 'arrowright': e.preventDefault(); ui.elements.nextFrameBtn.click(); break;
          case 'i': e.preventDefault(); ui.elements.setInBtn.click(); break;
          case 'o': e.preventDefault(); ui.elements.setOutBtn.click(); break;
          case 'r': e.preventDefault(); if (!ui.elements.recBtn.disabled) startRecording(); break;
          case 's': e.preventDefault(); if (!ui.elements.stopBtn.classList.contains('hidden')) stopRecording(); break;
          case 'd': e.preventDefault(); ui.elements.downloadImageBtn.click(); break;
          case 'f': e.preventDefault(); toggleFullscreen(); break;
          case 'm': e.preventDefault(); ui.elements.metricsModal.style.display = 'flex'; break;
          case '?': e.preventDefault(); ui.elements.shortcutsModal.style.display = 'flex'; break;
          case 'escape':
            ui.elements.shortcutsModal.style.display = 'none';
            ui.elements.metricsModal.style.display = 'none';
            break;
        }
      });
    }
    
    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        showToast('Pantalla completa');
      } else {
        document.exitFullscreen();
        showToast('Salir de pantalla completa');
      }
    }
    
    function updatePresetList() {
      const presets = JSON.parse(localStorage.getItem("dither_presets") || "{}");
      ui.elements.presetSelect.innerHTML = '<option value="">Cargar Preset...</option>';
      for (const name in presets) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        ui.elements.presetSelect.appendChild(option);
      }
    }
    
    function applyPreset(name) {
      const presets = JSON.parse(localStorage.getItem("dither_presets") || "{}");
      if (!presets[name]) return;
      
      const cfg = presets[name];
      appState.updateConfig(cfg);
      
      ui.elements.effectSelect.value = cfg.effect;
      ui.elements.monochromeToggle.checked = cfg.isMonochrome;
      ui.elements.originalColorToggle.checked = cfg.useOriginalColor;
      ui.elements.colorCountSlider.value = cfg.colorCount;
      ui.elements.ditherScale.value = cfg.ditherScale;
      ui.elements.serpentineToggle.checked = cfg.serpentineScan;
      ui.elements.diffusionStrengthSlider.value = cfg.diffusionStrength * 100;
      ui.elements.patternStrengthSlider.value = cfg.patternStrength * 100;
      
      // --- ACTUALIZAR UI DE AJUSTES DE IMAGEN AL CARGAR PRESET ---
      ui.elements.brightnessSlider.value = cfg.brightness || 0;
      ui.elements.contrastSlider.value = (cfg.contrast || 1.0) * 100;
      ui.elements.saturationSlider.value = (cfg.saturation || 1.0) * 100;
      ui.elements.brightnessVal.textContent = cfg.brightness || 0;
      ui.elements.contrastVal.textContent = (cfg.contrast || 1.0) * 100;
      ui.elements.saturationVal.textContent = (cfg.saturation || 1.0) * 100;

      ui.elements.colorCountVal.textContent = cfg.colorCount;
      ui.elements.ditherScaleVal.textContent = cfg.ditherScale;
      ui.elements.diffusionStrengthVal.textContent = cfg.diffusionStrength * 100;
      ui.elements.patternStrengthVal.textContent = cfg.patternStrength * 100;
      
      ui.updateColorPickers(appState, colorCache, lumaLUT, p);
      ui.updatePanelsVisibility(cfg);
      ui.togglePaletteControls(cfg.useOriginalColor);
      showToast(`Preset "${name}" cargado`);
    }
    
    function updateFrameStats() {
      const fps = p.frameRate();
      fpsHistory.push(fps);
      frameTimeHistory.push(p.deltaTime);
      
      if (fpsHistory.length > 30) {
        fpsHistory.shift();
        frameTimeHistory.shift();
      }
      
      const avgFps = fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length;
      const avgFt = frameTimeHistory.reduce((a, b) => a + b, 0) / frameTimeHistory.length;
      
      ui.elements.fps.textContent = isNaN(avgFps) ? "--" : Math.round(avgFps);
      ui.elements.frameTime.textContent = isNaN(avgFt) ? "--" : avgFt.toFixed(1);
      
      appState.updateMetrics({ processTime: avgFt });
      
      if (appState.mediaType === 'video' && appState.media && appState.media.duration() > 0) {
        ui.elements.timeDisplay.textContent = `${formatTime(appState.media.time())} / ${formatTime(appState.media.duration())}`;
      } else {
        ui.elements.timeDisplay.textContent = appState.mediaType === 'image' ? 'Imagen Estática' : '00:00 / 00:00';
      }
      
      if (appState.playbackSpeed !== 1 && appState.mediaType === 'video') {
        ui.elements.speedDisplay.classList.remove('hidden');
        ui.elements.speedDisplay.querySelector('span').textContent = appState.playbackSpeed.toFixed(2) + 'x';
      } else {
        ui.elements.speedDisplay.classList.add('hidden');
      }
      
      ui.elements.effectName.textContent = ALGORITHM_NAMES[appState.config.effect] || "Desconocido";
    }
  };
  
  new p5(sketch);
});
