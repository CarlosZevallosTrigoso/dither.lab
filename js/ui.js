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

// Gestión de UI
class UIManager {
  constructor() {
    this.elements = {};
  }
  
  init() {
    // Obtener todos los elementos
    const ids = ['dropZone', 'fileInput', 'playBtn', 'restartBtn', 'effectSelect',
      'monochromeToggle', 'colorCountSlider', 'colorCountVal', 'colorPickerContainer',
      'ditherControls', 'ditherScale', 'ditherScaleVal', 'serpentineToggle',
      'diffusionStrengthSlider', 'diffusionStrengthVal', 'patternStrengthSlider',
      'patternStrengthVal', 'recBtn', 'stopBtn', 'downloadImageBtn', 'status',
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
      'exportSpriteBtn', 'exportSequenceBtn', 'infoText', 'errorDiffusionControls',
      'orderedDitherControls', 'fps', 'frameTime', 'effectName', 'timeDisplay',
      'speedDisplay',
      'resetImageAdjustmentsBtn', 'brightnessSlider', 'brightnessVal',
      'contrastSlider', 'contrastVal', 'saturationSlider', 'saturationVal'
    ];
    
    ids.forEach(id => this.elements[id] = $(id));
  }
  
  updateColorPickers(appState, colorCache, lumaLUT, p, forceGradient = false) {
    const cfg = appState.config;
    const previousColors = [...cfg.colors];
    const newColors = [];
    const colorCountChanged = cfg.colorCount !== previousColors.length;

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
    this.elements.colorPickerContainer.innerHTML = "";
    
    cfg.colors.forEach((hexColor, i) => {
      const label = document.createElement("label");
      label.className = "block";
      label.innerHTML = `
        <span class="text-xs text-gray-400">Color ${i + 1}</span>
        <input type="color" value="${hexColor}" class="w-full h-10 p-0 border-none rounded cursor-pointer"/>
      `;
      const colorInput = label.querySelector("input");
      colorInput.addEventListener("input", e => {
        if (!cfg.isMonochrome) {
          const colors = [...cfg.colors];
          colors[i] = e.target.value;
          appState.updateConfig({ colors });
          const p5colors = colorCache.getColors(colors);
          lumaLUT.build(p5colors, p);
        }
      });
      this.elements.colorPickerContainer.appendChild(label);
    });
    
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
    const effect = cfg.effect;
    const isDithering = effect !== "none" && effect !== "posterize";
    this.elements.ditherControls.classList.toggle("hidden", !isDithering);
    
    if (isDithering) {
      const isErrorDiffusion = !!KERNELS[effect] || effect === 'riemersma' || effect === 'variable-error';
      const isOrdered = effect === "bayer" || effect === "blue-noise";
      this.elements.errorDiffusionControls.classList.toggle("hidden", !isErrorDiffusion);
      this.elements.orderedDitherControls.classList.toggle("hidden", !isOrdered);
    }
    
    this.elements.infoText.textContent = ALGORITHM_INFO[effect] || "Selecciona un algoritmo.";
  }
}
