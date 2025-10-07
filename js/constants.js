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

// ============================================================================
// PARÁMETROS ESPECÍFICOS POR ALGORITMO
// ============================================================================

const ALGORITHM_PARAMETERS = {
  'floyd-steinberg': {
    params: [
      {
        id: 'diffusionStrength',
        label: 'Fuerza de Difusión',
        type: 'range',
        min: 0,
        max: 150,
        default: 100,
        step: 5,
        unit: '%',
        description: 'Intensidad con la que se propaga el error a píxeles vecinos'
      },
      {
        id: 'errorBiasX',
        label: 'Sesgo Horizontal',
        type: 'range',
        min: -100,
        max: 100,
        default: 0,
        step: 10,
        unit: '%',
        description: 'Favorece la difusión hacia izquierda (negativo) o derecha (positivo)'
      },
      {
        id: 'errorBiasY',
        label: 'Sesgo Vertical',
        type: 'range',
        min: -100,
        max: 100,
        default: 0,
        step: 10,
        unit: '%',
        description: 'Favorece la difusión hacia arriba (negativo) o abajo (positivo)'
      },
      {
        id: 'sharpening',
        label: 'Nitidez',
        type: 'range',
        min: 50,
        max: 200,
        default: 100,
        step: 10,
        unit: '%',
        description: 'Aumenta el contraste en la propagación del error'
      },
      {
        id: 'serpentine',
        label: 'Escaneo Serpentina',
        type: 'checkbox',
        default: false,
        description: 'Alterna la dirección de procesamiento por fila para reducir artefactos'
      }
    ]
  },

  'atkinson': {
    params: [
      {
        id: 'diffusionStrength',
        label: 'Fuerza de Difusión',
        type: 'range',
        min: 0,
        max: 150,
        default: 100,
        step: 5,
        unit: '%',
        description: 'Intensidad base de la difusión del error'
      },
      {
        id: 'errorRetention',
        label: 'Retención de Error',
        type: 'range',
        min: 50,
        max: 100,
        default: 75,
        step: 5,
        unit: '%',
        description: 'Porcentaje del error que se propaga (original: 75%). Valores bajos aumentan brillo'
      },
      {
        id: 'brightnessCompensation',
        label: 'Compensación Brillo',
        type: 'range',
        min: -30,
        max: 30,
        default: 0,
        step: 1,
        unit: '',
        description: 'Ajusta el brillo para compensar la tendencia de Atkinson a aclarar'
      },
      {
        id: 'temporalExtension',
        label: 'Extensión Temporal',
        type: 'range',
        min: 1,
        max: 3,
        default: 2,
        step: 1,
        unit: ' filas',
        description: 'Número de filas futuras que reciben error'
      },
      {
        id: 'serpentine',
        label: 'Escaneo Serpentina',
        type: 'checkbox',
        default: false,
        description: 'Alterna dirección de escaneo'
      }
    ]
  },

  'stucki': {
    params: [
      {
        id: 'diffusionStrength',
        label: 'Fuerza de Difusión',
        type: 'range',
        min: 0,
        max: 150,
        default: 100,
        step: 5,
        unit: '%',
        description: 'Intensidad de propagación del error'
      },
      {
        id: 'diffusionRadius',
        label: 'Radio de Difusión',
        type: 'range',
        min: 1,
        max: 3,
        default: 2,
        step: 1,
        unit: ' px',
        description: 'Área de influencia del error. Mayor radio = más suave'
      },
      {
        id: 'centerWeight',
        label: 'Peso Central',
        type: 'range',
        min: 50,
        max: 200,
        default: 100,
        step: 10,
        unit: '%',
        description: 'Énfasis en píxeles cercanos vs lejanos'
      },
      {
        id: 'serpentine',
        label: 'Escaneo Serpentina',
        type: 'checkbox',
        default: false,
        description: 'Alterna dirección de escaneo'
      }
    ]
  },

  'jarvis-judice-ninke': {
    params: [
      {
        id: 'diffusionStrength',
        label: 'Fuerza de Difusión',
        type: 'range',
        min: 0,
        max: 150,
        default: 100,
        step: 5,
        unit: '%',
        description: 'Intensidad de propagación del error'
      },
      {
        id: 'diffusionRadius',
        label: 'Radio de Difusión',
        type: 'range',
        min: 1,
        max: 3,
        default: 2,
        step: 1,
        unit: ' px',
        description: 'Extensión espacial del error'
      },
      {
        id: 'errorBiasX',
        label: 'Sesgo Horizontal',
        type: 'range',
        min: -100,
        max: 100,
        default: 0,
        step: 10,
        unit: '%',
        description: 'Favorece difusión izquierda/derecha'
      },
      {
        id: 'serpentine',
        label: 'Escaneo Serpentina',
        type: 'checkbox',
        default: true,
        description: 'Alterna dirección de escaneo (recomendado para JJN)'
      }
    ]
  },

  'sierra': {
    params: [
      {
        id: 'diffusionStrength',
        label: 'Fuerza de Difusión',
        type: 'range',
        min: 0,
        max: 150,
        default: 100,
        step: 5,
        unit: '%',
        description: 'Intensidad de propagación del error'
      },
      {
        id: 'diffusionRadius',
        label: 'Radio de Difusión',
        type: 'range',
        min: 1,
        max: 2,
        default: 2,
        step: 1,
        unit: ' px',
        description: 'Área de influencia (1 o 2 píxeles)'
      },
      {
        id: 'filterStrength',
        label: 'Fuerza del Filtro',
        type: 'range',
        min: 50,
        max: 150,
        default: 100,
        step: 10,
        unit: '%',
        description: 'Ajusta la distribución de pesos'
      },
      {
        id: 'serpentine',
        label: 'Escaneo Serpentina',
        type: 'checkbox',
        default: false,
        description: 'Alterna dirección de escaneo'
      }
    ]
  },

  'sierra-lite': {
    params: [
      {
        id: 'diffusionStrength',
        label: 'Fuerza de Difusión',
        type: 'range',
        min: 0,
        max: 150,
        default: 100,
        step: 5,
        unit: '%',
        description: 'Intensidad de propagación del error'
      },
      {
        id: 'errorBiasX',
        label: 'Sesgo Horizontal',
        type: 'range',
        min: -100,
        max: 100,
        default: 0,
        step: 10,
        unit: '%',
        description: 'Favorece difusión izquierda/derecha'
      },
      {
        id: 'serpentine',
        label: 'Escaneo Serpentina',
        type: 'checkbox',
        default: false,
        description: 'Alterna dirección de escaneo'
      }
    ]
  },

  'burkes': {
    params: [
      {
        id: 'diffusionStrength',
        label: 'Fuerza de Difusión',
        type: 'range',
        min: 0,
        max: 150,
        default: 100,
        step: 5,
        unit: '%',
        description: 'Intensidad de propagación del error'
      },
      {
        id: 'errorBiasX',
        label: 'Sesgo Horizontal',
        type: 'range',
        min: -100,
        max: 100,
        default: 0,
        step: 10,
        unit: '%',
        description: 'Favorece difusión izquierda/derecha'
      },
      {
        id: 'sharpening',
        label: 'Nitidez',
        type: 'range',
        min: 50,
        max: 200,
        default: 100,
        step: 10,
        unit: '%',
        description: 'Aumenta contraste en la propagación'
      },
      {
        id: 'serpentine',
        label: 'Escaneo Serpentina',
        type: 'checkbox',
        default: false,
        description: 'Alterna dirección de escaneo'
      }
    ]
  },

  'bayer': {
    params: [
      {
        id: 'matrixSize',
        label: 'Tamaño de Matriz',
        type: 'select',
        options: [
          { value: 2, label: '2×2 (Muy pixelado)' },
          { value: 4, label: '4×4 (Clásico)' },
          { value: 8, label: '8×8 (Suave)' },
          { value: 16, label: '16×16 (Muy suave)' }
        ],
        default: 4,
        description: 'Tamaño del patrón Bayer. Mayor = más suave pero más costoso'
      },
      {
        id: 'patternStrength',
        label: 'Intensidad del Patrón',
        type: 'range',
        min: 10,
        max: 200,
        default: 100,
        step: 10,
        unit: '%',
        description: 'Fuerza del efecto de dithering'
      },
      {
        id: 'thresholdBias',
        label: 'Sesgo de Umbral',
        type: 'range',
        min: -50,
        max: 50,
        default: 0,
        step: 5,
        unit: '%',
        description: 'Desplaza el patrón hacia oscuro (negativo) o claro (positivo)'
      },
      {
        id: 'rotation',
        label: 'Rotación',
        type: 'select',
        options: [
          { value: 0, label: '0°' },
          { value: 90, label: '90°' },
          { value: 180, label: '180°' },
          { value: 270, label: '270°' }
        ],
        default: 0,
        description: 'Rota el patrón Bayer'
      },
      {
        id: 'patternScale',
        label: 'Escala del Patrón',
        type: 'range',
        min: 50,
        max: 200,
        default: 100,
        step: 10,
        unit: '%',
        description: 'Amplifica o reduce el tamaño aparente del patrón'
      }
    ]
  },

  'blue-noise': {
    params: [
      {
        id: 'patternStrength',
        label: 'Intensidad del Patrón',
        type: 'range',
        min: 10,
        max: 200,
        default: 100,
        step: 10,
        unit: '%',
        description: 'Fuerza del efecto de dithering'
      },
      {
        id: 'noiseScale',
        label: 'Escala del Ruido',
        type: 'range',
        min: 50,
        max: 200,
        default: 100,
        step: 10,
        unit: '%',
        description: 'Frecuencia espacial del ruido azul'
      },
      {
        id: 'thresholdBias',
        label: 'Sesgo de Umbral',
        type: 'range',
        min: -50,
        max: 50,
        default: 0,
        step: 5,
        unit: '%',
        description: 'Desplaza hacia oscuro/claro'
      },
      {
        id: 'noiseVariant',
        label: 'Variante de Ruido',
        type: 'select',
        options: [
          { value: 'standard', label: 'Estándar' },
          { value: 'fine', label: 'Fino (Alta frecuencia)' },
          { value: 'coarse', label: 'Grueso (Baja frecuencia)' }
        ],
        default: 'standard',
        description: 'Tipo de distribución del ruido azul'
      }
    ]
  },

  'variable-error': {
    params: [
      {
        id: 'diffusionStrength',
        label: 'Fuerza Base',
        type: 'range',
        min: 0,
        max: 150,
        default: 100,
        step: 5,
        unit: '%',
        description: 'Intensidad base de difusión en áreas planas'
      },
      {
        id: 'edgeDetectionMethod',
        label: 'Método de Detección',
        type: 'select',
        options: [
          { value: 'gradient', label: 'Gradiente (Rápido)' },
          { value: 'sobel', label: 'Sobel (Balanceado)' },
          { value: 'laplacian', label: 'Laplaciano (Preciso)' },
          { value: 'canny', label: 'Canny (Lento, mejor calidad)' }
        ],
        default: 'gradient',
        description: 'Algoritmo para detectar bordes y detalles'
      },
      {
        id: 'edgeSensitivity',
        label: 'Sensibilidad a Bordes',
        type: 'range',
        min: 0,
        max: 200,
        default: 100,
        step: 10,
        unit: '%',
        description: 'Qué tan agresivamente se detectan los bordes'
      },
      {
        id: 'edgeThreshold',
        label: 'Umbral de Detección',
        type: 'range',
        min: 0,
        max: 100,
        default: 30,
        step: 5,
        unit: '',
        description: 'Valor mínimo para considerar un borde (solo Canny/Laplacian)'
      },
      {
        id: 'adaptiveRange',
        label: 'Rango Adaptativo',
        type: 'range',
        min: 10,
        max: 100,
        default: 50,
        step: 5,
        unit: '%',
        description: 'Cuánto varía la difusión entre bordes y áreas planas'
      },
      {
        id: 'detailPreservation',
        label: 'Preservación de Detalle',
        type: 'range',
        min: 0,
        max: 100,
        default: 50,
        step: 5,
        unit: '%',
        description: 'Reduce difusión en detalles finos para mantener nitidez'
      },
      {
        id: 'serpentine',
        label: 'Escaneo Serpentina',
        type: 'checkbox',
        default: false,
        description: 'Alterna dirección de escaneo'
      }
    ]
  },

  'posterize': {
    params: [
      // Posterize no necesita parámetros específicos adicionales
      // Solo usa colorCount de la configuración global
    ]
  },

  'none': {
    params: [
      // Sin efecto no necesita parámetros
    ]
  }
};
