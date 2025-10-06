// PWA Setup
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('Service Worker registrado:', reg);
        document.getElementById('pwaBadge').style.display = 'inline-block';
      })
      .catch(err => console.log('Service Worker falló:', err));
  });
}

// Detectar cambios de conectividad
window.addEventListener('online', () => {
  showToast('Conexión restaurada');
  document.getElementById('pwaBadge').textContent = 'PWA';
});

window.addEventListener('offline', () => {
  showToast('Modo offline');
  document.getElementById('pwaBadge').textContent = 'OFFLINE';
});
