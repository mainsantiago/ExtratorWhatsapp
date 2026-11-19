// Ponto de entrada do script de conteúdo: recebe comandos do popup e dispara a extração.
(function (g) {
  const WAX = g.WAX;
  if (WAX.__contentLoaded) return;
  WAX.__contentLoaded = true;

  const extractor = new WAX.Extractor((state) => {
    WAX.overlay.update(state);
    try {
      chrome.runtime.sendMessage({ type: 'wax:progress', state }).catch(() => {});
    } catch (_) { /* popup fechado */ }
  });
  WAX.onOverlayCancel = () => extractor.cancel();

  /** Dispara o download a partir da própria página (não exige a permissão "downloads"). */
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 60000);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('wax:')) return false;
    switch (msg.type) {
      case 'wax:ping':
        sendResponse({ ok: true, loggedIn: WAX.dom.isLoggedIn(), state: extractor.state, version: WAX.VERSION });
        return false;
      case 'wax:start':
        if (extractor.state.running) { sendResponse({ ok: false, error: 'Extração já em andamento.' }); return false; }
        extractor
          .run({ deep: !!msg.deep, skipUnread: msg.skipUnread !== false })
          .then((r) => download(r.blob, r.filename))
          .catch(() => { /* estado de erro já emitido */ });
        sendResponse({ ok: true });
        return false;
      case 'wax:cancel':
        extractor.cancel();
        sendResponse({ ok: true });
        return false;
      case 'wax:diagnose':
        WAX.idb
          .diagnose()
          .then((report) => {
            report.loggedIn = WAX.dom.isLoggedIn();
            report.sampleDomRows = document.querySelectorAll(WAX.dom.SEL.msgRow).length;
            report.userAgent = navigator.userAgent;
            report.extensionVersion = WAX.VERSION;
            const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
            download(blob, `diagnostico-extrator_${WAX.exporter.stamp()}.json`);
            sendResponse({ ok: true });
          })
          .catch((e) => sendResponse({ ok: false, error: e.message }));
        return true; // resposta assíncrona
      default:
        return false;
    }
  });
})(globalThis);
