// ============================================================================
// CLASES AUXILIARES PARA OPTIMIZACIÓN
// ============================================================================

class BufferPool {
  constructor() {
    this.buffers = new Map();
    this.lastUsed = new Map(); // OPTIMIZACIÓN: Tracking para cleanup
  }
  
  get(width, height, p) {
    const key = `${width}x${height}`;
    this.lastUsed.set(key, Date.now());
    
    if (!this.buffers.has(key)) {
      const buffer = p.createGraphics(width, height);
      buffer.elt.getContext('2d', { 
        willReadFrequently: true,
        alpha: false // OPTIMIZACIÓN: Sin alpha si no se usa transparencia
      });
      buffer.pixelDensity(1);
      this.buffers.set(key, buffer);
    }
    return this.buffers.get(key);
  }
  
  // OPTIMIZACIÓN: Limpiar buffers viejos
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

// NUEVO: Gestor de matrices Bayer para diferentes tamaños
class BayerLutManager {
    constructor() {
        this.luts = {};
        for (const size in BAYER_MATRICES) {
            const matrix = BAYER_MATRICES[size];
            const n = parseInt(size);
            const nSq = n * n;
            const lut = new Float32Array(nSq);
            for (let y = 0; y < n; y++) {
                for (let x = 0; x < n; x++) {
                    lut[y * n + x] = (matrix[y][x] / nSq - 0.5);
                }
            }
            this.luts[size] = { lut, size: n };
        }
    }

    get(size) {
        return this.luts[size] || this.luts[4]; // Default a 4x4 si el tamaño no es válido
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
// FUNCIÓN PARA AJUSTES DE IMAGEN (MODIFICADA CON SOPORTE PARA CURVAS)
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
// ALGORITMOS DE DITHERING
// ============================================================================

function drawPosterize(p, buffer, src, w, h, cfg, lumaLUT) {
  // Ya no se usa la escala, se procesa a resolución completa
  buffer.image(src, 0, 0, w, h);
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

// NUEVO: La función ahora usa bayerLutManager y no escala la imagen
function drawDither(p, buffer, src, w, h, cfg, lumaLUT, bayerLutManager) {
  // Se procesa a resolución completa, sin 'pw' y 'ph'
  buffer.image(src, 0, 0, w, h);
  buffer.loadPixels();
  
  const pix = buffer.pixels;
  applyImageAdjustments(pix, cfg);

  if (cfg.useOriginalColor) {
    const levels = 4;
    const step = 255 / (levels - 1);
    const kernel = KERNELS[cfg.effect];
    if (!kernel && cfg.effect !== 'bayer') return;

    for (let y = 0; y < h; y++) {
      const isReversed = cfg.serpentineScan && y % 2 === 1;
      const xStart = isReversed ? w - 1 : 0;
      const xEnd = isReversed ? -1 : w;
      const xStep = isReversed ? -1 : 1;
      
      for (let x = xStart; x !== xEnd; x += xStep) {
        const i = (y * w + x) * 4;
        const oldR = pix[i], oldG = pix[i+1], oldB = pix[i+2];
        const newR = Math.round(oldR / step) * step;
        const newG = Math.round(oldG / step) * step;
        const newB = Math.round(oldB / step) * step;
        pix[i] = newR; pix[i+1] = newG; pix[i+2] = newB;

        if (cfg.effect === 'bayer') continue;

        let errR = (oldR - newR) * cfg.diffusionStrength;
        let errG = (oldG - newG) * cfg.diffusionStrength;
        let errB = (oldB - newB) * cfg.diffusionStrength;
        
        // NUEVO: Cuantización de Error
        if (cfg.errorQuantization > 0) {
            const quant = cfg.errorQuantization;
            errR = Math.round(errR / quant) * quant;
            errG = Math.round(errG / quant) * quant;
            errB = Math.round(errB / quant) * quant;
        }

        const { points, divisor } = kernel;
        for (let j = 0; j < points.length; j++) {
          const pt = points[j];
          const dx = isReversed ? -pt.dx : pt.dx;
          const nx = x + dx, ny = y + pt.dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const ni = (ny * w + nx) * 4;
            const weight = pt.w / divisor;
            pix[ni]   = Math.min(255, Math.max(0, pix[ni]   + errR * weight));
            pix[ni+1] = Math.min(255, Math.max(0, pix[ni+1] + errG * weight));
            pix[ni+2] = Math.min(255, Math.max(0, pix[ni+2] + errB * weight));
          }
        }
      }
    }
  } else {
    if (cfg.effect === 'bayer') {
        const bayer = bayerLutManager.get(cfg.patternSize);
        const bayerMatrix = bayer.lut;
        const matrixSize = bayer.size;
        const levels = cfg.colorCount;
        const baseStrength = 255 / levels;
        const ditherStrength = baseStrength * cfg.patternStrength * 2;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const matrixIndex = (y % matrixSize) * matrixSize + (x % matrixSize);
                const ditherOffset = bayerMatrix[matrixIndex] * ditherStrength;
                const luma = pix[i] * 0.299 + pix[i + 1] * 0.587 + pix[i + 2] * 0.114;
                const adjustedLuma = Math.min(255, Math.max(0, luma + ditherOffset));
                const [r, g, b] = lumaLUT.map(adjustedLuma);
                pix[i] = r; pix[i+1] = g; pix[i+2] = b;
            }
        }
    } else {
      const kernel = KERNELS[cfg.effect];
      if (!kernel) return;
      const levels = cfg.colorCount;
      const step = 255 / (levels > 1 ? levels - 1 : 1);
      const quant = cfg.errorQuantization;
      
      for (let y = 0; y < h; y++) {
        const isReversed = cfg.serpentineScan && y % 2 === 1;
        const xStart = isReversed ? w - 1 : 0;
        const xEnd = isReversed ? -1 : w;
        const xStep = isReversed ? -1 : 1;
        
        for (let x = xStart; x !== xEnd; x += xStep) {
          const i = (y * w + x) * 4;
          const oldLuma = pix[i] * 0.299 + pix[i + 1] * 0.587 + pix[i + 2] * 0.114;
          const newLuma = Math.round(oldLuma / step) * step;
          const [r, g, b] = lumaLUT.map(newLuma);
          pix[i] = r; pix[i + 1] = g; pix[i + 2] = b;
          
          let err = (oldLuma - newLuma) * cfg.diffusionStrength;
          
          // NUEVO: Cuantización del error
          if (quant > 0) {
              err = Math.round(err / quant) * quant;
          }

          const { points, divisor } = kernel;
          for (let j = 0; j < points.length; j++) {
            const pt = points[j];
            const dx = isReversed ? -pt.dx : pt.dx;
            const nx = x + dx, ny = y + pt.dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const ni = (ny * w + nx) * 4;
              const weight = pt.w / divisor;
              const adjustment = err * weight;
              pix[ni]   = Math.min(255, Math.max(0, pix[ni]   + adjustment));
              pix[ni+1] = Math.min(255, Math.max(0, pix[ni+1] + adjustment));
              pix[ni+2] = Math.min(255, Math.max(0, pix[ni+2] + adjustment));
            }
          }
        }
      }
    }
  }
  
  buffer.updatePixels();
}

function drawBlueNoise(p, buffer, src, w, h, cfg, lumaLUT, blueNoiseLUT) {
  buffer.image(src, 0, 0, w, h);
  buffer.loadPixels();
  
  const pix = buffer.pixels;
  applyImageAdjustments(pix, cfg);

  const levels = cfg.colorCount;
  const baseStrength = 255 / levels;
  const ditherStrength = baseStrength * cfg.patternStrength * 2;
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const ditherOffset = blueNoiseLUT.get(x, y) * ditherStrength;
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
  buffer.image(src, 0, 0, w, h);
  buffer.loadPixels();
  
  const pix = buffer.pixels;
  applyImageAdjustments(pix, cfg);

  const kernel = KERNELS['floyd-steinberg'];
  
  const gradients = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const gx = Math.abs(pix[i + 4] - pix[i - 4]);
      const gy = Math.abs(pix[i + w * 4] - pix[i - w * 4]);
      gradients[y * w + x] = Math.sqrt(gx * gx + gy * gy) / 255;
    }
  }
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const gradient = gradients[y * w + x] || 0;
      const adaptiveStrength = cfg.diffusionStrength * (1 - gradient * 0.5);
      
      const oldLuma = pix[i] * 0.299 + pix[i + 1] * 0.587 + pix[i + 2] * 0.114;
      const step = 255 / (cfg.colorCount > 1 ? cfg.colorCount - 1 : 1);
      const newLuma = Math.round(oldLuma / step) * step;
      const [r, g, b] = lumaLUT.map(newLuma);
      
      pix[i] = r;
      pix[i + 1] = g;
      pix[i + 2] = b;
      
      let err = (oldLuma - newLuma) * adaptiveStrength;
      
      // La cuantización también se puede aplicar aquí si se desea
      if (cfg.errorQuantization > 0) {
        err = Math.round(err / cfg.errorQuantization) * cfg.errorQuantization;
      }
      
      for (const pt of kernel.points) {
        const nx = x + pt.dx;
        const ny = y + pt.dy;
        
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const ni = (ny * w + nx) * 4;
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
