// ============================================================================
// FUNCIONES DE CÁLCULO DE MÉTRICAS
// ============================================================================

function calculatePSNR(original, processed) {
  original.loadPixels();
  processed.loadPixels();
  
  let mse = 0;
  const len = original.pixels.length;
  
  for (let i = 0; i < len; i += 4) {
    const dr = original.pixels[i] - processed.pixels[i];
    const dg = original.pixels[i + 1] - processed.pixels[i + 1];
    const db = original.pixels[i + 2] - processed.pixels[i + 2];
    mse += (dr * dr + dg * dg + db * db) / 3;
  }
  
  mse /= (len / 4);
  
  if (mse === 0) return Infinity;
  
  const maxPixel = 255;
  return 10 * Math.log10((maxPixel * maxPixel) / mse);
}

function calculateSSIM(original, processed) {
  original.loadPixels();
  processed.loadPixels();
  
  let meanX = 0, meanY = 0;
  let varX = 0, varY = 0, covXY = 0;
  const len = original.pixels.length / 4;
  
  for (let i = 0; i < len * 4; i += 4) {
    const x = (original.pixels[i] + original.pixels[i + 1] + original.pixels[i + 2]) / 3;
    const y = (processed.pixels[i] + processed.pixels[i + 1] + processed.pixels[i + 2]) / 3;
    meanX += x;
    meanY += y;
  }
  
  meanX /= len;
  meanY /= len;
  
  for (let i = 0; i < len * 4; i += 4) {
    const x = (original.pixels[i] + original.pixels[i + 1] + original.pixels[i + 2]) / 3;
    const y = (processed.pixels[i] + processed.pixels[i + 1] + processed.pixels[i + 2]) / 3;
    varX += (x - meanX) * (x - meanX);
    varY += (y - meanY) * (y - meanY);
    covXY += (x - meanX) * (y - meanY);
  }
  
  varX /= len;
  varY /= len;
  covXY /= len;
  
  const c1 = 6.5025;
  const c2 = 58.5225;
  
  const ssim = ((2 * meanX * meanY + c1) * (2 * covXY + c2)) /
               ((meanX * meanX + meanY * meanY + c1) * (varX + varY + c2));
  
  return Math.max(0, Math.min(1, ssim));
}

function calculateCompression(buffer) {
  buffer.loadPixels();
  
  const uniqueColors = new Set();
  const len = buffer.pixels.length;
  
  for (let i = 0; i < len; i += 4) {
    const color = (buffer.pixels[i] << 16) | 
                  (buffer.pixels[i + 1] << 8) | 
                  buffer.pixels[i + 2];
    uniqueColors.add(color);
  }
  
  const maxColors = 256 * 256 * 256;
  const ratio = (1 - uniqueColors.size / maxColors) * 100;
  
  return { 
    unique: uniqueColors.size, 
    ratio: ratio 
  };
}
