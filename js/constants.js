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
  },
  'jarvis-judice-ninke': {
    divisor: 48,
    points: [
      {dx:1, dy:0, w:7}, {dx:2, dy:0, w:5},
      {dx:-2, dy:1, w:3}, {dx:-1, dy:1, w:5}, {dx:0, dy:1, w:7}, {dx:1, dy:1, w:5}, {dx:2, dy:1, w:3},
      {dx:-2, dy:2, w:1}, {dx:-1, dy:2, w:3}, {dx:0, dy:2, w:5}, {dx:1, dy:2, w:3}, {dx:2, dy:2, w:1}
    ]
  },
  'sierra': {
    divisor: 32,
    points: [
      {dx:1, dy:0, w:5}, {dx:2, dy:0, w:3},
      {dx:-2, dy:1, w:2}, {dx:-1, dy:1, w:4}, {dx:0, dy:1, w:5}, {dx:1, dy:1, w:4}, {dx:2, dy:1, w:2},
      {dx:-1, dy:2, w:2}, {dx:0, dy:2, w:3}, {dx:1, dy:2, w:2}
    ]
  },
  'sierra-lite': {
    divisor: 4,
    points: [
      {dx:1, dy:0, w:2},
      {dx:-1, dy:1, w:1}, {dx:0, dy:1, w:1}
    ]
  },
  'burkes': {
    divisor: 32,
    points: [
      {dx:1, dy:0, w:8}, {dx:2, dy:0, w:4},
      {dx:-2, dy:1, w:2}, {dx:-1, dy:1, w:4}, {dx:0, dy:1, w:8}, {dx:1, dy:1, w:4}, {dx:2, dy:1, w:2}
    ]
  }
};

// NUEVO: Matrices de Bayer de diferentes tamaños
const BAYER_MATRICES = {
  2: [
    [0, 2],
    [3, 1]
  ],
  4: [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ],
  8: [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21]
  ]
};

const ALGORITHM_INFO = {
  'none': "Muestra el medio original sin procesamiento.",
  'posterize': "Reduce los colores sin tramado. Útil para ver el 'banding' de color puro.",
  'floyd-steinberg': 'Algoritmo de difusión de error más popular. Balance perfecto entre velocidad y calidad. Distribuye el error a 4 píxeles vecinos.',
  'atkinson': "Difusión parcial desarrollada en Apple. Solo distribuye 6/8 del error, creando imágenes con más contraste y brillo. Icónico del Mac clásico.",
  'stucki': "Difusión compleja a 12 píxeles vecinos. Produce el tramado más suave y de mayor calidad, ideal para gradientes.",
  'bayer': 'Dithering ordenado con matriz de umbrales fija. Produce un patrón geométrico característico. Extremadamente rápido, estética retro.',
  'blue-noise': "Dithering ordenado de alta calidad usando ruido azul. Produce patrones menos perceptibles que Bayer, más agradable visualmente.",
  'variable-error': "Algoritmo adaptativo que ajusta la difusión según el contenido local. Preserva mejor los bordes y detalles finos.",
  'jarvis-judice-ninke': "Difusión de error a 12 píxeles. Mayor área de difusión que Floyd-Steinberg, produce resultados muy suaves con menos artefactos.",
  'sierra': "Variante de difusión de error con 10 píxeles. Balance entre Stucki y Floyd-Steinberg. Buena calidad con rendimiento aceptable.",
  'sierra-lite': "Versión ligera de Sierra con solo 4 píxeles. Muy rápido, ideal para preview o imágenes grandes. Similar a Floyd-Steinberg pero más simple.",
  'burkes': "Difusión de error a 7 píxeles. Distribución equilibrada similar a Sierra. Buenos resultados con fotografías y gradientes."
};

const ALGORITHM_NAMES = {
  'none': "Ninguno", 
  'posterize': "Posterize", 
  'floyd-steinberg': "Floyd-Steinberg", 
  'atkinson': "Atkinson",
  'stucki': "Stucki",
  'bayer': "Bayer",
  'blue-noise': "Blue Noise",
  'variable-error': "Variable Error",
  'jarvis-judice-ninke': "Jarvis-Judice-Ninke",
  'sierra': "Sierra",
  'sierra-lite': "Sierra Lite",
  'burkes': "Burkes"
};
