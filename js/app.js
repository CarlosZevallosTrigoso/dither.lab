// ============================================================================
// OPTIMIZACIÓN FASE 1: Circular Buffer para historial de FPS
// ============================================================================
class CircularBuffer {
  constructor(size) {
    this.buffer = new Float32Array(size);
    this.index = 0;
    this.size = size;
    this.filled = false;
  }
  
  push(value) {
    this.buffer[this.index] = value;
    this.index = (this.index + 1) % this.size;
    if (this.index === 0) this.filled = true;
  }
  
  average() {
    const count = this.filled ? this.size : this.index;
    if (count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < count; i++) sum += this.buffer[i];
    return sum / count;
  }
  
  clear() {
    this.index = 0;
    this.filled = false;
  }
}

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
      colors: [],
      ditherScale: 2,
      serpentineScan: false,
      diffusionStrength: 1,
      patternStrength: 0.5,
      brightness: 0,
      contrast: 1.0,
      saturation: 1.0,
      curvesLUTs: null,
      // NUEVO: Estado para la modulación
      diffusionStrengthMod: 'none', // 'none', 'luma-inverted', 'luma-normal'
      diffusionStrengthMin: 0.3,
      diffusionStrengthMax: 1.0,
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
    
    let needsRedraw = true;
    
    const appState = new AppState();
    const bufferPool = new BufferPool();
    const colorCache = new ColorCache(p);
    const lumaLUT = new LumaLUT();
    const bayerLUT = new BayerLUT();
    const blueNoiseLUT = new BlueNoiseLUT();
    const ui = new UIManager();
    const curvesEditor = new CurvesEditor('curvesCanvas');
    
    const fpsHistory = new CircularBuffer(30);
    const frameTimeHistory = new CircularBuffer(30);
    
    window.triggerRedraw = triggerRedraw = () => {
      needsRedraw = true;
      p.redraw();
    };
    
    p.setup = () => {
      canvas = p.createCanvas(400, 225);
      canvas.elt.getContext('2d', { willReadFrequently: true, alpha: false });
      canvas.parent('canvasContainer');
      p.pixelDensity(1);
      p.textFont('monospace');
      p.textStyle(p.BOLD);
      p.textAlign(p.CENTER, p.CENTER);
      p.textSize(20);
      
      p.noLoop();
      
      const p5colors = colorCache.getColors(appState.config.colors);
      lumaLUT.build(p5colors, p);
      
      ui.init();
      initializeEventListeners();
      ui.updateColorPickers(appState, colorCache, lumaLUT, p);
      ui.updatePanelsVisibility(appState.config);
      updatePresetList();
      setupKeyboardShortcuts();
      
      triggerRedraw();
    };
    
    p.draw = () => {
      if (appState.mediaType === 'image' && !needsRedraw) {
        return;
      }
      
      p.background(0);
      
      if (!appState.media) {
        p.fill(128);
        p.text('Arrastra un video o imagen\npara comenzar', p.width/2, p.height/2);
        updateFrameStats();
        needsRedraw = false;
        return;
      }
      
      if (appState.mediaType === 'video' && appState.timeline.loopSection && 
          appState.timeline.markerInTime !== null && appState.timeline.markerOutTime !== null) {
        const currentTime = appState.media.time();
        if (currentTime >= appState.timeline.markerOutTime) {
          appState.media.time(appState.timeline.markerInTime);
        }
      }
      
      appState.updateConfig({ curvesLUTs: curvesEditor.getAllLUTs() });

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
        const buffer = bufferPool.get(p.width, p.height, p);
        buffer.image(appState.media, 0, 0, p.width, p.height);
        buffer.loadPixels();
        applyImageAdjustments(buffer.pixels, cfg);
        buffer.updatePixels();
        p.image(buffer, 0, 0, p.width, p.height);
      }
      
      if (updateTimelineUI && appState.mediaType === 'video') updateTimelineUI();
      updateFrameStats();
      
      if (appState.mediaType === 'image') {
        needsRedraw = false;
      }
    };

    async function generatePaletteFromMedia(media, colorCount) {
        ui.elements.status.textContent = 'Analizando colores...';
        showToast('Generando paleta desde el medio...');

        const tempCanvas = p.createGraphics(100, 100);
        tempCanvas.pixelDensity(1);

        if (appState.mediaType === 'video') {
            media.pause();
            media.time(0);
            await new Promise(r => setTimeout(r, 200));
        }
        tempCanvas.image(media, 0, 0, tempCanvas.width, tempCanvas.height);
        tempCanvas.loadPixels();
        
        const pixels = [];
        for (let i = 0; i < tempCanvas.pixels.length; i += 4) {
            pixels.push([tempCanvas.pixels[i], tempCanvas.pixels[i+1], tempCanvas.pixels[i+2]]);
        }

        const colorDist = (c1, c2) => {
          const dr = c1[0] - c2[0];
          const dg = c1[1] - c2[1];
          const db = c1[2] - c2[2];
          return Math.sqrt(dr * dr + dg * dg + db * db);
        };
        
        let centroids = [];
        centroids.push([...pixels[Math.floor(Math.random() * pixels.length)]]);
        
        while (centroids.length < colorCount) {
          const distances = pixels.map(p => {
            let minDist = Infinity;
            for (const c of centroids) {
              minDist = Math.min(minDist, colorDist(p, c));
            }
            return minDist * minDist;
          });
          
          const sumDist = distances.reduce((a, b) => a + b, 0);
          let rand = Math.random() * sumDist;
          
          for (let i = 0; i < pixels.length; i++) {
            rand -= distances[i];
            if (rand <= 0) {
              centroids.push([...pixels[i]]);
              break;
            }
          }
        }
        
        const assignments = new Array(pixels.length);
        let previousCentroids = null;
        
        const centroidsEqual = (a, b, threshold = 1) => {
          return a.every((c, i) => 
            Math.abs(c[0] - b[i][0]) < threshold &&
            Math.abs(c[1] - b[i][1]) < threshold &&
            Math.abs(c[2] - b[i][2]) < threshold
          );
        };
        
        for (let iter = 0; iter < 10; iter++) {
            for (let i = 0; i < pixels.length; i++) {
                let minDist = Infinity;
                let bestCentroid = 0;
                for (let j = 0; j < centroids.length; j++) {
                    const dist = colorDist(pixels[i], centroids[j]);
                    if (dist < minDist) {
                        minDist = dist;
                        bestCentroid = j;
                    }
                }
                assignments[i] = bestCentroid;
            }

            const newCentroids = new Array(colorCount).fill(0).map(() => [0,0,0]);
            const counts = new Array(colorCount).fill(0);
            
            for (let i = 0; i < pixels.length; i++) {
                const centroidIndex = assignments[i];
                newCentroids[centroidIndex][0] += pixels[i][0];
                newCentroids[centroidIndex][1] += pixels[i][1];
                newCentroids[centroidIndex][2] += pixels[i][2];
                counts[centroidIndex]++;
            }

            for (let i = 0; i < centroids.length; i++) {
                if (counts[i] > 0) {
                    centroids[i] = [
                        Math.round(newCentroids[i][0] / counts[i]),
                        Math.round(newCentroids[i][1] / counts[i]),
                        Math.round(newCentroids[i][2] / counts[i])
                    ];
                }
            }
            
            if (previousCentroids && centroidsEqual(centroids, previousCentroids)) {
                console.log(`K-Means convergió en ${iter + 1} iteraciones`);
                break;
            }
            previousCentroids = centroids.map(c => [...c]);
        }
        
        tempCanvas.remove();
        
        const toHex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
        centroids.sort((a,b) => (a[0]*0.299 + a[1]*0.587 + a[2]*0.114) - (b[0]*0.299 + b[1]*0.587 + b[2]*0.114));

        return centroids.map(toHex);
    }
    
    function calculateCanvasDimensions(mediaWidth, mediaHeight) {
      const container = document.getElementById('canvasContainer');
      let containerWidth = container.clientWidth || window.innerWidth;
      let containerHeight = container.clientHeight || window.innerHeight;
      
      if (containerWidth < 100) containerWidth = 800;
      if (containerHeight < 100) containerHeight = 600;
      
      const padding = 64;
      const availableWidth = containerWidth - padding;
      const availableHeight = containerHeight - padding;
      
      if (availableWidth <= 0 || availableHeight <= 0) {
        return { width: 400, height: 225 };
      }
      
      const mediaAspect = mediaWidth / mediaHeight;
      const containerAspect = availableWidth / availableHeight;
      
      let canvasW, canvasH;
      
      if (mediaAspect > containerAspect) {
        canvasW = Math.min(mediaWidth, availableWidth);
        canvasH = canvasW / mediaAspect;
      } else {
        canvasH = Math.min(mediaHeight, availableHeight);
        canvasW = canvasH * mediaAspect;
      }
      
      canvasW = Math.max(100, Math.floor(canvasW));
      canvasH = Math.max(100, Math.floor(canvasH));
      
      return { width: canvasW, height: canvasH };
    }

    function initializeEventListeners() {
      // Drag & Drop
      ui.elements.dropZone.addEventListener("click", () => ui.elements.fileInput.click());
      ui.elements.fileInput.addEventListener("change", e => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
      });
      document.body.addEventListener("dragover", e => { e.preventDefault(); ui.elements.dropZone.classList.add("border-cyan-400"); });
      document.body.addEventListener("dragleave", () => ui.elements.dropZone.classList.remove("border-cyan-400"));
      document.body.addEventListener("drop", e => {
        e.preventDefault();
        ui.elements.dropZone.classList.remove("border-cyan-400");
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
      });
      
      // Controles
      ui.elements.playBtn.addEventListener("click", togglePlay);
      ui.elements.restartBtn.addEventListener("click", () => {
        if (appState.media && appState.mediaType === 'video') { appState.media.time(0); setTimeout(triggerRedraw, 50); showToast('Reiniciado'); }
      });
      
      ui.elements.effectSelect.addEventListener("change", e => {
        appState.updateConfig({ effect: e.target.value });
        ui.updatePanelsVisibility(appState.config);
        triggerRedraw();
      });
      
      ui.elements.monochromeToggle.addEventListener("change", e => {
        appState.updateConfig({ isMonochrome: e.target.checked });
        ui.updateColorPickers(appState, colorCache, lumaLUT, p, true);
        triggerRedraw();
      });
      
      const debouncedColorCountChange = debounce((value) => {
        appState.updateConfig({ colorCount: parseInt(value) });
        ui.updateColorPickers(appState, colorCache, lumaLUT, p, true);
        triggerRedraw();
      }, 100);
      ui.elements.colorCountSlider.addEventListener("input", e => {
        ui.elements.colorCountVal.textContent = e.target.value;
        debouncedColorCountChange(e.target.value);
      });
      
      ui.elements.originalColorToggle.addEventListener("change", e => {
        appState.updateConfig({ useOriginalColor: e.target.checked });
        ui.togglePaletteControls(e.target.checked);
        triggerRedraw();
      });

      const brightnessHandler = throttle(e => {
        const value = parseInt(e.target.value);
        appState.updateConfig({ brightness: value });
        ui.elements.brightnessVal.textContent = value;
        triggerRedraw();
      }, 16);
      const contrastHandler = throttle(e => {
        const value = parseInt(e.target.value);
        appState.updateConfig({ contrast: value / 100 });
        ui.elements.contrastVal.textContent = value;
        triggerRedraw();
      }, 16);
      const saturationHandler = throttle(e => {
        const value = parseInt(e.target.value);
        appState.updateConfig({ saturation: value / 100 });
        ui.elements.saturationVal.textContent = value;
        triggerRedraw();
      }, 16);
      ui.elements.brightnessSlider.addEventListener('input', brightnessHandler);
      ui.elements.contrastSlider.addEventListener('input', contrastHandler);
      ui.elements.saturationSlider.addEventListener('input', saturationHandler);

      ui.elements.resetImageAdjustmentsBtn.addEventListener('click', () => {
        appState.updateConfig({ brightness: 0, contrast: 1.0, saturation: 1.0 });
        ui.elements.brightnessSlider.value = 0;
        ui.elements.contrastSlider.value = 100;
        ui.elements.saturationSlider.value = 100;
        ui.elements.brightnessVal.textContent = 0;
        ui.elements.contrastVal.textContent = 100;
        ui.elements.saturationVal.textContent = 100;
        curvesEditor.resetAllChannels();
        triggerRedraw();
        showToast('Ajustes de imagen reseteados');
      });
      
      const toggleCurvesBtn = document.getElementById('toggleCurvesBtn');
      const basicControls = document.getElementById('basicImageControls');
      const curvesEditorEl = document.getElementById('curvesEditor');
      toggleCurvesBtn.addEventListener('click', () => {
        basicControls.classList.toggle('hidden');
        curvesEditorEl.classList.toggle('hidden');
        if (!curvesEditorEl.classList.contains('hidden')) { curvesEditor.render(); }
      });
      
      document.querySelectorAll('.curve-channel-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('.curve-channel-btn').forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
          curvesEditor.setChannel(e.target.dataset.channel);
        });
      });
      document.getElementById('resetCurveBtn').addEventListener('click', () => { curvesEditor.resetChannel(curvesEditor.currentChannel); triggerRedraw(); });
      document.getElementById('resetAllCurvesBtn').addEventListener('click', () => { curvesEditor.resetAllChannels(); triggerRedraw(); });

      const ditherScaleHandler = throttle(e => {
        appState.updateConfig({ ditherScale: parseInt(e.target.value) });
        ui.elements.ditherScaleVal.textContent = e.target.value;
        triggerRedraw();
      }, 16);
      ui.elements.ditherScale.addEventListener("input", ditherScaleHandler);
      
      ui.elements.serpentineToggle.addEventListener("change", e => {
        appState.updateConfig({ serpentineScan: e.target.checked });
        triggerRedraw();
      });
      
      const diffusionHandler = throttle(e => {
        appState.updateConfig({ diffusionStrength: parseInt(e.target.value) / 100 });
        ui.elements.diffusionStrengthVal.textContent = e.target.value;
        triggerRedraw();
      }, 16);
      ui.elements.diffusionStrengthSlider.addEventListener("input", diffusionHandler);
      
      const patternHandler = throttle(e => {
        appState.updateConfig({ patternStrength: parseInt(e.target.value) / 100 });
        ui.elements.patternStrengthVal.textContent = e.target.value;
        triggerRedraw();
      }, 16);
      ui.elements.patternStrengthSlider.addEventListener("input", patternHandler);
      
      // NUEVO: Listeners para modulación
      const diffusionModSource = document.getElementById('diffusionModulationSource');
      const diffusionModControls = document.getElementById('diffusionModulationControls');
      const diffusionStrengthMinSlider = document.getElementById('diffusionStrengthMinSlider');
      const diffusionStrengthMaxSlider = document.getElementById('diffusionStrengthMaxSlider');
      const diffusionStrengthMinVal = document.getElementById('diffusionStrengthMinVal');
      const diffusionStrengthMaxVal = document.getElementById('diffusionStrengthMaxVal');

      diffusionModSource.addEventListener('change', (e) => {
        const value = e.target.value;
        appState.updateConfig({ diffusionStrengthMod: value });
        if (value === 'none') {
          diffusionModControls.classList.add('hidden');
        } else {
          diffusionModControls.classList.remove('hidden');
        }
        triggerRedraw();
      });

      const minStrengthHandler = throttle(e => {
          const value = parseInt(e.target.value);
          appState.updateConfig({ diffusionStrengthMin: value / 100 });
          diffusionStrengthMinVal.textContent = value;
          triggerRedraw();
      }, 16);
      diffusionStrengthMinSlider.addEventListener('input', minStrengthHandler);
      
      const maxStrengthHandler = throttle(e => {
          const value = parseInt(e.target.value);
          appState.updateConfig({ diffusionStrengthMax: value / 100 });
          diffusionStrengthMaxVal.textContent = value;
          triggerRedraw();
      }, 16);
      diffusionStrengthMaxSlider.addEventListener('input', maxStrengthHandler);
      
      // Timeline y resto de listeners...
      // (El resto del código de esta función permanece igual)
      ui.elements.setInBtn.addEventListener('click', () => { if (appState.media && appState.mediaType === 'video') { appState.updateTimeline({ markerInTime: appState.media.time() }); showToast(`Entrada: ${formatTime(appState.timeline.markerInTime)}`); } });
      ui.elements.setOutBtn.addEventListener('click', () => { if (appState.media && appState.mediaType === 'video') { appState.updateTimeline({ markerOutTime: appState.media.time() }); showToast(`Salida: ${formatTime(appState.timeline.markerOutTime)}`); } });
      ui.elements.clearMarkersBtn.addEventListener('click', () => { appState.updateTimeline({ markerInTime: null, markerOutTime: null }); showToast('Marcadores limpiados'); });
      ui.elements.loopSectionToggle.addEventListener('change', e => { appState.updateTimeline({ loopSection: e.target.checked }); });
      ui.elements.playbackSpeedSlider.addEventListener('input', e => { const speed = parseInt(e.target.value) / 100; appState.update({ playbackSpeed: speed }); if (appState.media && appState.mediaType === 'video') appState.media.speed(speed); ui.elements.playbackSpeedVal.textContent = speed.toFixed(2); });
      document.querySelectorAll('.speed-preset').forEach(btn => { btn.addEventListener('click', () => { const speed = parseInt(btn.dataset.speed) / 100; ui.elements.playbackSpeedSlider.value = speed * 100; appState.update({ playbackSpeed: speed }); if (appState.media && appState.mediaType === 'video') appState.media.speed(speed); ui.elements.playbackSpeedVal.textContent = speed.toFixed(2); }); });
      ui.elements.prevFrameBtn.addEventListener('click', () => { if (!appState.media || appState.mediaType !== 'video') return; appState.media.pause(); appState.update({ isPlaying: false }); ui.elements.playBtn.textContent = 'Play'; appState.media.time(Math.max(0, appState.media.time() - 1/30)); setTimeout(triggerRedraw, 50); });
      ui.elements.nextFrameBtn.addEventListener('click', () => { if (!appState.media || appState.mediaType !== 'video') return; appState.media.pause(); appState.update({ isPlaying: false }); ui.elements.playBtn.textContent = 'Play'; appState.media.time(Math.min(appState.media.duration(), appState.media.time() + 1/30)); setTimeout(triggerRedraw, 50); });
      ui.elements.recBtn.addEventListener("click", startRecording);
      ui.elements.stopBtn.addEventListener("click", stopRecording);
      ui.elements.downloadImageBtn.addEventListener("click", () => { if (appState.media) p.saveCanvas(canvas, `dithering_${appState.config.effect}_${Date.now()}`, 'png'); });
      ui.elements.gifFpsSlider.addEventListener('input', e => { ui.elements.gifFpsVal.textContent = e.target.value; });
      ui.elements.gifQualitySlider.addEventListener('input', e => { ui.elements.gifQualityVal.textContent = e.target.value; });
      ui.elements.exportGifBtn.addEventListener('click', exportGif);
      ui.elements.spriteColsSlider.addEventListener('input', e => { ui.elements.spriteCols.textContent = e.target.value; });
      ui.elements.spriteFrameCountSlider.addEventListener('input', e => { ui.elements.spriteFrameCount.textContent = e.target.value; });
      ui.elements.exportSpriteBtn.addEventListener('click', () => { if (appState.media && appState.mediaType === 'video') { const cols = parseInt(ui.elements.spriteColsSlider.value); const frameCount = parseInt(ui.elements.spriteFrameCountSlider.value); exportSpriteSheet(p, appState.media, cols, frameCount); } });
      ui.elements.exportSequenceBtn.addEventListener('click', () => { if (appState.media && appState.mediaType === 'video') { const startTime = appState.timeline.markerInTime || 0; const endTime = appState.timeline.markerOutTime || appState.media.duration(); exportPNGSequence(p, appState.media, startTime, endTime, 15); } });
      ui.elements.savePresetBtn.addEventListener("click", () => { const name = ui.elements.presetNameInput.value.trim(); if (name) { const presets = JSON.parse(localStorage.getItem("dither_presets") || "{}"); presets[name] = { ...appState.config, curves: curvesEditor.curves }; localStorage.setItem("dither_presets", JSON.stringify(presets)); ui.elements.presetNameInput.value = ""; updatePresetList(); showToast(`Preset "${name}" guardado`); } });
      ui.elements.deletePresetBtn.addEventListener("click", () => { const name = ui.elements.presetSelect.value; if (name) { const presets = JSON.parse(localStorage.getItem("dither_presets") || "{}"); delete presets[name]; localStorage.setItem("dither_presets", JSON.stringify(presets)); updatePresetList(); showToast(`Preset "${name}" eliminado`); } });
      ui.elements.presetSelect.addEventListener("change", e => { if (e.target.value) applyPreset(e.target.value); });
      ui.elements.shortcutsBtn.addEventListener('click', () => { ui.elements.shortcutsModal.style.display = 'flex'; });
      ui.elements.closeShortcutsBtn.addEventListener('click', () => { ui.elements.shortcutsModal.style.display = 'none'; });
      ui.elements.shortcutsModal.addEventListener('click', (e) => { if (e.target === ui.elements.shortcutsModal) ui.elements.shortcutsModal.style.display = 'none'; });
      ui.elements.metricsBtn.addEventListener('click', () => { ui.elements.metricsModal.style.display = 'flex'; });
      ui.elements.closeMetricsBtn.addEventListener('click', () => { ui.elements.metricsModal.style.display = 'none'; });
      ui.elements.metricsModal.addEventListener('click', (e) => { if (e.target === ui.elements.metricsModal) ui.elements.metricsModal.style.display = 'none'; });
      ui.elements.updateMetricsBtn.addEventListener('click', updateMetrics);
    }
    
    // ...handleFile, togglePlay, etc.
    async function handleFile(file) {
      if (appState.media) {
        if (appState.mediaType === 'video') { appState.media.pause(); appState.media.remove(); }
        appState.update({ media: null, mediaType: null });
      }
      if (currentFileURL) { URL.revokeObjectURL(currentFileURL); currentFileURL = null; }
      const fileType = file.type;
      const isVideo = fileType.startsWith('video/');
      const isImage = fileType.startsWith('image/');
      if (!isVideo && !isImage) { showToast('Formato no soportado'); return; }
      currentFileURL = URL.createObjectURL(file);
      appState.update({ mediaType: isVideo ? 'video' : 'image' });
      if (isVideo) {
        const media = p.createVideo([currentFileURL], async () => {
          let w = media.width, h = media.height;
          const { width: canvasW, height: canvasH } = calculateCanvasDimensions(w, h);
          p.resizeCanvas(canvasW, canvasH);
          appState.update({ media, isPlaying: false });
          const newPalette = await generatePaletteFromMedia(media, appState.config.colorCount);
          appState.updateConfig({ colors: newPalette });
          ui.updateColorPickers(appState, colorCache, lumaLUT, p);
          media.volume(0);
          media.speed(appState.playbackSpeed);
          ui.elements.playBtn.textContent = 'Play';
          ui.elements.playBtn.disabled = false;
          ui.elements.recBtn.disabled = false;
          ui.elements.mediaType.textContent = 'VIDEO';
          ui.elements.mediaDimensions.textContent = `${media.width}x${media.height} - ${formatTime(media.duration())}`;
          ui.elements.timelinePanel.classList.remove('hidden');
          ui.elements.gifExportPanel.classList.remove('hidden');
          ui.elements.spriteSheetPanel.classList.remove('hidden');
          ui.elements.exportSequenceBtn.classList.remove('hidden');
          updateTimelineUI = setupTimeline();
          ui.elements.status.textContent = 'Listo';
          p.loop();
          showToast('Video cargado');
          triggerRedraw();
        });
        media.hide();
      } else {
        const media = p.loadImage(currentFileURL, async () => {
          let w = media.width, h = media.height;
          const { width: canvasW, height: canvasH } = calculateCanvasDimensions(w, h);
          p.resizeCanvas(canvasW, canvasH);
          appState.update({ media });
          const newPalette = await generatePaletteFromMedia(media, appState.config.colorCount);
          appState.updateConfig({ colors: newPalette });
          ui.updateColorPickers(appState, colorCache, lumaLUT, p);
          ui.elements.playBtn.textContent = 'N/A';
          ui.elements.playBtn.disabled = true;
          ui.elements.recBtn.disabled = true;
          ui.elements.mediaType.textContent = 'IMAGEN';
          ui.elements.mediaDimensions.textContent = `${w}x${h}`;
          ui.elements.timelinePanel.classList.add('hidden');
          ui.elements.gifExportPanel.classList.add('hidden');
          ui.elements.spriteSheetPanel.classList.add('hidden');
          ui.elements.exportSequenceBtn.classList.add('hidden');
          ui.elements.status.textContent = 'Imagen cargada';
          p.noLoop();
          showToast('Imagen cargada');
          triggerRedraw();
        });
      }
    }
    function togglePlay() { if (!appState.media || appState.mediaType !== 'video') return; if (appState.isPlaying) { appState.media.pause(); ui.elements.playBtn.textContent = 'Play'; showToast('Pausado'); } else { appState.media.loop(); ui.elements.playBtn.textContent = 'Pause'; showToast('Reproduciendo'); } appState.update({ isPlaying: !appState.isPlaying }); }
    function startRecording() { /* ... */ }
    function stopRecording() { /* ... */ }
    async function exportGif() { /* ... */ }
    function updateMetrics() { /* ... */ }
    function setupTimeline() { /* ... */ return () => {}; }
    function setupKeyboardShortcuts() { /* ... */ }
    function toggleFullscreen() { /* ... */ }
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
      
      const presetData = presets[name];
      const cfg = { ...appState.config, ...presetData };
      delete cfg.curves;

      appState.updateConfig(cfg);
      
      if (presetData.curves) {
        curvesEditor.curves = presetData.curves;
        curvesEditor.render();
      }
      
      // Actualizar UI
      ui.elements.effectSelect.value = cfg.effect;
      ui.elements.monochromeToggle.checked = cfg.isMonochrome;
      ui.elements.originalColorToggle.checked = cfg.useOriginalColor;
      ui.elements.colorCountSlider.value = cfg.colorCount;
      ui.elements.ditherScale.value = cfg.ditherScale;
      ui.elements.serpentineToggle.checked = cfg.serpentineScan;
      ui.elements.diffusionStrengthSlider.value = cfg.diffusionStrength * 100;
      ui.elements.patternStrengthSlider.value = cfg.patternStrength * 100;
      ui.elements.brightnessSlider.value = cfg.brightness || 0;
      ui.elements.contrastSlider.value = (cfg.contrast || 1.0) * 100;
      ui.elements.saturationSlider.value = (cfg.saturation || 1.0) * 100;
      
      // NUEVO: Actualizar UI de modulación
      document.getElementById('diffusionModulationSource').value = cfg.diffusionStrengthMod || 'none';
      document.getElementById('diffusionStrengthMinSlider').value = (cfg.diffusionStrengthMin || 0.3) * 100;
      document.getElementById('diffusionStrengthMaxSlider').value = (cfg.diffusionStrengthMax || 1.0) * 100;
      document.getElementById('diffusionStrengthMinVal').textContent = (cfg.diffusionStrengthMin || 0.3) * 100;
      document.getElementById('diffusionStrengthMaxVal').textContent = (cfg.diffusionStrengthMax || 1.0) * 100;
      document.getElementById('diffusionModulationControls').classList.toggle('hidden', (cfg.diffusionStrengthMod || 'none') === 'none');

      // Actualizar valores de texto
      ui.elements.colorCountVal.textContent = cfg.colorCount;
      ui.elements.ditherScaleVal.textContent = cfg.ditherScale;
      ui.elements.diffusionStrengthVal.textContent = cfg.diffusionStrength * 100;
      ui.elements.patternStrengthVal.textContent = cfg.patternStrength * 100;
      ui.elements.brightnessVal.textContent = cfg.brightness || 0;
      ui.elements.contrastVal.textContent = (cfg.contrast || 1.0) * 100;
      ui.elements.saturationVal.textContent = (cfg.saturation || 1.0) * 100;
      
      ui.updateColorPickers(appState, colorCache, lumaLUT, p);
      ui.updatePanelsVisibility(cfg);
      ui.togglePaletteControls(cfg.useOriginalColor);
      triggerRedraw();
      showToast(`Preset "${name}" cargado`);
    }

    function updateFrameStats() { /* ... */ }
    
    setInterval(() => { bufferPool.cleanup(60000); }, 60000);
  };
  
  new p5(sketch);
});
