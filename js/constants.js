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
  'jjn': {
    divisor: 48, 
    points: [
      {dx:1, dy:0, w:7}, {dx:2, dy:0, w:5},
      {dx:-2, dy:1, w:3}, {dx:-1, dy:1, w:5}, {dx:0, dy:1, w:7}, {dx:1, dy:1, w:5}, {dx:2, dy:1, w:3},
      {dx:-2, dy:2, w:1}, {dx:-1, dy:2, w:3}, {dx:0, dy:2, w:5}, {dx:1, dy:2, w:3}, {dx:2, dy:2, w:1}
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
  'burkes': {
    divisor: 32, 
    points: [
      {dx:1, dy:0, w:8}, {dx:2, dy:0, w:4},
      {dx:-2, dy:1, w:2}, {dx:-1, dy:1, w:4}, {dx:0, dy:1, w:8}, {dx:1, dy:1, w:4}, {dx:2, dy:1, w:2}
    ]
  },
  'sierra-2': {
    divisor: 16, 
    points: [
      {dx:1, dy:0, w:4}, {dx:2, dy:0, w:3},
      {dx:-2, dy:1, w:1}, {dx:-1, dy:1, w:2}, {dx:0, dy:1, w:3}, {dx:1, dy:1, w:2}, {dx:2, dy:1, w:1}
    ]
  }
};

const ALGORITHM_INFO = {
  'none': "Muestra el medio original sin procesamiento.",
  'posterize': "Reduce los colores sin tramado. Útil para ver el 'banding' de color.",
  'bayer': 'Dithering ordenado que usa una matriz de umbrales fija. Produce un patrón geométrico característico y es extremadamente rápido.',
  'floyd-steinberg': 'El algoritmo de difusión de error más popular. Distribuye el error de cuantización a los píxeles vecinos, creando un resultado orgánico y de alta calidad.',
  'atkinson': "Desarrollado en Apple para las primeras Macintosh. Solo difunde parte del error, lo que resulta en una imagen con más contraste.",
  'jjn': "Algoritmo de difusión complejo que distribuye el error a 12 píxeles vecinos. Produce un tramado más suave.",
  'stucki': "Variación de JJN que ajusta los pesos de la distribución para producir un resultado más limpio y nítido.",
  'burkes': "Algoritmo de difusión simplificado y rápido que ofrece un buen balance entre velocidad y calidad.",
  'sierra-2': "Variante rápida de Jarvis (JJN) que distribuye el error en solo dos filas, manteniendo una buena calidad visual.",
  'riemersma': "Algoritmo avanzado que sigue una curva de Hilbert (space-filling curve) para distribuir errores de manera más uniforme, reduciendo artefactos direccionales.",
  'blue-noise': "Usa una textura de ruido azul pre-calculada para dithering ordenado de alta calidad. Produce patrones menos perceptibles que Bayer y es más agradable visualmente.",
  'variable-error': "Híbrido que ajusta dinámicamente la fuerza de difusión según el contenido local de la imagen, preservando mejor bordes y detalles."
};

const ICONIC_PALETTES = {
  'gameboy': {
    name: 'Game Boy', 
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'], 
    description: 'Los clásicos 4 tonos verdes de Game Boy'
  },
  'gameboy-pocket': {
    name: 'Game Boy Pocket', 
    colors: ['#000000', '#545454', '#a9a9a9', '#ffffff'], 
    description: 'La paleta monocromática del GB Pocket'
  },
  'cga': {
    name: 'CGA', 
    colors: ['#000000', '#00aaaa', '#aa00aa', '#aaaaaa'], 
    description: 'Color Graphics Adapter (IBM PC, 1981)'
  },
  'cga-mode4-pal1': {
    name: 'CGA Mode 4', 
    colors: ['#000000', '#00aa00', '#aa0000', '#aa5500'], 
    description: 'Paleta 1 de CGA modo gráfico 4'
  },
  'pico8': {
    name: 'Pico-8', 
    colors: ['#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8'], 
    description: 'La vibrante paleta de 16 colores de Pico-8'
  },
  'zx-spectrum': {
    name: 'ZX Spectrum', 
    colors: ['#000000', '#0000cd', '#cd0000', '#cd00cd', '#00cd00', '#00cdcd', '#cdcd00', '#cdcdcd'], 
    description: 'Los 8 colores brillantes del Sinclair ZX'
  },
  'commodore64': {
    name: 'Commodore 64', 
    colors: ['#000000', '#ffffff', '#68372b', '#70a4b2', '#6f3d86', '#588d43', '#352879', '#b8c76f'], 
    description: 'Colores nostálgicos del C64'
  },
  'apple2': {
    name: 'Apple II', 
    colors: ['#000000', '#D03C27', '#6C2940', '#CC5500', '#0F626A', '#808080', '#1BCB01', '#E0B800'], 
    description: 'Paleta de alta resolución del Apple II'
  },
  'nes': {
    name: 'NES', 
    colors: ['#7C7C7C', '#0000FC', '#0000BC', '#4428BC', '#940084', '#A80020', '#A81000', '#881400'], 
    description: 'Primeros 8 colores de la paleta NES'
  },
  'demichrome': {
    name: 'Demichrome', 
    colors: ['#211e20', '#555568', '#a0a08b', '#e9efec'], 
    description: 'Paleta popular para juegos de GB homebrew'
  },
  'newspaper': {
    name: 'Newspaper', 
    colors: ['#000000', '#404040', '#808080', '#c0c0c0', '#ffffff'], 
    description: 'Optimizada para efecto de periódico'
  },
  'lcd': {
    name: 'LCD Green', 
    colors: ['#0f380f', '#9bbc0f'], 
    description: 'Solo 2 colores, como las calculadoras LCD'
  },
  'amber': {
    name: 'Amber Monitor', 
    colors: ['#000000', '#331a00', '#664d00', '#ffaa00'], 
    description: 'Monitor monocromático ámbar de los 80s'
  },
  'teletext': {
    name: 'Teletext', 
    colors: ['#000000', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'], 
    description: 'Los 8 colores del sistema Teletext'
  }
};

const ALGORITHM_NAMES = {
  'none': "Ninguno", 
  'posterize': "Cuantizar", 
  'bayer': "Bayer",
  'floyd-steinberg': "Floyd-Steinberg", 
  'atkinson': "Atkinson",
  'jjn': "Jarvis-Judice-Ninke", 
  'stucki': "Stucki",
  'burkes': "Burkes", 
  'sierra-2': "Sierra 2-row",
  'riemersma': "Riemersma", 
  'blue-noise': "Blue Noise",
  'variable-error': "Variable Error"
};
