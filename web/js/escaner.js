/*
 * Escáner de QR con la cámara trasera. Usa BarcodeDetector si el navegador lo trae (Chrome Android)
 * y jsQR (vendor/jsQR.js) en los demás, como Safari en iPhone.
 */
(function () {
  'use strict';
  const GK = window.GK;

  /**
   * Abre la cámara dentro de `contenedor` y llama a alLeer(texto) con el primer QR leído.
   * Devuelve una función para parar.
   */
  GK.escanear = async function (contenedor, alLeer, alFallar) {
    contenedor.innerHTML = `
      <div class="visor">
        <video playsinline muted></video>
        <div class="visor-marco"><i></i><i></i><i></i><i></i><div class="visor-linea"></div></div>
      </div>`;
    const video = contenedor.querySelector('video');
    const lienzo = document.createElement('canvas');
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    let flujo = null;
    let parado = false;
    let detector = null;

    const parar = () => {
      parado = true;
      if (flujo) flujo.getTracks().forEach((t) => t.stop());
    };

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alFallar('Este navegador no deja usar la cámara aquí. Abrid el QR con la app de cámara del móvil.');
      return parar;
    }
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch (e) {
      alFallar(e && e.name === 'NotAllowedError'
        ? 'No habéis dado permiso para la cámara. Permitidlo en el navegador o abrid el QR con la app de cámara del móvil.'
        : 'No se ha podido abrir la cámara. Abrid el QR con la app de cámara del móvil.');
      return parar;
    }
    if (parado) { parar(); return parar; }
    video.srcObject = flujo;
    try { await video.play(); } catch (e) { /* iOS a veces necesita un toque; seguimos intentando */ }

    if ('BarcodeDetector' in window) {
      try {
        const formatos = await window.BarcodeDetector.getSupportedFormats();
        if (formatos.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch (e) { detector = null; }
    }

    const tick = async () => {
      if (parado) return;
      if (video.readyState >= 2 && video.videoWidth) {
        let texto = null;
        try {
          if (detector) {
            const r = await detector.detect(video);
            if (r.length) texto = r[0].rawValue;
          } else if (window.jsQR) {
            const escala = Math.min(1, 640 / video.videoWidth);
            lienzo.width = Math.round(video.videoWidth * escala);
            lienzo.height = Math.round(video.videoHeight * escala);
            ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
            const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
            const r = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (r) texto = r.data;
          }
        } catch (e) { /* fotograma malo: seguimos */ }
        if (texto && !parado) {
          GK.vibrar(60);
          parar();
          alLeer(texto);
          return;
        }
      }
      setTimeout(() => requestAnimationFrame(tick), 120);
    };
    tick();
    return parar;
  };
})();
