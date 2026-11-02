(() => {
  'use strict';

  const installButton = document.getElementById('installButton');
  const installDialog = document.getElementById('installDialog');
  const offerDialog = document.getElementById('offerDialog');
  const VERSION_KEY = 'monster-radar-assets-version-v1';
  const ASSETS_TO_CHECK = ['./index.html', './styles.css', './app.js', './pwa.js', './manifest.webmanifest'];
  const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
  let installPrompt = null;
  let updateReloadQueued = false;

  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function reloadWhenSafe() {
    if (updateReloadQueued) return;
    updateReloadQueued = true;
    const reload = () => {
      if (offerDialog?.open) {
        offerDialog.addEventListener('close', reload, { once: true });
        return;
      }
      window.location.reload();
    };
    reload();
  }

  if (installButton) {
    if (isIOS && !isStandalone()) installButton.hidden = false;

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      installPrompt = event;
      if (!isStandalone()) installButton.hidden = false;
    });

    installButton.addEventListener('click', async () => {
      if (isIOS && !installPrompt) {
        installDialog?.showModal();
        return;
      }
      if (!installPrompt) return;
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      installPrompt = null;
      if (choice.outcome === 'accepted') installButton.hidden = true;
    });

    window.addEventListener('appinstalled', () => {
      installButton.hidden = true;
      installPrompt = null;
    });

    if (isStandalone()) installButton.hidden = true;
  }

  const closeInstall = () => installDialog?.close();
  document.getElementById('closeInstallDialog')?.addEventListener('click', closeInstall);
  document.getElementById('understoodInstall')?.addEventListener('click', closeInstall);

  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  navigator.serviceWorker.addEventListener('controllerchange', reloadWhenSafe);

  async function checkPublishedAssets() {
    if (document.visibilityState === 'hidden') return;
    try {
      const assetBodies = await Promise.all(ASSETS_TO_CHECK.map(async (asset) => {
        const response = await fetch(`${asset}?update-check=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Update-Prüfung fehlgeschlagen: ${asset}`);
        return response.arrayBuffer();
      }));
      const combined = new Uint8Array(assetBodies.reduce((length, body) => length + body.byteLength, 0));
      let offset = 0;
      for (const body of assetBodies) {
        combined.set(new Uint8Array(body), offset);
        offset += body.byteLength;
      }
      const digest = await crypto.subtle.digest('SHA-256', combined);
      const signature = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const previous = localStorage.getItem(VERSION_KEY);
      localStorage.setItem(VERSION_KEY, signature);
      if (previous && previous !== signature) reloadWhenSafe();
    } catch (error) {
      console.info('Online-Update wird später erneut geprüft.', error);
    }
  }

  navigator.serviceWorker.register('./service-worker.js', { scope: './', updateViaCache: 'none' })
    .then((registration) => {
      const checkForUpdate = () => {
        registration.update().catch(() => {});
        checkPublishedAssets();
      };
      checkForUpdate();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
      window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    })
    .catch((error) => console.warn('App-Updates konnten nicht eingerichtet werden.', error));
})();
