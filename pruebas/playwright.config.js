// Pruebas automáticas de la app (modo demo, en local). Usan el Chrome instalado en el equipo: no descargan
// navegadores. Ejecutar desde esta carpeta:  npm install  (la primera vez)  y después  npx playwright test
// Necesitan privado/secretos.json (las respuestas se leen de ahí: nunca se escriben en las pruebas).
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  timeout: 60000,
  fullyParallel: true,
  workers: 3,
  expect: { timeout: 10000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8091',
    channel: 'chrome',
    headless: true,
    serviceWorkers: 'block', // sin caché del service worker: siempre la versión actual de web/
    locale: 'es-ES',
  },
  projects: [
    { name: 'movil', use: { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true } },
    { name: 'escritorio', use: { viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: {
    command: 'python servidor.py 8091',
    url: 'http://localhost:8091/index.html',
    reuseExistingServer: true,
  },
});
