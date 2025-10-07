// ============================================================================
// CLASES AUXILIARES PARA OPTIMIZACIÓN
// ============================================================================

class BufferPool {
  constructor() {
    this.buffers = new Map();
    this.lastUsed = new Map();
  }
  
  get(width, height, p) {
    const key = `${width}x${height}`;
    this.lastUsed.set(key, Date.now());
    
    if (!this.buffers.has(key)) {
      const buffer = p.createGraphics(width, height);
      buffer.elt.getContext('2d', { 
        willReadFrequently: true,
        alpha: false
      });
      buffer.pixelDensity(1);
      buffer.elt.style.imageRendering = 'pixelated';
      this.buffers.set(key, buffer);
    }
    return this.buffers.get(key);
  }
  
  cleanup(maxAge = 60000) {
    const now = Date.now();
    for (const [key, time] of this.lastUsed) {
      if (now - time > maxAge) {
        this.buffers.get(key)?.remove();
        this.buffers.delete(key);
        this.lastUsed.delete(key);
      }
    }
  }
  
  clear() {
    this.buffers.forEach(b => b.remove());
    this.buffers.clear();
    this.lastUsed.clear();
  }
}

class ColorCache {
  constructor(p) {
    this.p = p;
    this.cache = new Map();
  }
  
  getColor(hex) {
    if (!this.cache.has(hex)) {
      this.cache.set(hex, this.p.color(hex));
    }
    return this.cache.get(hex);
  }
  
  getColors(hexArray) {
    return hexArray.map(hex => this.getColor(hex));
  }
  
  clear() {
    this.cache.clear();
  }
}

class LumaLUT {
  constructor() {
    this.lut = null;
    this.cachedColors = null;
  }
  
  build(p5colors, p) {
    const count = p5colors.length;
    this.lut = new Uint8Array(256 * 3);
    
    for (let i = 0; i < 256; i++) {
      const index = count === 0 ? 0 : Math.min(Math.floor(i / 255 * count), count - 1);
      const color = p5colors[index] || p.color(i);
      this.lut[i * 3] = p.red(color);
      this.lut[i * 3 + 1] = p.green(color);
      this.lut[i * 3 + 2] = p.blue(color);
    }
    
    this.cachedColors = p5colors;
  }
  
  map(luma) {
    const index = Math.min(Math.max(Math.floor(luma), 0), 255);
    return [
      this.lut[index * 3],
      this.lut[index * 3 + 1],
      this.lut[index * 3 + 2]
    ];
  }
  
  needsRebuild(p5colors) {
    if (!this.cachedColors) return true;
    if (this.cachedColors.length !== p5colors.length) return true;
    return false;
  }
}

// CLASE LEGACY - Mantenida para compatibilidad pero ya no se usa
class BayerLUT {
  constructor() {
    const BAYER_4x4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
    this.matrix = new Float32Array(16);
    
    for (let i = 0; i < 16; i++) {
      const y = Math.floor(i / 4);
      const x = i % 4;
      this.matrix[i] = (BAYER_4x4[y][x] / 16.0 - 0.5);
    }
  }
  
  get(x, y) {
    const index = (y % 4) * 4 + (x % 4);
    return this.matrix[index];
  }
}

class BlueNoiseLUT {
  constructor() {
    // Pre-calculado usando void-and-cluster (8x8)
    this.noise = new Float32Array([
      0.53, 0.18, 0.71, 0.41, 0.94, 0.24, 0.82, 0.47,
      0.12, 0.65, 0.29, 0.88, 0.06, 0.59, 0.35, 0.76,
      0.76, 0.35, 0.94, 0.18, 0.71, 0.12, 0.88, 0.24,
      0.24, 0.82, 0.47, 0.65, 0.29, 0.94, 0.41, 0.59,
      0.88, 0.06, 0.71, 0.35, 0.82, 0.18, 0.65, 0.12,
      0.41, 0.59, 0.12, 0.76, 0.24, 0.47, 0.94, 0.29,
      0.65, 0.29, 0.88, 0.06, 0.59, 0.71, 0.35, 0.82,
      0.18, 0.94, 0.24, 0.53, 0.12, 0.76, 0.47, 0.41
    ]);
  }
  
  get(x, y, scale = 1) {
    const scaledX = Math.floor(x * scale) % 8;
    const scaledY = Math.floor(y * scale) % 8;
    const index = scaledY * 8 + scaledX;
    return this.noise[index] - 0.5;
  }
}

// ============================================================================
// GENERADOR DE MATRICES BAYER CONFIGURABLES
// ============================================================================

class BayerMatrixFactory {
  constructor() {
    this.cache = new Map();
  }
  
  /**
   * Genera una matriz Bayer con configuración específica
   * @param {number} size - Tamaño de la matriz (2, 4, 8, 16)
   * @param {number} rotation - Rotación en grados (0, 90, 180, 270)
   * @param {number} thresholdBias - Sesgo del umbral (-0.5 a 0.5)
   * @returns {Object} - Objeto con size y lut (Float32Array)
   */
  generate(size, rotation = 0, thresholdBias = 0) {
    const key = `${size}-${rotation}-${thresholdBias.toFixed(3)}`;
    
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    
    // Generar matriz base
    let matrix = this._generateBase(size);
    
    // Aplicar rotación
    if (rotation === 90) {
      matrix = this._rotate90(matrix);
    } else if (rotation === 180) {
      matrix = this._rotate180(matrix);
    } else if (rotation === 270) {
      matrix = this._rotate270(matrix);
    }
    
    // Normalizar y aplicar bias
    const normalized = this._normalize(matrix, size, thresholdBias);
    
    this.cache.set(key, normalized);
    return normalized;
  }
  
  /**
   * Genera matriz Bayer base usando algoritmo recursivo
   */
  _generateBase(n) {
    if (n === 2) {
      return [[0, 2], [3, 1]];
    }
    
    // Algoritmo recursivo para Bayer de tamaño 2^k
    const half = n / 2;
    const quarter = this._generateBase(half);
    const matrix = Array(n).fill(0).map(() => Array(n).fill(0));
    
    const scale = 4;
    
    // Patrón recursivo 2x2
    for (let i = 0; i < half; i++) {
      for (let j = 0; j < half; j++) {
        const val = quarter[i][j];
        matrix[i][j] = scale * val;                      // Top-left (0)
        matrix[i][j + half] = scale * val + 2;           // Top-right (2)
        matrix[i + half][j] = scale * val + 3;           // Bottom-left (3)
        matrix[i + half][j + half] = scale * val + 1;    // Bottom-right (1)
      }
    }
    
    return matrix;
  }
  
  _rotate90(matrix) {
    const n = matrix.length;
    const rotated = Array(n).fill(0).map(() => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        rotated[j][n - 1 - i] = matrix[i][j];
      }
    }
    return rotated;
  }
  
  _rotate180(matrix) {
    return this._rotate90(this._rotate90(matrix));
  }
  
  _rotate270(matrix) {
    return this._rotate90(this._rotate180(matrix));
  }
  
  /**
   * Normaliza la matriz a rango [-0.5, 0.5] y aplica bias
   */
  _normalize(matrix, size, bias) {
    const n = matrix.length;
    const maxVal = n * n;
    const lut = new Float32Array(n * n);
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const index = i * n + j;
        // Normalizar a [-0.5, 0.5] y añadir bias
        lut[index] = (matrix[i][j] / maxVal - 0.5) + bias;
      }
    }
    
    return { size: n, lut };
  }
  
  /**
   * Obtiene valor de la matriz en coordenadas x, y (con wrapping)
   */
  get(x, y, matrixData) {
    const size = matrixData.size;
    const index = (y % size) * size + (x % size);
    return matrixData.lut[index];
  }
  
  clearCache() {
    this.cache.clear();
  }
}

// Instancia global
const bayerFactory = new BayerMatrixFactory();

// ============================================================================
// DETECTORES DE BORDES PARA VARIABLE ERROR
// ============================================================================

class EdgeDetector {
  /**
   * Gradiente simple (método original, rápido)
   */
  static gradient(pixels, pw, ph, x, y) {
    if (x === 0 || x === pw - 1 || y === 0 || y === ph - 1) return 0;
    
    const i = (y * pw + x) * 4;
    const gx = Math.abs(pixels[i + 4] - pixels[i - 4]);
    const gy = Math.abs(pixels[i + pw * 4] - pixels[i - pw * 4]);
    return Math.sqrt(gx * gx + gy * gy) / 255;
  }
  
  /**
   * Operador Sobel (mejor para bordes diagonales)
   */
  static sobel(pixels, pw, ph, x, y) {
    if (x === 0 || x === pw - 1 || y === 0 || y === ph - 1) return 0;
    
    const getPixel = (dx, dy) => {
      const idx = ((y + dy) * pw + (x + dx)) * 4;
      return pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
    };
    
    // Kernels de Sobel 3x3
    const gx = -getPixel(-1, -1) + getPixel(1, -1) +
              -2 * getPixel(-1, 0) + 2 * getPixel(1, 0) +
              -getPixel(-1, 1) + getPixel(1, 1);
    
    const gy = -getPixel(-1, -1) - 2 * getPixel(0, -1) - getPixel(1, -1) +
               getPixel(-1, 1) + 2 * getPixel(0, 1) + getPixel(1, 1);
    
    return Math.min(1, Math.sqrt(gx * gx + gy * gy) / 1020);
  }
  
  /**
   * Operador Laplaciano (detecta cambios en todas direcciones)
   */
  static laplacian(pixels, pw, ph, x, y) {
    if (x === 0 || x === pw - 1 || y === 0 || y === ph - 1) return 0;
    
    const getPixel = (dx, dy) => {
      const idx = ((y + dy) * pw + (x + dx)) * 4;
      return pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
    };
    
    const center = getPixel(0, 0);
    
    // Kernel Laplaciano 3x3
    const laplacian = 
      -getPixel(-1, -1) - getPixel(0, -1) - getPixel(1, -1) +
      -getPixel(-1, 0) + 8 * center - getPixel(1, 0) +
      -getPixel(-1, 1) - getPixel(0, 1) - getPixel(1, 1);
    
    return Math.min(1, Math.abs(laplacian) / 2040);
  }
  
  /**
   * Canny simplificado (Gaussian blur + Sobel con threshold)
   */
  static canny(pixels, pw, ph, x, y, threshold = 30) {
    if (x < 1 || x >= pw - 1 || y < 1 || y >= ph - 1) return 0;
    
    // Gaussian blur 3x3 simplificado
    const getBlurred = (dx, dy) => {
      const kernel = [
        [1, 2, 1],
        [2, 4, 2],
        [1, 2, 1]
      ];
      let sum = 0;
      let weight = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + dy + ky) * pw + (x + dx + kx)) * 4;
          if (idx >= 0 && idx < pixels.length - 3) {
            const val = pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
            sum += val * kernel[ky + 1][kx + 1];
            weight += kernel[ky + 1][kx + 1];
          }
        }
      }
      
      return sum / weight;
    };
    
    // Aplicar Sobel sobre imagen blur
    const gx = -getBlurred(-1, -1) + getBlurred(1, -1) +
              -2 * getBlurred(-1, 0) + 2 * getBlurred(1, 0) +
              -getBlurred(-1, 1) + getBlurred(1, 1);
    
    const gy = -getBlurred(-1, -1) - 2 * getBlurred(0, -1) - getBlurred(1, -1) +
               getBlurred(-1, 1) + 2 * getBlurred(0, 1) + getBlurred(1, 1);
    
    const magnitude = Math.sqrt(gx * gx + gy * gy);
    
    // Aplicar threshold
    return magnitude > threshold ? Math.min(1, magnitude / 1020) : 0;
  }
  
  /**
   * Método principal de detección
   */
  static detect(method, pixels, pw, ph, x, y, threshold = 30) {
    switch(method) {
      case 'sobel': 
        return this.sobel(pixels, pw, ph, x, y);
      case 'laplacian': 
        return this.laplacian(pixels, pw, ph, x, y);
      case 'canny': 
        return this.canny(pixels, pw, ph, x, y, threshold);
      case 'gradient':
      default: 
        return this.gradient(pixels, pw, ph, x, y);
    }
  }
}

// ============================================================================
// FUNCIÓN PARA AJUSTES DE IMAGEN
// ============================================================================

function applyImageAdjustments(pixels, config) {
    const brightness = config.brightness;
    const contrast = config.contrast;
    const saturation = config.saturation;
    const curvesLUTs = config.curvesLUTs;

    const hasBasicAdjustments = brightness !== 0 || contrast !== 1.0 || saturation !== 1.0;
    const hasCurves = curvesLUTs && (
      curvesLUTs.rgb || curvesLUTs.r || curvesLUTs.g || curvesLUTs.b
    );
    
    if (!hasBasicAdjustments && !hasCurves) {
        return;
    }

    const len = pixels.length;
    for (let i = 0; i < len; i += 4) {
        let r = pixels[i];
        let g = pixels[i + 1];
        let b = pixels[i + 2];

        // Ajustes básicos
        if (hasBasicAdjustments) {
          r = (r - 127.5) * contrast + 127.5 + brightness;
          g = (g - 127.5) * contrast + 127.5 + brightness;
          b = (b - 127.5) * contrast + 127.5 + brightness;

          if (saturation !== 1.0) {
              const luma = r * 0.299 + g * 0.587 + b * 0.114;
              r = luma + (r - luma) * saturation;
              g = luma + (g - luma) * saturation;
              b = luma + (b - luma) * saturation;
          }
        }
        
        r = Math.max(0, Math.min(255, r));
        g = Math.max(0, Math.min(255, g));
        b = Math.max(0, Math.min(255, b));
        
        // Aplicar curvas
        if (hasCurves) {
          if (curvesLUTs.rgb) {
            r = curvesLUTs.rgb[Math.round(r)];
            g = curvesLUTs.rgb[Math.round(g)];
            b = curvesLUTs.rgb[Math.round(b)];
          }
          
          if (curvesLUTs.r) r = curvesLUTs.r[Math.round(r)];
          if (curvesLUTs.g) g = curvesLUTs.g[Math.round(g)];
          if (curvesLUTs.b) b = curvesLUTs.b[Math.round(b)];
        }
        
        pixels[i] = Math.max(0, Math.min(255, r));
        pixels[i + 1] = Math.max(0, Math.min(255, g));
        pixels[i + 2] = Math.max(0, Math.min(255, b));
    }
}

// ============================================================================
// FUNCIONES AUXILIARES PARA APLICAR PARÁMETROS
// ============================================================================

/**
 * Obtiene parámetros específicos del algoritmo con valores por defecto
 */
function getAlgorithmParams(cfg, algorithmName) {
  const params = cfg.algorithmParams?.[algorithmName] || {};
  const defaults = {};
  
  // Obtener valores por defecto de ALGORITHM_PARAMETERS
  const paramDefs = ALGORITHM_PARAMETERS[algorithmName]?.params || [];
  paramDefs.forEach(p => {
    defaults[p.id] = p.default;
  });
  
  // Mezclar con valores actuales
  return { ...defaults, ...params };
}

/**
 * Normaliza valores de porcentaje a escala 0-1 o -1 a 1
 */
function normalizeParam(value, paramId) {
  // Parámetros que son porcentajes (0-100 -> 0-1)
  if (paramId === 'diffusionStrength' || paramId === 'patternStrength' || 
      paramId === 'errorRetention' || paramId === 'sharpening' ||
      paramId === 'centerWeight' || paramId === 'filterStrength' ||
      paramId === 'edgeSensitivity' || paramId === 'adaptiveRange' ||
      paramId === 'detailPreservation' || paramId === 'noiseScale' ||
      paramId === 'patternScale') {
    return value / 100;
  }
  
  // Parámetros que son bias (-100 a 100 -> -1 a 1)
  if (paramId === 'errorBiasX' || paramId === 'errorBiasY' || 
      paramId === 'thresholdBias') {
    return value / 100;
  }
  
  // Otros parámetros se devuelven sin cambios
  return value;
}

// ============================================================================
// ALGORITMOS DE DITHERING
// ============================================================================

function drawPosterize(p, buffer, src, w, h, cfg, lumaLUT) {
  const scale = cfg.ditherScale;
  const pw = Math.floor(w / scale);
  const ph = Math.floor(h / scale);
  
  buffer.image(src, 0, 0, pw, ph);
  buffer.loadPixels();
  
  const pixels = buffer.pixels;
  applyImageAdjustments(pixels, cfg);
  
  const len = pixels.length;

  if (cfg.useOriginalColor) {
    const levels = 4;
    const step = 255 / (levels - 1);
    for (let i = 0; i < len; i += 4) {
      pixels[i] = Math.round(pixels[i] / step) * step;
      pixels[i + 1] = Math.round(pixels[i + 1] / step) * step;
      pixels[i + 2] = Math.round(pixels[i + 2] / step) * step;
    }
  } else {
    for (let i = 0; i < len; i += 4) {
      const luma = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
      const [r, g, b] = lumaLUT.map(luma);
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
    }
  }
  
  buffer.updatePixels();
}

function drawDither(p, buffer, src, w, h, cfg, lumaLUT, bayerLUT) {
  const scale = cfg.ditherScale;
  const pw = Math.floor(w / scale);
  const ph = Math.floor(h / scale);
  
  buffer.image(src, 0, 0, pw, ph);
  buffer.loadPixels();
  
  const pix = buffer.pixels;
  applyImageAdjustments(pix, cfg);

  // ========== BAYER DITHERING CON PARÁMETROS CONFIGURABLES ==========
  if (cfg.effect === 'bayer') {
    const params = getAlgorithmParams(cfg, 'bayer');
    
    const matrixSize = params.matrixSize || 4;
    const rotation = params.rotation || 0;
    const thresholdBias = normalizeParam(params.thresholdBias || 0, 'thresholdBias');
    const patternStrength = normalizeParam(params.patternStrength || 100, 'patternStrength');
    const patternScale = normalizeParam(params.patternScale || 100, 'patternScale');
    
    // Generar matriz Bayer configurada
    const bayerMatrix = bayerFactory.generate(matrixSize, rotation, thresholdBias);
    
    const levels = cfg.colorCount;
    const baseStrength = 255 / levels;
    const ditherStrength = baseStrength * patternStrength * patternScale * 2;
    
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const i = (y * pw + x) * 4;
        const ditherOffset = bayerFactory.get(x, y, bayerMatrix) * ditherStrength;
        const luma = pix[i] * 0.299 + pix[i + 1] * 0.587 + pix[i + 2] * 0.114;
        const adjustedLuma = Math.min(255, Math.max(0, luma + ditherOffset));
        const [r, g, b] = lumaLUT.map(adjustedLuma);
        pix[i] = r;
        pix[i + 1] = g;
        pix[i + 2] = b;
      }
    }
    
    buffer.updatePixels();
    return;
  }

  // ========== ERROR DIFFUSION CON PARÁMETROS ESPECÍFICOS ==========
  const kernel = KERNELS[cfg.effect];
  if (!kernel) {
    buffer.updatePixels();
    return;
  }
  
  const params = getAlgorithmParams(cfg, cfg.effect);
  
  const diffusionStrength = normalizeParam(params.diffusionStrength || 100, 'diffusionStrength');
  const errorBiasX = normalizeParam(params.errorBiasX || 0, 'errorBiasX');
  const errorBiasY = normalizeParam(params.errorBiasY || 0, 'errorBiasY');
  const sharpening = normalizeParam(params.sharpening || 100, 'sharpening');
  const serpentine = params.serpentine || false;
  
  // Parámetros específicos de algoritmos
  const errorRetention = normalizeParam(params.errorRetention || 100, 'errorRetention');
  const brightnessComp = params.brightnessCompensation || 0;
  const centerWeight = normalizeParam(params.centerWeight || 100, 'centerWeight');
  const filterStrength = normalizeParam(params.filterStrength || 100, 'filterStrength');

  if (cfg.useOriginalColor) {
    const levels = 4;
    const step = 255 / (levels - 1);
    
    for (let y = 0; y < ph; y++) {
      const isReversed = serpentine && y % 2 === 1;
      const xStart = isReversed ? pw - 1 : 0;
      const xEnd = isReversed ? -1 : pw;
      const xStep = isReversed ? -1 : 1;
      
      for (let x = xStart; x !== xEnd; x += xStep) {
        const i = (y * pw + x) * 4;
        
        // Aplicar compensación de brillo (Atkinson)
        let oldR = pix[i] + brightnessComp;
        let oldG = pix[i + 1] + brightnessComp;
        let oldB = pix[i + 2] + brightnessComp;
        
        const newR = Math.round(oldR / step) * step;
        const newG = Math.round(oldG / step) * step;
        const newB = Math.round(oldB / step) * step;

        pix[i] = Math.max(0, Math.min(255, newR));
        pix[i + 1] = Math.max(0, Math.min(255, newG));
        pix[i + 2] = Math.max(0, Math.min(255, newB));

        // Calcular error con retención (Atkinson) y sharpening
        let errR = (oldR - newR) * diffusionStrength * errorRetention * sharpening;
        let errG = (oldG - newG) * diffusionStrength * errorRetention * sharpening;
        let errB = (oldB - newB) * diffusionStrength * errorRetention * sharpening;

        // Propagar error
        const points = kernel.points;
        const divisor = kernel.divisor;
        
        for (let j = 0; j < points.length; j++) {
          const pt = points[j];
          let dx = isReversed ? -pt.dx : pt.dx;
          const dy = pt.dy;
          
          // Aplicar bias direccional
          const biasFactorX = 1 + errorBiasX * (dx > 0 ? 1 : -1);
          const biasFactorY = 1 + errorBiasY * (dy > 0 ? 1 : -1);
          
          dx = Math.round(dx * biasFactorX);
          
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < pw && ny >= 0 && ny < ph) {
            const ni = (ny * pw + nx) * 4;
            let weight = (pt.w / divisor) * centerWeight * filterStrength * biasFactorY;
            
            pix[ni] = Math.min(255, Math.max(0, pix[ni] + errR * weight));
            pix[ni + 1] = Math.min(255, Math.max(0, pix[ni + 1] + errG * weight));
            pix[ni + 2] = Math.min(255, Math.max(0, pix[ni + 2] + errB * weight));
          }
        }
      }
    }
  } else {
    // Modo paleta
    const levels = cfg.colorCount;
    const step = 255 / (levels > 1 ? levels - 1 : 1);
    
    for (let y = 0; y < ph; y++) {
      const isReversed = serpentine && y % 2 === 1;
      const xStart = isReversed ? pw - 1 : 0;
      const xEnd = isReversed ? -1 : pw;
      const xStep = isReversed ? -1 : 1;
      
      for (let x = xStart; x !== xEnd; x += xStep) {
        const i = (y * pw + x) * 4;
        
        let oldLuma = pix[i] * 0.299 + pix[i + 1] * 0.587 + pix[i + 2] * 0.114;
        oldLuma += brightnessComp;
        
        const newLuma = Math.round(oldLuma / step) * step;
        const [r, g, b] = lumaLUT.map(newLuma);
        
        pix[i] = r;
        pix[i + 1] = g;
        pix[i + 2] = b;
        
        const err = (oldLuma - newLuma) * diffusionStrength * errorRetention * sharpening;
        const points = kernel.points;
        const divisor = kernel.divisor;
        
        for (let j = 0; j < points.length; j++) {
          const pt = points[j];
          let dx = isReversed ? -pt.dx : pt.dx;
          const dy = pt.dy;
          
          const biasFactorX = 1 + errorBiasX * (dx > 0 ? 1 : -1);
          const biasFactorY = 1 + errorBiasY * (dy > 0 ? 1 : -1);
          
          dx = Math.round(dx * biasFactorX);
          
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < pw && ny >= 0 && ny < ph) {
            const ni = (ny * pw + nx) * 4;
            let weight = (pt.w / divisor) * centerWeight * filterStrength * biasFactorY;
            const adjustment = err * weight;
            
            pix[ni] = Math.min(255, Math.max(0, pix[ni] + adjustment));
            pix[ni + 1] = Math.min(255, Math.max(0, pix[ni + 1] + adjustment));
            pix[ni + 2] = Math.min(255, Math.max(0, pix[ni + 2] + adjustment));
          }
        }
      }
    }
  }
  
  buffer.updatePixels();
}

function drawBlueNoise(p, buffer, src, w, h, cfg, lumaLUT, blueNoiseLUT) {
  const scale = cfg.ditherScale;
  const pw = Math.floor(w / scale);
  const ph = Math.floor(h / scale);
  
  buffer.image(src, 0, 0, pw, ph);
  buffer.loadPixels();
  
  const pix = buffer.pixels;
  applyImageAdjustments(pix, cfg);

  // Obtener parámetros específicos
  const params = getAlgorithmParams(cfg, 'blue-noise');
  
  const patternStrength = normalizeParam(params.patternStrength || 100, 'patternStrength');
  const noiseScale = normalizeParam(params.noiseScale || 100, 'noiseScale');
  const thresholdBias = normalizeParam(params.thresholdBias || 0, 'thresholdBias');
  
  const levels = cfg.colorCount;
  const baseStrength = 255 / levels;
  const ditherStrength = baseStrength * patternStrength * 2;
  
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const i = (y * pw + x) * 4;
      const ditherOffset = (blueNoiseLUT.get(x, y, 1 / noiseScale) + thresholdBias) * ditherStrength;
      const luma = pix[i] * 0.299 + pix[i + 1] * 0.587 + pix[i + 2] * 0.114;
      const adjustedLuma = Math.min(255, Math.max(0, luma + ditherOffset));
      const [r, g, b] = lumaLUT.map(adjustedLuma);
      pix[i] = r;
      pix[i + 1] = g;
      pix[i + 2] = b;
    }
  }
  
  buffer.updatePixels();
}

function drawVariableError(p, buffer, src, w, h, cfg, lumaLUT) {
  const scale = cfg.ditherScale;
  const pw = Math.floor(w / scale);
  const ph = Math.floor(h / scale);
  
  buffer.image(src, 0, 0, pw, ph);
  buffer.loadPixels();
  
  const pix = buffer.pixels;
  applyImageAdjustments(pix, cfg);

  // Obtener parámetros específicos
  const params = getAlgorithmParams(cfg, 'variable-error');
  
  const diffusionStrength = normalizeParam(params.diffusionStrength || 100, 'diffusionStrength');
  const edgeMethod = params.edgeDetectionMethod || 'gradient';
  const edgeSensitivity = normalizeParam(params.edgeSensitivity || 100, 'edgeSensitivity');
  const edgeThreshold = params.edgeThreshold || 30;
  const adaptiveRange = normalizeParam(params.adaptiveRange || 50, 'adaptiveRange');
  const detailPreservation = normalizeParam(params.detailPreservation || 50, 'detailPreservation');
  const serpentine = params.serpentine || false;
  
  const kernel = KERNELS['floyd-steinberg'];
  
  // Pre-calcular mapa de bordes
  const edgeMap = new Float32Array(pw * ph);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const edge = EdgeDetector.detect(edgeMethod, pix, pw, ph, x, y, edgeThreshold);
      edgeMap[y * pw + x] = edge * edgeSensitivity;
    }
  }
  
  const levels = cfg.colorCount;
  const step = 255 / (levels > 1 ? levels - 1 : 1);
  
  for (let y = 0; y < ph; y++) {
    const isReversed = serpentine && y % 2 === 1;
    const xStart = isReversed ? pw - 1 : 0;
    const xEnd = isReversed ? -1 : pw;
    const xStep = isReversed ? -1 : 1;
    
    for (let x = xStart; x !== xEnd; x += xStep) {
      const i = (y * pw + x) * 4;
      const edgeStrength = edgeMap[y * pw + x];
      
      // Fórmula adaptativa: reduce difusión en bordes
      const edgeFactor = Math.pow(1 - Math.min(1, edgeStrength), 1 + detailPreservation);
      const adaptiveStrength = diffusionStrength * (
        adaptiveRange + (1 - adaptiveRange) * edgeFactor
      );
      
      const oldLuma = pix[i] * 0.299 + pix[i + 1] * 0.587 + pix[i + 2] * 0.114;
      const newLuma = Math.round(oldLuma / step) * step;
      const [r, g, b] = lumaLUT.map(newLuma);
      
      pix[i] = r;
      pix[i + 1] = g;
      pix[i + 2] = b;
      
      const err = (oldLuma - newLuma) * adaptiveStrength;
      
      for (const pt of kernel.points) {
        const dx = isReversed ? -pt.dx : pt.dx;
        const nx = x + dx;
        const ny = y + pt.dy;
        
        if (nx >= 0 && nx < pw && ny >= 0 && ny < ph) {
          const ni = (ny * pw + nx) * 4;
          const weight = pt.w / kernel.divisor;
          const adjustment = err * weight;
          pix[ni] = Math.min(255, Math.max(0, pix[ni] + adjustment));
          pix[ni + 1] = Math.min(255, Math.max(0, pix[ni + 1] + adjustment));
          pix[ni + 2] = Math.min(255, Math.max(0, pix[ni + 2] + adjustment));
        }
      }
    }
  }
  
  buffer.updatePixels();
}
