// Pequeno painel de progresso dentro da página do WhatsApp Web (permanece visível se o popup fechar).
// Usa Shadow DOM para não interferir no layout nem no CSS do WhatsApp.
(function (g) {
  let host = null, els = null, hideTimer = null;

  function ensure() {
    if (host && document.body.contains(host)) return;
    host = document.createElement('div');
    host.id = 'wax-overlay-host';
    host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        .box{font:13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fff;color:#111b21;
             border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:12px 14px;width:300px;border-left:4px solid #1f8f5f}
        .t{font-weight:600;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center}
        .d{color:#54656f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .bar{height:6px;background:#e9edef;border-radius:3px;margin-top:8px;overflow:hidden}
        .fill{height:100%;width:0;background:#1f8f5f;transition:width .3s}
        button{border:0;background:none;color:#54656f;cursor:pointer;font-size:12px;padding:0}
        button:hover{color:#c0392b}
        .err{border-left-color:#c0392b}.err .fill{background:#c0392b}
      </style>
      <div class="box"><div class="t"><span class="h">Extrator de conversas</span><button class="c">Cancelar</button></div>
      <div class="d"></div><div class="bar"><div class="fill"></div></div></div>`;
    els = {
      box: root.querySelector('.box'),
      h: root.querySelector('.h'),
      d: root.querySelector('.d'),
      fill: root.querySelector('.fill'),
      c: root.querySelector('.c'),
    };
    els.c.addEventListener('click', () => g.WAX.onOverlayCancel && g.WAX.onOverlayCancel());
    document.body.appendChild(host);
  }

  function update(s) {
    ensure();
    clearTimeout(hideTimer);
    host.style.display = 'block';
    els.box.classList.toggle('err', s.phase === 'erro');
    els.h.textContent = s.phase === 'concluido' ? 'Extração concluída' : s.phase === 'erro' ? 'Falha na extração' : s.phase === 'cancelado' ? 'Extração cancelada' : 'Extraindo conversas…';
    els.d.textContent = s.detail || '';
    els.d.title = s.detail || '';
    els.fill.style.width = `${Math.max(0, Math.min(100, s.percent || 0))}%`;
    els.c.style.display = s.running ? 'inline' : 'none';
    if (!s.running) hideTimer = setTimeout(() => { if (host) host.style.display = 'none'; }, 8000);
  }

  g.WAX.overlay = { update };
})(globalThis);
