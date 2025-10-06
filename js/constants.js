// ============================================================================
// CONSTANTES Y DATOS ESTÁTICOS
// ============================================================================

const KERNELS = {
  'floyd-steinberg': {
    divisor: 16, 
    points: [
      {dx:1, dy:0, w:7},
      {dx:-1, dy:1, w:3},
      {dx:0, dy:1, w:5},
      {dx:1, dy:1, w:1}
    ]
  },
  'atkinson': {
    divisor: 8, 
    points: [
      {dx:1, dy:0, w:1},
      {dx:2, dy:0, w:1},
      {dx:-1, dy:1, w:1},
      {dx:0, dy:1, w:1},
      {dx:1, dy:1, w:1},
      {dx:0, dy:2, w:1}
    ]
  },
  'stucki': {
    divisor: 42, 
    points: [
      {dx:1, dy:0, w:8}, {dx:2, dy:0, w:4},
      {dx:-2, dy:1, w:2}, {dx:-1, dy:1, w:4}, {dx:0, dy:1, w:8}, {dx:1, dy:1, w:4}, {dx:2, dy:1, w:2},
      {dx:-2, dy:2, w:1}, {dx:-1, dy:2, w:2}, {dx:0, dy:2, w:4}, {dx:1, dy:2, w:2}, {dx:2, dy:2, w:1}
    ]
  }
};

const ALGORITHM_INFO = {
  'none': "Muestra el medio original sin procesamiento.",
  'posterize': "Reduce los colores sin tramado. Útil para ver el 'banding' de color puro.",
  'floyd-steinberg': 'Algoritmo de difusión de error más popular. Balance perfecto entre velocidad y calidad. Distribuye el error a 4 píxeles vecinos.',
  'atkinson': "Difusión parcial desarrollada en Apple. Solo distribuye 6/8 del error, creando imágenes con más contraste y brillo. Icónico del Mac clásico.",
  'stucki': "Difusión compleja a 12 píxeles vecinos. Produce el tramado más suave y de mayor calidad, ideal para gradientes.",
  'bayer': 'Dithering ordenado con matriz de umbrales fija. Produce un patrón geométrico característico. Extremadamente rápido, estética retro.',
  'blue-noise': "Dithering ordenado de alta calidad usando ruido azul. Produce patrones menos perceptibles que Bayer, más agradable visualmente.",
  'variable-error': "Algoritmo adaptativo que ajusta la difusión según el contenido local. Preserva mejor los bordes y detalles finos."
};

const ALGORITHM_NAMES = {
  'none': "Ninguno", 
  'posterize': "Posterize", 
  'floyd-steinberg': "Floyd-Steinberg", 
  'atkinson': "Atkinson",
  'stucki': "Stucki",
  'bayer': "Bayer",
  'blue-noise': "Blue Noise",
  'variable-error': "Variable Error"
};
