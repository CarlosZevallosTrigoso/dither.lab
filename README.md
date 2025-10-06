# DitherLab v6 - Enhanced Edition

Procesador avanzado de dithering con análisis de métricas y exportación multipformato.

## 🚀 Demo en Vivo

[Ver Demo](https://tu-usuario.github.io/ditherlab/)

## ✨ Características

### Algoritmos de Dithering
- **Clásicos**: Floyd-Steinberg, Atkinson, Jarvis-Judice-Ninke, Stucki, Burkes, Sierra
- **Avanzados**: Riemersma (Space-filling curve), Blue Noise, Variable Error Diffusion
- **Ordenados**: Bayer

### Paletas Icónicas
- Game Boy, Game Boy Pocket
- CGA, ZX Spectrum, Commodore 64, Apple II, NES
- Pico-8, Demichrome, y más
- Paletas personalizables (2-8 colores)

### Exportación
- **Video WebM** (tiempo real, 4 niveles de calidad)
- **GIF Animado** (5-30 FPS, calidad ajustable)
- **Sprite Sheets** (configurables)
- **Secuencias PNG** (frames individuales)
- **PNG** (frame actual)

### Métricas de Análisis
- **PSNR** (Peak Signal-to-Noise Ratio)
- **SSIM** (Structural Similarity Index)
- **Compresión de color**
- **Tiempo de procesamiento**

### PWA
- Funciona offline
- Instalable en escritorio y móvil
- Caché inteligente de recursos

## 🛠️ Instalación Local

```bash
# Clonar repositorio
git clone https://github.com/tu-usuario/ditherlab.git
cd ditherlab

# Servir con servidor HTTP simple
python3 -m http.server 8000
# O con Node.js
npx serve
```

Abrir `http://localhost:8000` en el navegador.

## 📦 Deployment en GitHub Pages

1. Fork este repositorio
2. Ve a Settings → Pages
3. Selecciona "Deploy from a branch"
4. Elige `main` branch, carpeta `/ (root)`
5. Guarda

Tu app estará en: `https://tu-usuario.github.io/ditherlab/`

## ⌨️ Atajos de Teclado

- `ESPACIO` - Play/Pause
- `←` / `→` - Frame anterior/siguiente
- `I` / `O` - Marcar entrada/salida
- `R` - Iniciar grabación
- `S` - Detener grabación
- `D` - Exportar PNG
- `F` - Pantalla completa
- `M` - Ver métricas
- `?` - Mostrar atajos

## 🎨 Uso

1. **Cargar medio**: Arrastra video o imagen al área designada
2. **Seleccionar algoritmo**: Elige entre 10 algoritmos de dithering
3. **Ajustar paleta**: Usa paletas icónicas o crea la tuya
4. **Configurar**: Ajusta escala, fuerza de difusión, etc.
5. **Exportar**: Graba WebM, exporta GIF, o descarga PNG

## 🏗️ Estructura del Proyecto

```
ditherlab/
├── index.html              # HTML principal
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker
├── css/
│   └── styles.css          # Estilos
├── js/
│   ├── constants.js        # Paletas y kernels
│   ├── algorithms.js       # Algoritmos de dithering
│   ├── metrics.js          # Cálculo de métricas
│   ├── export.js           # Funciones de exportación
│   ├── ui.js               # Manejo de interfaz
│   ├── app.js              # Sketch p5.js principal
│   └── pwa.js              # Setup PWA
└── README.md
```

## 🔧 Tecnologías

- **p5.js** - Procesamiento de imágenes
- **Tailwind CSS** - Estilos
- **gif.js** - Generación de GIFs
- **MediaRecorder API** - Grabación de video
- **Service Workers** - Funcionalidad offline
- **Cache API** - Almacenamiento de recursos

## 📝 Notas Técnicas

### Sobre MP4
El navegador NO soporta exportación directa a MP4. Solo WebM (VP9/VP8) es posible con MediaRecorder API. Para MP4 real necesitarías FFmpeg.wasm (no incluido por complejidad).

### Rendimiento
- Usa `ditherScale` mayor para videos grandes (2-4 recomendado)
- Los algoritmos avanzados son más lentos pero dan mejor calidad
- Blue Noise y Variable Error son más rápidos que Riemersma

### Limitaciones
- Videos muy largos (>5min) pueden consumir mucha RAM en exportación
- GIF limitado a ~500 frames para mejor rendimiento
- Service Worker requiere HTTPS (o localhost)

## 📄 Licencia

MIT

## 🤝 Contribuir

Pull requests son bienvenidos. Para cambios mayores, abre primero un issue.

## 👤 Autor

Tu Nombre - [@tu-usuario](https://github.com/tu-usuario)
