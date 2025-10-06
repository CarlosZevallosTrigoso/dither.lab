// ============================================================================
// CLASES AUXILIARES PARA OPTIMIZACIÓN
// ============================================================================

class BufferPool {
  constructor() {
    this.buffers = new Map();
  }
  
  get(width, height, p) {
    const key = `${width}x${height}`;
    if (!this.buffers.has(key)) {
      const buffer = p.createGraphics(width, height);
      buffer.elt.getContext('2d', { willReadFrequently: true });
      buffer.pixelDensity(1);
      this.buffers.set(key, buffer);
    }
    return this.buffers.get(key);
  }
  
  clear() {
    this.buffers.forEach(b => b.remove());
    this.buffers.clear();
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
  
  get(x, y) {
    const index = (y % 8) * 8 + (x % 8);
    return this.noise[index] - 0.5;
  }
}

// ============================================================================
// NUEVA FUNCIÓN PARA AJUSTES DE IMAGEN
// ============================================================================
function applyImageAdjustments(pixels, config) {
    const brightness = config.brightness;
    const contrast = config.contrast;
    const saturation = config.saturation;

    // No hacer nada si los valores son los por defecto para optimizar
    if (brightness === 0 && contrast === 1.0 && saturation === 1.0) {
        return;
    }

    const len = pixels.length;
    for (let i = 0; i < len; i += 4) {
        let r = pixels[i];
        let g = pixels[i + 1];
        let b = pixels[i + 2];

        // 1. Contraste y Brillo
        r = (r - 127.5) * contrast + 127.5 + brightness;
        g = (g - 127.5) * contrast + 127.5 + brightness;
        b = (b - 127.5) * contrast + 127.5 + brightness;

        // 2. Saturación
        if (saturation !== 1.0) {
            const luma = r * 0.299 + g * 0.587 + b * 0.114;
            r = luma + (r - luma) * saturation;
            g = luma + (g - luma) * saturation;
            b = luma + (b - luma) * saturation;
        }
        
        // Asegurarse de que los valores permanezcan en el rango 0-255
        pixels[i] = Math.max(0, Math.min(255, r));
        pixels[i + 1] = Math.max(0, Math.min(255, g));
        pixels[i + 2] = Math.max(0, Math.min(255, b));
    }
}

// ============================================================================
// ALGORITMOS DE DITHERING (MODIFICADOS PARA USAR LOS AJUSTES)
// ============================================================================

function drawPosterize(p, buffer, src, w, h, cfg, lumaLUT) {
  const scale = cfg.ditherScale;
  const pw = Math.floor(w / scale);
  const ph = Math.floor(h / scale);
  
  buffer.image(src, 0, 0, pw, ph);
  buffer.loadPixels();
  
  const pixels = new Uint8ClampedArray(buffer.pixels);
  applyImageAdjustments(pixels, cfg); // <-- APLICAR AJUSTES
  
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
  
  buffer.pixels.set(pixels);
  buffer.updatePixels();
}

function drawDither(p, buffer, src, w, h, cfg, lumaLUT, bayerLUT) {
  const scale = cfg.ditherScale;
  const pw = Math.floor(w / scale);
  const ph = Math.floor(h / scale);
  
  buffer.image(src, 0, 0, pw, ph);
  buffer.loadPixels();
  
  const pix = new Uint8ClampedArray(buffer.pixels);
  applyImageAdjustments(pix, cfg); // <-- APLICAR AJUSTES

  if (cfg.useOriginalColor) {
    const levels = 4;
    const step = 255 / (levels - 1);
    const kernel = KERNELS[cfg.effect];
    if (!kernel && cfg.effect !== 'bayer') return;

    for (let y = 0; y < ph; y++) {
      const isReversed = cfg.serpentineScan && y % 2 === 1;
      const xStart = isReversed ? pw - 1 : 0;
      const xEnd = isReversed ? -1 : pw;
      const xStep = isReversed ? -1 : 1;
      
      for (let x = xStart; x !== xEnd; x += xStep) {
        const i = (y * pw + x) * 4;
        const oldR = pix[i];
        const oldG = pix[i + 1];
        const oldB = pix[i + 2];
        
        const newR = Math.round(oldR / step) * step;
        const newG = Math.round(oldG / step) * step;
        const newB = Math.round(oldB / step) * step;

        pix[i] = newR;
        pix[i + 1] = newG;
        pix[i + 2] = newB;

        if (cfg.effect === 'bayer') continue;

        const errR = (oldR - newR) * cfg.diffusionStrength;
        const errG = (oldG - newG) * cfg.diffusionStrength;
        const errB = (oldB - newB) * cfg.diffusionStrength;

        const points = kernel.points;
        const divisor = kernel.divisor;
        
        for (let j = 0; j < points.length; j++) {
          const pt = points[j];
          const dx = isReversed ? -pt.dx : pt.dx;
          const nx = x + dx;
          const ny = y + pt.dy;
          
          if (nx >= 0 && nx < pw && ny >= 0 && ny < ph) {
            const ni = (ny * pw + nx) * 4;
            const weight = pt.w / divisor;
            pix[ni] = Math.min(255, Math.max(0, pix[ni] + errR * weight));
            pix[ni + 1] = Math.min(255, Math.max(0, pix[ni + 1] + errG * weight));
            pix[ni + 2] = Math.min(255, Math.max(0, pix[ni + 2] + errB * weight));
          }
        }
      }
    }
  } else {
    if (cfg.effect === 'bayer') {
      const levels = cfg.colorCount;
      const baseStrength = 255 / levels;
      const ditherStrength = baseStrength * cfg.patternStrength * 2;
      
      for (let y = 0; y < ph; y++) {
        for (let x = 0; x < pw; x++) {
          const i = (y * pw + x) * 4;
          const ditherOffset = bayerLUT.get(x, y) * ditherStrength;
          const luma = pix[i] * 0.299 + pix[i + 1] * 0.587 + pix[i + 2] * 0.114;
          const adjustedLuma = Math.min(255, Math.max(0, luma + ditherOffset));
          const [r, g, b] = lumaLUT.map(adjustedLuma);
          pix[i] = r;
          pix[i + 1] = g;
          pix[i + 2] = b;
        }
      }
    } else {
      const kernel = KERNELS[cfg.effect];
      if (!kernel) return;
      
      const levels = cfg.colorCount;
      const step = 255 / (levels > 1 ? levels - 1 : 1);
      
      for (let y = 0; y < ph; y++) {
        const isReversed = cfg.serpentineScan && y % 2 === 1;
        const xStart = isReversed ? pw - 1 : 0;
        const xEnd = isReversed ? -1 : pw;
        const xStep = isReversed ? -1 : 1;
        
        for (let x = xStart; x !== xEnd; x += xStep) {
          const i = (y * pw + x) * 4;
          const oldLuma = pix[i] * 0.299 + pix[i + 1] * 0.587 + pix[i + 2] * 0.114;
          const newLuma = Math.round(oldLuma / step) * step;
          const [r, g, b] = lumaLUT.map(newLuma);
          
          pix[i] = r;
          pix[i + 1] = g;
          pix[i + 2] = b;
          
          const err = (oldLuma - newLuma) * cfg.diffusionStrength;
          const points = kernel.points;
          const divisor = kernel.divisor;
          
          for (let j = 0; j < points.length; j++) {
            const pt = points[j];
            const dx = isReversed ? -pt.dx : pt.dx;
            const nx = x + dx;
            const ny = y + pt.dy;
            
            if (nx >= 0 && nx < pw && ny >= 0 && ny < ph) {
              const ni = (ny * pw + nx) * 4;
              const weight = pt.w / divisor;
              const adjustment = err * weight;
              pix[ni] = Math.min(255, Math.max(0, pix[ni] + adjustment));
              pix[ni + 1] = Math.min(255, Math.max(0, pix[ni + 1] + adjustment));
              pix[ni + 2] = Math.min(255, Math.max(0, pix[ni + 2] + adjustment));
            }
          }
        }
      }
    }
  }
  
  buffer.pixels.set(pix);
  buffer.updatePixels();
}

function drawBlueNoise(p, buffer, src, w, h, cfg, lumaLUT, blueNoiseLUT) {
  const scale = cfg.ditherScale;
  const pw = Math.floor(w / scale);
  const ph = Math.floor(h / scale);
  
  buffer.image(src, 0, 0, pw, ph);
  buffer.loadPixels();
  
  const pix = new Uint8ClampedArray(buffer.pixels);
  applyImageAdjustments(pix, cfg); // <-- APLICAR AJUSTES

  const levels = cfg.colorCount;
  const baseStrength = 255 / levels;
  const ditherStrength = baseStrength * cfg.patternStrength * 2;
  
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const i = (y * pw + x) * 4;
      const ditherOffset = blueNoiseLUT.get(x, y) * ditherStrength;
      const luma = pix[i] * 0.299 + pix[i + 1] * 0.587 + pix[i + 2] * 0.114;
      const adjustedLuma = Math.min(255, Math.max(0, luma + ditherOffset));
      const [r, g, b] = lumaLUT.map(adjustedLuma);
      pix[i] = r;
      pix[i + 1] = g;
      pix[i + 2] = b;
    }
  }
  
  buffer.pixels.set(pix);
  buffer.updatePixels();
}

function drawVariableError(p, buffer, src, w, h, cfg, lumaLUT) {
  const scale = cfg.ditherScale;
  const pw = Math.floor(w / scale);
  const ph = Math.floor(h / scale);
  
  buffer.image(src, 0, 0, pw, ph);
  buffer.loadPixels();
  
  const pix = new Uint8ClampedArray(buffer.pixels);
  applyImageAdjustments(pix, cfg); // <-- APLICAR AJUSTES

  const kernel = KERNELS['floyd-steinberg'];
  
  // Calcular gradientes para detectar bordes
  const gradients = new Float32Array(pw * ph);
  for (let y = 1; y < ph - 1; y++) {
    for (let x = 1; x < pw - 1; x++) {
      const i = (y * pw + x) * 4;
      const gx = Math.abs(pix[i + 4] - pix[i - 4]);
      const gy = Math.abs(pix[i + pw * 4] - pix[i - pw * 4]);
      gradients[y * pw + x] = Math.sqrt(gx * gx + gy * gy) / 255;
    }
  }
  
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const i = (y * pw + x) * 4;
      const gradient = gradients[y * pw + x] || 0;
      const adaptiveStrength = cfg.diffusionStrength * (1 - gradient * 0.5);
      
      const oldLuma = pix[i] * 0.299 + pix[i + 1] * 0.587 + pix[i + 2] * 0.114;
      const step = 255 / (cfg.colorCount > 1 ? cfg.colorCount - 1 : 1);
      const newLuma = Math.round(oldLuma / step) * step;
      const [r, g, b] = lumaLUT.map(newLuma);
      
      pix[i] = r;
      pix[i + 1] = g;
      pix[i + 2] = b;
      
      const err = (oldLuma - newLuma) * adaptiveStrength;
      
      for (const pt of kernel.points) {
        const nx = x + pt.dx;
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
  
  buffer.pixels.set(pix);
  buffer.updatePixels();
}

// ============================================================================
// UTILIDADES
// ============================================================================
// (Las funciones de Hilbert se han eliminado - Riemersma ahora usa patrón simplificado)
