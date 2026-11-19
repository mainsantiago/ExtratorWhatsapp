// Adaptador DOM: lê a interface do WhatsApp Web (lista de conversas e balões de mensagem).
// É a única fonte do TEXTO das mensagens: na base local o WhatsApp guarda o conteúdo cifrado.
// Todos os seletores ficam aqui (RNF06). Validado em 19/11/2026 (WhatsApp Web pessoal e Business).
// ATENÇÃO: abrir uma conversa pode enviar confirmação de leitura.
(function (g) {
  const SEL = {
    sidePane: '#pane-side',
    chatRow: '#pane-side [role="row"], #pane-side [role="listitem"]',
    chatRowTitle: 'span[title]',
    main: '#main',
    mainHeaderSpans: '#main header span',
    msgRow: '#main [data-id]',
    msgContainer: '[data-testid="msg-container"]',
    msgMeta: '[data-testid="msg-meta"]',
    systemMsg: '[data-testid="system_message"], [data-testid="msg-notification-container"]',
    copyable: '.copyable-text[data-pre-plain-text]',
    text: '[data-testid="selectable-text"], span.selectable-text',
    forwarded: '[data-icon="forwarded"], [data-testid="forwarded"]',
    image: 'img[src^="blob:"]',
    audio: '[data-icon="audio-play"], [data-icon="ptt-play"], [data-icon="audio-download"], [data-testid="audio-play"]',
    document: '[data-icon="document"], [data-icon^="document-"], [data-testid="document-thumb"]',
    sticker: '[data-testid="sticker"], img[alt*="sticker" i], img[alt*="figurinha" i]',
    video: '[data-icon="media-play"], [data-icon="video-pip"], [data-testid="media-play"]',
    unreadBadge: '[aria-label*="não lida" i], [aria-label*="não lidas" i], [aria-label*="unread" i], [aria-label*="no leído" i]',
    loadOlderButton: '#main button, #main [role="button"]',
  };
  const LOAD_OLDER_TEXT = /mensagens mais antigas|older messages|mensajes (más )?antiguos/i;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function isLoggedIn() {
    return !!document.querySelector(SEL.sidePane);
  }

  /** Detecta WhatsApp Business pelo título da aba (só informativo). */
  function isBusiness() {
    return /business/i.test(document.title || '');
  }

  function scrollableAncestor(el) {
    let n = el && el.parentElement;
    while (n && n !== document.body) {
      const st = getComputedStyle(n);
      if (/(auto|scroll)/.test(st.overflowY)) return n;
      n = n.parentElement;
    }
    return null;
  }

  function rowTitleEl(row) {
    return row.querySelector(SEL.chatRowTitle);
  }
  function rowTitle(row) {
    const t = rowTitleEl(row);
    return t ? (t.getAttribute('title') || t.textContent || '').trim() : '';
  }

  /** O React do WhatsApp só reage à sequência completa de eventos de ponteiro + mouse. */
  function pointerClick(el) {
    const r = el.getBoundingClientRect();
    const base = { bubbles: true, cancelable: true, view: window, clientX: r.x + Math.min(5, r.width / 2), clientY: r.y + Math.min(5, r.height / 2), button: 0 };
    const pointer = Object.assign({ pointerId: 1, isPrimary: true, pointerType: 'mouse' }, base);
    const PE = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
    for (const k of ['pointerover', 'pointerenter', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.dispatchEvent(k.startsWith('pointer') ? new PE(k, pointer) : new MouseEvent(k, base));
    }
  }

  /**
   * Percorre a lista lateral (virtualizada) e devolve as conversas, na ordem,
   * com a indicação de mensagens não lidas.
   */
  async function listChats(shouldStop) {
    const pane = document.querySelector(SEL.sidePane);
    if (!pane) return [];
    const chats = [];
    const seen = new Set();
    pane.scrollTop = 0;
    await sleep(300);
    let stable = 0;
    for (let guard = 0; stable < 2 && guard < 3000; guard++) {
      if (shouldStop && shouldStop()) break;
      let added = 0;
      for (const row of document.querySelectorAll(SEL.chatRow)) {
        const title = rowTitle(row);
        if (title && !seen.has(title)) {
          seen.add(title);
          chats.push({ title, unread: !!row.querySelector(SEL.unreadBadge) });
          added++;
        }
      }
      const before = pane.scrollTop;
      pane.scrollTop = before + pane.clientHeight * 0.8;
      await sleep(250);
      stable = added === 0 && pane.scrollTop === before ? stable + 1 : 0;
    }
    pane.scrollTop = 0;
    return chats;
  }

  function currentChatIs(title) {
    if (!document.querySelector(SEL.main)) return false;
    for (const s of document.querySelectorAll(SEL.mainHeaderSpans)) {
      if ((s.getAttribute('title') || s.textContent || '').trim() === title) return true;
    }
    return false;
  }

  /** Localiza a conversa pelo título na lista lateral e a abre. */
  async function openChatByTitle(title) {
    const pane = document.querySelector(SEL.sidePane);
    if (!pane) return false;
    if (currentChatIs(title)) return true;
    pane.scrollTop = 0;
    await sleep(200);
    for (let guard = 0; guard < 600; guard++) {
      for (const row of document.querySelectorAll(SEL.chatRow)) {
        if (rowTitle(row) !== title) continue;
        pointerClick(rowTitleEl(row));
        for (let i = 0; i < 30; i++) {
          await sleep(150);
          if (currentChatIs(title)) {
            await sleep(400); // tempo para renderizar os balões
            return true;
          }
        }
        return false;
      }
      const before = pane.scrollTop;
      pane.scrollTop = before + pane.clientHeight * 0.8;
      await sleep(200);
      if (pane.scrollTop === before) return false;
    }
    return false;
  }

  /** Fecha a conversa aberta (equivale a pressionar Esc). */
  async function closeChat() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
    await sleep(300);
  }

  function detectType(row, hasText) {
    if (row.querySelector(SEL.sticker)) return 'figurinha';
    if (row.querySelector(SEL.audio)) return 'audio';
    if (row.querySelector(SEL.document)) return 'documento';
    if (row.querySelector(SEL.video)) return 'video';
    if (row.querySelector(SEL.image)) return 'imagem';
    return hasText ? 'texto' : 'outro';
  }

  /** Lado do balão pela posição na tela: à direita = enviada. Usado só quando a base local não tem a mensagem. */
  function sideOf(row, mainRect) {
    const box = row.querySelector(SEL.msgContainer) || row;
    const r = box.getBoundingClientRect();
    if (!r.width || !mainRect.width) return '';
    const center = r.x + r.width / 2;
    return center > mainRect.x + mainRect.width / 2 ? 'enviada' : 'recebida';
  }

  /**
   * Texto alternativo do balão, para mensagens sem o campo de texto padrão
   * (modelos e botões de empresas, conteúdo indisponível no WhatsApp Web etc.).
   * Remove o horário/confirmações do rodapé do balão.
   */
  function bubbleText(row) {
    const box = row.querySelector(SEL.msgContainer);
    if (!box) return '';
    if (row.querySelector(`${SEL.image}, ${SEL.audio}, ${SEL.video}, ${SEL.sticker}`)) return '';
    let t = box.innerText || '';
    const meta = box.querySelector(SEL.msgMeta);
    if (meta && meta.innerText) t = t.split(meta.innerText).join('');
    return t.replace(/\n{2,}/g, '\n').trim().slice(0, 4000);
  }

  /** Lê os balões carregados na conversa aberta. */
  function readVisibleMessages(lang) {
    const out = [];
    const main = document.querySelector(SEL.main);
    const mainRect = main ? main.getBoundingClientRect() : { x: 0, width: 0 };
    for (const row of document.querySelectorAll(SEL.msgRow)) {
      const dataId = row.getAttribute('data-id');
      if (!dataId) continue;
      // Formato antigo: "false_<jid>_<id>[_<participante>]"; formato atual: apenas "<id>".
      const key = g.WAX.fmt.parseMsgKey(dataId);
      const id = key ? key.id : dataId;
      const isSystem = !!row.querySelector(SEL.systemMsg) && !row.querySelector(SEL.msgContainer);
      const cp = row.querySelector(SEL.copyable);
      const meta = cp ? g.WAX.fmt.parsePrePlainText(cp.getAttribute('data-pre-plain-text'), lang) : null;
      const textEls = (cp || row).querySelectorAll(SEL.text);
      // Em respostas, o trecho citado vem antes; o texto da própria mensagem é o último.
      const textEl = textEls.length ? textEls[textEls.length - 1] : null;
      let texto = textEl ? textEl.innerText.trim() : '';
      if (isSystem && !texto) texto = (row.innerText || '').trim().slice(0, 500);
      if (!isSystem && !texto) texto = bubbleText(row);
      out.push({
        id,
        key,
        epoch: meta ? meta.epoch : null,
        author: meta ? meta.author : '',
        texto,
        tipo: isSystem ? 'sistema' : detectType(row, !!texto),
        encaminhada: !!row.querySelector(SEL.forwarded),
        lado: isSystem ? '' : key ? (key.fromMe ? 'enviada' : 'recebida') : sideOf(row, mainRect),
      });
    }
    return out;
  }

  function findLoadOlderButton() {
    for (const b of document.querySelectorAll(SEL.loadOlderButton)) {
      if (LOAD_OLDER_TEXT.test(b.innerText || '')) return b;
    }
    return null;
  }

  /**
   * Lê a conversa aberta. Com deep=true, rola para cima até não carregar mais nada
   * (ou atingir o limite de tempo), acumulando as mensagens lidas.
   */
  async function readOpenChat({ deep = false, maxSeconds = 90, lang, shouldStop, onTick } = {}) {
    const collected = new Map();
    const collect = () => {
      for (const m of readVisibleMessages(lang)) collected.set(m.id, Object.assign(collected.get(m.id) || {}, m));
      if (onTick) onTick(collected.size);
    };
    collect();
    if (!deep) return [...collected.values()];

    const start = Date.now();
    const first = document.querySelector(SEL.msgRow);
    const scroller = first ? scrollableAncestor(first) : null;
    let stable = 0;
    while (scroller && stable < 4) {
      if (shouldStop && shouldStop()) break;
      if ((Date.now() - start) / 1000 > maxSeconds) break;
      const sizeBefore = collected.size;
      const older = findLoadOlderButton();
      if (older) pointerClick(older);
      scroller.scrollTop = 0;
      await sleep(900);
      collect();
      stable = collected.size === sizeBefore ? stable + 1 : 0;
    }
    return [...collected.values()];
  }

  g.WAX.dom = { SEL, isLoggedIn, isBusiness, listChats, openChatByTitle, closeChat, currentChatIs, readVisibleMessages, readOpenChat, pointerClick, sleep };
})(globalThis);
