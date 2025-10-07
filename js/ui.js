// Utilidades
const $ = id => document.getElementById(id);

function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds === Infinity) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Función throttle para feedback inmediato en sliders
function throttle(func, limit) {
  let inThrottle;
  let lastResult;
  return function(...args) {
    if (!inThrottle) {
      lastResult = func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
    return lastResult;
  };
}

// Variable global para controlar redibujado
let triggerRedraw = null;

// Gestión de UI
class UIManager {
  constructor() {
    this.elements = {};
    this.lastColorCount = 0;
  }
  
  init() {
    // ⭐ MODIFICADO: Eliminadas referencias a controles que ya no existen
    const ids = ['dropZone', 'fileInput', 'playBtn', 'restartBtn', 'effectSelect',
      'monochromeToggle', 'colorCountSlider', 'colorCountVal', 'colorPickerContainer',
      'ditherControls', // ⭐ Mantenido (es el contenedor)
      // ❌ ELIMINADO: 'ditherScale', 'ditherScaleVal', 'serpentineToggle',
      // ❌ ELIMINADO: 'diffusionStrengthSlider', 'diffusionStrengthVal',
      // ❌ ELIMINADO: 'patternStrengthSlider', 'patternStrengthVal',
      // ❌ ELIMINADO: 'errorDiffusionControls', 'orderedDitherControls',
      'recBtn', 'stopBtn', 'downloadImageBtn', 'status',
      'recIndicator', 'presetNameInput', 'savePresetBtn', 'presetSelect',
      'deletePresetBtn', 'originalColorToggle', 'shortcutsBtn', 'shortcutsModal', 'closeShortcutsBtn',
      'mediaType', 'mediaDimensions', 'timelinePanel', 'timeline', 'timelineProgress',
      'timelineScrubber', 'timelineTime', 'markerIn', 'markerOut', 'setInBtn',
      'setOutBtn', 'clearMarkersBtn', 'loopSectionToggle', 'playbackSpeedSlider',
      'playbackSpeedVal', 'prevFrameBtn', 'nextFrameBtn', 'gifExportPanel',
      'gifFpsSlider', 'gifFpsVal', 'gifQualitySlider', 'gifQualityVal',
      'gifUseMarkersToggle', 'exportGifBtn', 'gifProgress', 'gifProgressText',
      'gifProgressBar', 'webmUseMarkersToggle', 'recordQuality', 'metricsBtn',
      'metricsModal', 'closeMetricsBtn', 'updateMetricsBtn', 'spriteSheetPanel',
      'spriteColsSlider', 'spriteCols', 'spriteFrameCountSlider', 'spriteFrameCount',
      'exportSpriteBtn', 'exportSequenceBtn', 'infoText',
      'fps', 'frameTime', 'effectName', 'timeDisplay', 'speedDisplay',
      'resetImageAdjustmentsBtn', 'brightnessSlider', 'brightnessVal',
      'contrastSlider', 'contrastVal', 'saturationSlider', 'saturationVal'
    ];
    
    ids.forEach(id => this.elements[id] = $(id));
  }
  
  updateColorPickers(appState, colorCache, lumaLUT, p, forceGradient = false) {
    const cfg = appState.config;
    const previousColors = [...cfg.colors];
    const newColors = [];
    const colorCountChanged = cfg.colorCount !== this.lastColorCount;

    if (cfg.isMonochrome) {
      for (let i = 0; i < cfg.colorCount; i++) {
        const grayVal = Math.round(p.map(i, 0, cfg.colorCount - 1, 0, 255));
        newColors.push("#" + grayVal.toString(16).padStart(2, "0").repeat(3));
      }
    } else if (colorCountChanged || forceGradient) {
      const startColor = colorCache.getColor(previousColors[0] || "#000000");
      const endColor = colorCache.getColor(previousColors[previousColors.length - 1] || "#FFFFFF");
      for (let i = 0; i < cfg.colorCount; i++) {
        const amount = cfg.colorCount === 1 ? 0 : i / (cfg.colorCount - 1);
        newColors.push(p.lerpColor(startColor, endColor, amount).toString("#rrggbb"));
      }
    } else {
      newColors.push(...previousColors);
    }

    appState.updateConfig({ colors: newColors.slice(0, cfg.colorCount) });
    
    const container = this.elements.colorPickerContainer;
    const currentInputs = container.querySelectorAll('input[type="color"]');
    
    if (colorCountChanged || currentInputs.length !== cfg.colorCount) {
      container.innerHTML = "";
      
      cfg.colors.forEach((hexColor, i) => {
        const label = document.createElement("label");
        label.className = "block";
        label.innerHTML = `
          <span class="text-xs text-gray-400">Color ${i + 1}</span>
          <input type="color" value="${hexColor}" 
                 data-index="${i}"
                 class="w-full h-10 p-0 border-none rounded cursor-pointer"/>
        `;
        
        const colorInput = label.querySelector("input");
        colorInput.addEventListener("input", e => {
          if (!cfg.isMonochrome) {
            const colors = [...cfg.colors];
            colors[i] = e.target.value;
            appState.updateConfig({ colors });
            const p5colors = colorCache.getColors(colors);
            lumaLUT.build(p5colors, p);
            
            if (triggerRedraw) triggerRedraw();
          }
        });
        container.appendChild(label);
      });
      
      this.lastColorCount = cfg.colorCount;
    } else {
      currentInputs.forEach((input, i) => {
        if (input.value.toLowerCase() !== cfg.colors[i].toLowerCase()) {
          input.value = cfg.colors[i];
        }
      });
    }
    
    const p5colors = colorCache.getColors(cfg.colors);
    lumaLUT.build(p5colors, p);
    
    this.togglePaletteControls(cfg.useOriginalColor);
  }
  
  togglePaletteControls(isDisabled) {
    this.elements.monochromeToggle.disabled = isDisabled;
    this.elements.colorCountSlider.disabled = isDisabled;
    const colorInputs = this.elements.colorPickerContainer.querySelectorAll("input");
    colorInputs.forEach(input => input.disabled = isDisabled);
  }
  
  updatePanelsVisibility(cfg) {
    // ⭐ MODIFICADO: Simplificado - solo muestra/oculta el panel principal
    const effect = cfg.effect;
    const isDithering = effect !== "none" && effect !== "posterize";
    
    this.elements.ditherControls.classList.toggle("hidden", !isDithering);
    
    // ⭐ ELIMINADO: Ya no controlamos errorDiffusionControls ni orderedDitherControls
    // Esos paneles ya no existen, ahora todo es dinámico
    
    // Actualizar descripción del algoritmo
    this.elements.infoText.textContent = ALGORITHM_INFO[effect] || "Selecciona un algoritmo.";
  }
}

// ============================================================================
// CURVES EDITOR
// ============================================================================

class CurvesEditor {
  constructor(canvasId, width = 280, height = 280) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.width = width;
    this.height = height;
    
    // Curvas para cada canal: array de puntos {x, y} donde x,y ∈ [0, 255]
    this.curves = {
      rgb: [{x: 0, y: 0}, {x: 255, y: 255}],
      r: [{x: 0, y: 0}, {x: 255, y: 255}],
      g: [{x: 0, y: 0}, {x: 255, y: 255}],
      b: [{x: 0, y: 0}, {x: 255, y: 255}]
    };
    
    this.currentChannel = 'rgb';
    this.selectedPoint = null;
    this.isDragging = false;
    this.pointRadius = 6;
    
    this.setupEventListeners();
    this.render();
  }
  
  setupEventListeners() {
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('dblclick', this.onDoubleClick.bind(this));
    this.canvas.addEventListener('mouseleave', this.onMouseUp.bind(this));
  }
  
  canvasToValue(canvasCoord, isX) {
    if (isX) {
      return Math.round((canvasCoord / this.width) * 255);
    } else {
      return Math.round(((this.height - canvasCoord) / this.height) * 255);
    }
  }
  
  valueToCanvas(value, isX) {
    if (isX) {
      return (value / 255) * this.width;
    } else {
      return this.height - (value / 255) * this.height;
    }
  }
  
  onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const points = this.curves[this.currentChannel];
    for (let i = 0; i < points.length; i++) {
      const px = this.valueToCanvas(points[i].x, true);
      const py = this.valueToCanvas(points[i].y, false);
      const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
      
      if (dist < this.pointRadius + 5) {
        this.selectedPoint = i;
        this.isDragging = true;
        this.render();
        return;
      }
    }
    
    const valueX = this.canvasToValue(x, true);
    const valueY = this.canvasToValue(y, false);
    
    if (valueX > 0 && valueX < 255) {
      this.addPoint(this.currentChannel, valueX, valueY);
      this.selectedPoint = points.findIndex(p => p.x === valueX);
      this.isDragging = true;
    }
  }
  
  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const valueX = this.canvasToValue(x, true);
    const valueY = this.canvasToValue(y, false);
    
    const info = document.getElementById('curvePointInfo');
    if (info) {
      info.textContent = `In: ${valueX} → Out: ${valueY}`;
    }
    
    if (this.isDragging && this.selectedPoint !== null) {
      const points = this.curves[this.currentChannel];
      
      if (this.selectedPoint === 0 || this.selectedPoint === points.length - 1) {
        points[this.selectedPoint].y = Math.max(0, Math.min(255, valueY));
      } else {
        const prevX = points[this.selectedPoint - 1].x;
        const nextX = points[this.selectedPoint + 1].x;
        points[this.selectedPoint].x = Math.max(prevX + 1, Math.min(nextX - 1, valueX));
        points[this.selectedPoint].y = Math.max(0, Math.min(255, valueY));
      }
      
      this.render();
      
      if (window.triggerRedraw) window.triggerRedraw();
    }
  }
  
  onMouseUp(e) {
    this.isDragging = false;
  }
  
  onDoubleClick(e) {
    if (this.selectedPoint !== null) {
      const points = this.curves[this.currentChannel];
      
      if (this.selectedPoint !== 0 && this.selectedPoint !== points.length - 1) {
        points.splice(this.selectedPoint, 1);
        this.selectedPoint = null;
        this.render();
        if (window.triggerRedraw) window.triggerRedraw();
      }
    }
  }
  
  addPoint(channel, x, y) {
    const points = this.curves[channel];
    points.push({x: Math.round(x), y: Math.round(y)});
    points.sort((a, b) => a.x - b.x);
  }
  
  setChannel(channel) {
    this.currentChannel = channel;
    this.selectedPoint = null;
    this.render();
  }
  
  resetChannel(channel) {
    this.curves[channel] = [{x: 0, y: 0}, {x: 255, y: 255}];
    this.selectedPoint = null;
    this.render();
    if (window.triggerRedraw) window.triggerRedraw();
  }
  
  resetAllChannels() {
    for (const channel in this.curves) {
      this.curves[channel] = [{x: 0, y: 0}, {x: 255, y: 255}];
    }
    this.selectedPoint = null;
    this.render();
    if (window.triggerRedraw) window.triggerRedraw();
  }
  
  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);
    
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= 4; i++) {
      const pos = (i / 4) * w;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, h);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(w, pos);
      ctx.stroke();
    }
    
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    
    const points = this.curves[this.currentChannel];
    const channelColors = {
      rgb: '#06b6d4',
      r: '#ef4444',
      g: '#10b981',
      b: '#3b82f6'
    };
    
    ctx.strokeStyle = channelColors[this.currentChannel];
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const lut = this.getLUT(this.currentChannel);
    for (let x = 0; x <= 255; x++) {
      const canvasX = this.valueToCanvas(x, true);
      const canvasY = this.valueToCanvas(lut[x], false);
      
      if (x === 0) {
        ctx.moveTo(canvasX, canvasY);
      } else {
        ctx.lineTo(canvasX, canvasY);
      }
    }
    ctx.stroke();
    
    points.forEach((point, index) => {
      const px = this.valueToCanvas(point.x, true);
      const py = this.valueToCanvas(point.y, false);
      
      ctx.fillStyle = index === this.selectedPoint ? '#f59e0b' : '#06b6d4';
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      
      ctx.beginPath();
      ctx.arc(px, py, this.pointRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }
  
  getLUT(channel) {
    const points = this.curves[channel];
    const lut = new Uint8Array(256);
    
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      
      for (let x = p1.x; x <= p2.x; x++) {
        const t = (x - p1.x) / (p2.x - p1.x);
        const y = p1.y + t * (p2.y - p1.y);
        lut[x] = Math.round(Math.max(0, Math.min(255, y)));
      }
    }
    
    return lut;
  }
  
  getAllLUTs() {
    return {
      rgb: this.getLUT('rgb'),
      r: this.getLUT('r'),
      g: this.getLUT('g'),
      b: this.getLUT('b')
    };
  }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.UIHelpers = { throttle, debounce, showToast, formatTime };
  window.CurvesEditor = CurvesEditor;
}
