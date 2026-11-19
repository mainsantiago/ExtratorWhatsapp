// Funções puras de formatação: datas, telefones, JIDs e nomes de arquivo.
(function (g) {
  const WAX = g.WAX;

  const pad = (n, w = 2) => String(n).padStart(w, '0');

  /** Converte timestamp em segundos (ou ms) para campos locais e UTC. */
  function formatTimestamp(t) {
    if (t === null || t === undefined || t === '' || isNaN(Number(t))) {
      return { data: '', hora: '', timestamp_utc: '', epoch: null };
    }
    let n = Number(t);
    if (n < 1e12) n *= 1000; // segundos -> ms
    const d = new Date(n);
    if (isNaN(d.getTime())) return { data: '', hora: '', timestamp_utc: '', epoch: null };
    return {
      data: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
      hora: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
      timestamp_utc: d.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      epoch: Math.floor(n / 1000),
    };
  }

  /**
   * Interpreta um JID do WhatsApp.
   * Ex.: "5511999998888@c.us", "5511999998888:12@s.whatsapp.net", "1203630@g.us", "987654@lid".
   */
  function parseJid(jid) {
    if (!jid) return { raw: '', user: '', server: '', isGroup: false, isLid: false, isUser: false };
    if (typeof jid === 'object') jid = jid._serialized || (jid.user && jid.server ? `${jid.user}@${jid.server}` : String(jid));
    const raw = String(jid);
    const at = raw.indexOf('@');
    const userPart = at >= 0 ? raw.slice(0, at) : raw;
    const server = at >= 0 ? raw.slice(at + 1) : '';
    const user = userPart.split(':')[0];
    return {
      raw,
      user,
      server,
      isGroup: server === 'g.us',
      isLid: server === 'lid',
      isUser: server === 'c.us' || server === 's.whatsapp.net',
      isBroadcast: server === 'broadcast',
      isNewsletter: server === 'newsletter',
    };
  }

  /** Formata um número em E.164 legível. Brasil recebe máscara própria. */
  function formatPhone(digits) {
    if (!digits) return '';
    const d = String(digits).replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
      const ddd = d.slice(2, 4);
      const rest = d.slice(4);
      const cut = rest.length === 9 ? 5 : 4;
      return `+55 ${ddd} ${rest.slice(0, cut)}-${rest.slice(cut)}`;
    }
    return `+${d}`;
  }

  /** Nome de arquivo seguro em Windows/macOS/Linux, sem emojis problemáticos. */
  function sanitizeFilename(name, maxLen = 60) {
    let s = String(name || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\s.\-+()]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+/, '');
    if (!s) s = 'sem-nome';
    if (s.length > maxLen) s = s.slice(0, maxLen).trim();
    return s;
  }

  /** Garante nomes únicos adicionando sufixo (2), (3)... */
  function makeUniqueNamer() {
    const used = new Set();
    return function unique(base, ext) {
      let candidate = `${base}${ext}`;
      let i = 2;
      while (used.has(candidate.toLowerCase())) {
        candidate = `${base} (${i})${ext}`;
        i++;
      }
      used.add(candidate.toLowerCase());
      return candidate;
    };
  }

  /**
   * Interpreta o atributo data-pre-plain-text do DOM do WhatsApp Web.
   * Ex. pt-BR: "[14:32, 19/11/2026] João Silva: "
   * Ex. en-US: "[2:32 PM, 11/19/2026] John: "
   */
  function parsePrePlainText(text, lang) {
    if (!text) return null;
    const m = String(text).match(/^\[([^\],]+),\s*([^\]]+)\]\s*(.*?):\s*$/s);
    if (!m) return null;
    const [, timeStr, dateStr, author] = m;
    const tm = timeStr.trim().match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?\s*[Mm]\.?)?/);
    const dm = dateStr.trim().match(/(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4})/);
    if (!tm || !dm) return { author: author.trim(), epoch: null };
    let h = Number(tm[1]);
    const mi = Number(tm[2]);
    const s = tm[3] ? Number(tm[3]) : 0;
    const ampm = tm[4] ? tm[4].replace(/[.\s]/g, '').toLowerCase() : '';
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;

    let a = Number(dm[1]), b = Number(dm[2]), c = Number(dm[3]);
    let y, mo, da;
    if (dm[1].length === 4) { y = a; mo = b; da = c; }
    else {
      y = c < 100 ? 2000 + c : c;
      const monthFirst = /^en-US/i.test(lang || '') ;
      if (a > 12) { da = a; mo = b; }
      else if (b > 12) { mo = a; da = b; }
      else if (monthFirst) { mo = a; da = b; }
      else { da = a; mo = b; }
    }
    const d = new Date(y, mo - 1, da, h, mi, s);
    return { author: author.trim(), epoch: isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000) };
  }

  /**
   * Interpreta a chave serializada de uma mensagem.
   * "true_5511999@c.us_3EB0ABC"  |  "false_1203@g.us_3EB0ABC_5511888@c.us"
   */
  function parseMsgKey(key) {
    if (!key) return null;
    if (typeof key === 'object') {
      if (key._serialized) return parseMsgKey(key._serialized);
      return {
        fromMe: !!key.fromMe,
        remote: key.remote && (key.remote._serialized || String(key.remote)),
        id: key.id,
        participant: key.participant ? (key.participant._serialized || String(key.participant)) : '',
        serialized: '',
      };
    }
    const s = String(key);
    const m = s.match(/^(true|false)_([^_]+@[^_]+)_([^_]+)(?:_(.+))?$/);
    if (!m) return null;
    return { fromMe: m[1] === 'true', remote: m[2], id: m[3], participant: m[4] || '', serialized: s };
  }

  Object.assign(WAX, {
    fmt: { pad, formatTimestamp, parseJid, formatPhone, sanitizeFilename, makeUniqueNamer, parsePrePlainText, parseMsgKey },
  });
})(globalThis);
