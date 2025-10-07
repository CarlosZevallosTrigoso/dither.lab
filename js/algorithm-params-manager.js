// ============================================================================
// GESTOR DE PARÁMETROS DINÁMICOS POR ALGORITMO
// ============================================================================

class AlgorithmParamsManager {
  constructor(appState, uiManager) {
    this.appState = appState;
    this.ui = uiManager;
    this.container = null;
    this.currentAlgorithm = null;
    this.controlElements = new Map(); // Cache de elementos DOM
  }

  /**
   * Inicializa el manager y crea el contenedor si no existe
   */
  init() {
    // Buscar o crear contenedor
    this.container = document.getElementById('algorithmParamsContainer');
    
    if (!this.container) {
      // Crear contenedor dinámicamente dentro de #ditherControls
      const ditherControls = document.getElementById('ditherControls');
      if (ditherControls) {
        this.container = document.createElement('div');
        this.container.id = 'algorithmParamsContainer';
        this.container.className = 'space-y-3 pt-3 border-t border-slate-700';
        ditherControls.appendChild(this.container);
      } else {
        console.error('No se encontró #ditherControls');
        return;
      }
    }

    // Inicializar algorithmParams si no existe
    if (!this.appState.config.algorithmParams) {
      this.appState.config.algorithmParams = {};
    }

    // Renderizar controles para el algoritmo actual
    this.renderControls(this.appState.config.effect);
  }

  /**
   * Renderiza los controles específicos para un algoritmo
   * @param {string} algorithm - Nombre del algoritmo
   */
  renderControls(algorithm) {
    if (!this.container) return;
    
    // Si es el mismo algoritmo, no hacer nada
    if (this.currentAlgorithm === algorithm) return;
    
    this.currentAlgorithm = algorithm;
    
    // Limpiar contenedor
    this.container.innerHTML = '';
    this.controlElements.clear();

    // Obtener parámetros del algoritmo
    const algorithmDef = ALGORITHM_PARAMETERS[algorithm];
    if (!algorithmDef || !algorithmDef.params || algorithmDef.params.length === 0) {
      // No hay parámetros específicos para este algoritmo
      this.container.innerHTML = '<p class="text-xs text-gray-500 italic">Este algoritmo no tiene parámetros adicionales</p>';
      return;
    }

    // Inicializar parámetros del algoritmo si no existen
    if (!this.appState.config.algorithmParams[algorithm]) {
      this.appState.config.algorithmParams[algorithm] = {};
    }

    // Crear controles
    algorithmDef.params.forEach(param => {
      const controlWrapper = this.createControl(algorithm, param);
      if (controlWrapper) {
        this.container.appendChild(controlWrapper);
      }
    });

    // Mostrar el panel
    document.getElementById('ditherControls').classList.remove('hidden');
  }

  /**
   * Crea un elemento de control según el tipo de parámetro
   * @param {string} algorithm - Nombre del algoritmo
   * @param {Object} param - Definición del parámetro
   * @returns {HTMLElement} - Elemento DOM del control
   */
  createControl(algorithm, param) {
    const wrapper = document.createElement('div');
    wrapper.className = 'control-wrapper';
    wrapper.dataset.paramId = param.id;

    // Obtener valor actual o default
    const currentValue = this.appState.config.algorithmParams[algorithm][param.id] ?? param.default;

    switch (param.type) {
      case 'range':
        wrapper.innerHTML = this.createRangeHTML(param, currentValue);
        break;
      
      case 'select':
        wrapper.innerHTML = this.createSelectHTML(param, currentValue);
        break;
      
      case 'checkbox':
        wrapper.innerHTML = this.createCheckboxHTML(param, currentValue);
        break;
      
      default:
        console.warn(`Tipo de control desconocido: ${param.type}`);
        return null;
    }

    // Vincular eventos
    this.bindControlEvents(wrapper, algorithm, param);

    // Guardar referencia
    this.controlElements.set(param.id, wrapper);

    return wrapper;
  }

  /**
   * Genera HTML para control tipo range
   */
  createRangeHTML(param, currentValue) {
    const displayValue = param.unit ? `${currentValue}${param.unit}` : currentValue;
    
    return `
      <label class="block">
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm">${param.label}</span>
          ${param.description ? `
            <span class="tooltip relative inline-block">
              <span class="text-xs text-gray-400 cursor-help">ⓘ</span>
              <span class="tooltiptext">${param.description}</span>
            </span>
          ` : ''}
        </div>
        <div class="flex items-center gap-2">
          <input 
            type="range" 
            class="flex-1" 
            id="param_${param.id}"
            min="${param.min}" 
            max="${param.max}" 
            value="${currentValue}"
            step="${param.step || 1}"
          />
          <span class="text-xs text-cyan-400 font-mono w-16 text-right" id="param_${param.id}_display">
            ${displayValue}
          </span>
        </div>
      </label>
    `;
  }

  /**
   * Genera HTML para control tipo select
   */
  createSelectHTML(param, currentValue) {
    const options = param.options.map(opt => {
      const value = opt.value ?? opt;
      const label = opt.label ?? opt;
      const selected = value == currentValue ? 'selected' : '';
      return `<option value="${value}" ${selected}>${label}</option>`;
    }).join('');

    return `
      <label class="block">
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm">${param.label}</span>
          ${param.description ? `
            <span class="tooltip relative inline-block">
              <span class="text-xs text-gray-400 cursor-help">ⓘ</span>
              <span class="tooltiptext">${param.description}</span>
            </span>
          ` : ''}
        </div>
        <select 
          id="param_${param.id}"
          class="w-full bg-slate-700 p-2 rounded text-white text-sm"
        >
          ${options}
        </select>
      </label>
    `;
  }

  /**
   * Genera HTML para control tipo checkbox
   */
  createCheckboxHTML(param, currentValue) {
    const checked = currentValue ? 'checked' : '';
    
    return `
      <label class="flex items-center gap-2 cursor-pointer">
        <input 
          type="checkbox" 
          id="param_${param.id}"
          class="w-4 h-4" 
          ${checked}
        />
        <span class="text-sm flex-1">${param.label}</span>
        ${param.description ? `
          <span class="tooltip relative inline-block">
            <span class="text-xs text-gray-400 cursor-help">ⓘ</span>
            <span class="tooltiptext">${param.description}</span>
          </span>
        ` : ''}
      </label>
    `;
  }

  /**
   * Vincula eventos a un control
   */
  bindControlEvents(wrapper, algorithm, param) {
    const input = wrapper.querySelector(`#param_${param.id}`);
    if (!input) return;

    switch (param.type) {
      case 'range':
        // Usar throttle para mejor rendimiento
        const throttledHandler = this.throttle((e) => {
          const value = parseFloat(e.target.value);
          this.updateParam(algorithm, param.id, value);
          
          // Actualizar display
          const display = wrapper.querySelector(`#param_${param.id}_display`);
          if (display) {
            const displayValue = param.unit ? `${value}${param.unit}` : value;
            display.textContent = displayValue;
          }
        }, 16); // ~60fps
        
        input.addEventListener('input', throttledHandler);
        break;

      case 'select':
        input.addEventListener('change', (e) => {
          let value = e.target.value;
          
          // Convertir a número si es numérico
          if (!isNaN(value) && value !== '') {
            value = parseFloat(value);
          }
          
          this.updateParam(algorithm, param.id, value);
        });
        break;

      case 'checkbox':
        input.addEventListener('change', (e) => {
          this.updateParam(algorithm, param.id, e.target.checked);
        });
        break;
    }
  }

  /**
   * Actualiza un parámetro y dispara redibujado
   * @param {string} algorithm - Nombre del algoritmo
   * @param {string} paramId - ID del parámetro
   * @param {*} value - Nuevo valor
   */
  updateParam(algorithm, paramId, value) {
    // Asegurar que existe la estructura
    if (!this.appState.config.algorithmParams[algorithm]) {
      this.appState.config.algorithmParams[algorithm] = {};
    }

    // Actualizar valor
    this.appState.config.algorithmParams[algorithm][paramId] = value;

    // Trigger redibujado (si existe la función global)
    if (typeof window.triggerRedraw === 'function') {
      window.triggerRedraw();
    }
  }

  /**
   * Obtiene los parámetros actuales de un algoritmo
   * @param {string} algorithm - Nombre del algoritmo
   * @returns {Object} - Objeto con los parámetros
   */
  getParams(algorithm) {
    return this.appState.config.algorithmParams[algorithm] || {};
  }

  /**
   * Establece múltiples parámetros a la vez (útil para presets)
   * @param {string} algorithm - Nombre del algoritmo
   * @param {Object} params - Objeto con parámetros
   */
  setParams(algorithm, params) {
    if (!this.appState.config.algorithmParams[algorithm]) {
      this.appState.config.algorithmParams[algorithm] = {};
    }

    Object.assign(this.appState.config.algorithmParams[algorithm], params);

    // Si es el algoritmo actual, actualizar UI
    if (this.currentAlgorithm === algorithm) {
      this.updateControlsUI(algorithm, params);
    }

    // Trigger redibujado
    if (typeof window.triggerRedraw === 'function') {
      window.triggerRedraw();
    }
  }

  /**
   * Actualiza visualmente los controles con nuevos valores
   */
  updateControlsUI(algorithm, params) {
    Object.entries(params).forEach(([paramId, value]) => {
      const wrapper = this.controlElements.get(paramId);
      if (!wrapper) return;

      const input = wrapper.querySelector(`#param_${paramId}`);
      if (!input) return;

      if (input.type === 'checkbox') {
        input.checked = value;
      } else if (input.type === 'range') {
        input.value = value;
        
        // Actualizar display
        const display = wrapper.querySelector(`#param_${paramId}_display`);
        if (display) {
          const paramDef = ALGORITHM_PARAMETERS[algorithm]?.params?.find(p => p.id === paramId);
          const displayValue = paramDef?.unit ? `${value}${paramDef.unit}` : value;
          display.textContent = displayValue;
        }
      } else {
        input.value = value;
      }
    });
  }

  /**
   * Resetea los parámetros de un algoritmo a sus valores por defecto
   * @param {string} algorithm - Nombre del algoritmo
   */
  resetParams(algorithm) {
    const algorithmDef = ALGORITHM_PARAMETERS[algorithm];
    if (!algorithmDef || !algorithmDef.params) return;

    const defaults = {};
    algorithmDef.params.forEach(param => {
      defaults[param.id] = param.default;
    });

    this.setParams(algorithm, defaults);
  }

  /**
   * Función throttle para optimizar eventos
   */
  throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Limpia y remueve todos los controles
   */
  destroy() {
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.controlElements.clear();
    this.currentAlgorithm = null;
  }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.AlgorithmParamsManager = AlgorithmParamsManager;
}
