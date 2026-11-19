// Normalização: transforma registros internos do WhatsApp Web no formato do dicionário de dados (BRD §7).
(function (g) {
  const { parseJid, formatPhone, formatTimestamp, parseMsgKey } = g.WAX.fmt;

  const TYPE_MAP = {
    chat: 'texto',
    image: 'imagem',
    video: 'video',
    gif: 'video',
    ptv: 'video',
    audio: 'audio',
    ptt: 'audio',
    document: 'documento',
    sticker: 'figurinha',
    location: 'localizacao',
    liveLocation: 'localizacao',
    vcard: 'contato',
    multi_vcard: 'contato',
    revoked: 'apagada',
    poll_creation: 'enquete',
    call_log: 'chamada',
    e2e_notification: 'sistema',
    notification: 'sistema',
    notification_template: 'sistema',
    gp2: 'sistema',
    broadcast_notification: 'sistema',
    ciphertext: 'aguardando',
    biz_content_placeholder: 'nao_suportada_web',
    interactive: 'interativa',
    list: 'interativa',
    list_response: 'interativa',
    buttons_response: 'interativa',
    template_button_reply: 'interativa',
    hsm: 'modelo_empresa',
    template: 'modelo_empresa',
    product: 'produto',
    order: 'pedido',
  };

  // Tipos que não são mensagens visíveis na conversa.
  const IGNORED_TYPES = new Set(['protocol', 'reaction', 'pollUpdate', 'poll_update', 'keep_in_chat', 'pin_message', 'unknown', 'debug']);

  const MSG_COLUMNS = [
    { key: 'conversa_id', label: 'conversa_id' },
    { key: 'conversa_nome', label: 'conversa_nome' },
    { key: 'conversa_tipo', label: 'conversa_tipo' },
    { key: 'mensagem_id', label: 'mensagem_id' },
    { key: 'data', label: 'data' },
    { key: 'hora', label: 'hora' },
    { key: 'timestamp_utc', label: 'timestamp_utc' },
    { key: 'direcao', label: 'direcao' },
    { key: 'remetente_numero', label: 'remetente_numero' },
    { key: 'remetente_nome', label: 'remetente_nome' },
    { key: 'destinatario_numero', label: 'destinatario_numero' },
    { key: 'tipo', label: 'tipo' },
    { key: 'texto', label: 'texto' },
    { key: 'resposta_a', label: 'resposta_a' },
    { key: 'encaminhada', label: 'encaminhada' },
    { key: 'numero_oculto', label: 'numero_oculto' },
    { key: 'texto_disponivel', label: 'texto_disponivel' },
    { key: 'origem', label: 'origem' },
  ];

  /** Procura, em qualquer campo do objeto, um JID de telefone ("...@c.us" ou "...@s.whatsapp.net"). */
  function findPhoneJid(obj) {
    if (!obj) return '';
    for (const v of Object.values(obj)) {
      const s = v && typeof v === 'object' ? v._serialized : v;
      if (typeof s === 'string' && /^\d{6,}(:\d+)?@(c\.us|s\.whatsapp\.net)$/.test(s)) return s;
    }
    return '';
  }

  /** Diretório de contatos, grupos e mapeamento LID -> número. */
  class Directory {
    constructor({ contacts = [], groups = [], lidPn = [], chats = [], selfJid = '' } = {}) {
      this.contacts = new Map();
      this.groups = new Map();
      this.lidToPn = new Map();
      this.chats = new Map();
      for (const c of contacts) if (c && c.id) this.contacts.set(this.idOf(c.id), c);
      for (const gm of groups) if (gm && gm.id) this.groups.set(this.idOf(gm.id), gm);
      for (const m of lidPn) {
        if (!m) continue;
        const lid = this.idOf(m.id || m.lid || m.lidJid);
        const pn = (m.phoneNumber && this.idOf(m.phoneNumber)) || findPhoneJid(m);
        if (lid && pn) this.lidToPn.set(lid, pn);
      }
      // Contatos com LID que já trazem o número.
      for (const [id, c] of this.contacts) {
        if (parseJid(id).isLid) {
          const pn = (c.phoneNumber && this.idOf(c.phoneNumber)) || '';
          if (pn && !this.lidToPn.has(id)) this.lidToPn.set(id, pn);
        }
      }
      for (const ch of chats) if (ch && ch.id) this.chats.set(this.idOf(ch.id), ch);
      this.selfJid = selfJid || '';
      this.self = parseJid(selfJid);

      // Índice nome -> JID, para identificar conversas e remetentes vistos só na tela.
      this.byName = new Map();
      const addName = (n, id) => {
        const k = String(n || '').trim().toLowerCase();
        if (k && !this.byName.has(k)) this.byName.set(k, id);
      };
      for (const [id, gm] of this.groups) addName(gm.subject, id);
      for (const [id, c] of this.contacts) {
        const target = parseJid(id).isLid ? this.lidToPn.get(id) || id : id;
        for (const n of [c.name, c.shortName, c.verifiedName, c.pushname]) addName(n, target);
      }
      for (const [id, ch] of this.chats) addName(ch.name, id);
    }

    /** Procura o JID de uma conversa ou pessoa pelo nome exibido (ou número exibido). */
    findByName(name) {
      if (!name) return '';
      const s = String(name).trim().replace(/^~\s*/, '');
      const digits = s.replace(/[\s()+\-]/g, '');
      if (/^\d{8,15}$/.test(digits) && /^[+\d\s()\-]+$/.test(s)) return `${digits}@c.us`;
      return this.byName.get(s.toLowerCase()) || '';
    }

    idOf(x) {
      if (!x) return '';
      if (typeof x === 'object') return x._serialized || (x.user && x.server ? `${x.user}@${x.server}` : '');
      return String(x);
    }

    /** Resolve um JID para { numero, numero_oculto }. */
    resolveNumber(jid) {
      const p = parseJid(jid);
      if (p.isUser) return { numero: formatPhone(p.user), oculto: false };
      if (p.isLid) {
        const pn = this.lidToPn.get(p.raw) || this.lidToPn.get(`${p.user}@lid`);
        if (pn) return { numero: formatPhone(parseJid(pn).user), oculto: false };
        return { numero: '', oculto: true };
      }
      return { numero: '', oculto: false };
    }

    contactName(jid, fallbackPushName) {
      const id = this.idOf(jid);
      const p = parseJid(id);
      const nameOf = (c) => c && (c.name || c.shortName || c.verifiedName || c.pushname || c.notifyName);
      let name = nameOf(this.contacts.get(id));
      if (!name && p.isLid) {
        const pn = this.lidToPn.get(id);
        if (pn) name = nameOf(this.contacts.get(pn));
      }
      if (!name && p.isUser) {
        // O mesmo contato pode existir como @lid apontando para este número.
        for (const [lid, pn] of this.lidToPn) if (parseJid(pn).user === p.user) { name = nameOf(this.contacts.get(lid)); if (name) break; }
      }
      if (name) return String(name);
      if (fallbackPushName) return String(fallbackPushName);
      const { numero } = this.resolveNumber(id);
      return numero || p.user || '';
    }

    isSelf(jid) {
      if (!this.selfJid || !jid) return false;
      const a = parseJid(jid);
      return a.user && a.user === this.self.user;
    }

    chatInfo(chatId) {
      const id = this.idOf(chatId);
      const p = parseJid(id);
      const chat = this.chats.get(id) || {};
      if (p.isGroup) {
        const gm = this.groups.get(id) || {};
        return { id, tipo: 'grupo', nome: gm.subject || chat.name || chat.formattedTitle || id, numero: '' };
      }
      if (p.isBroadcast) return { id, tipo: 'transmissao', nome: chat.name || 'Lista de transmissão', numero: '' };
      if (p.isNewsletter) return { id, tipo: 'canal', nome: chat.name || id, numero: '' };
      const { numero } = this.resolveNumber(id);
      return { id, tipo: 'individual', nome: chat.name || this.contactName(id), numero, archived: !!chat.archive };
    }

    selfInfo() {
      return {
        numero: this.self.user ? formatPhone(this.self.user) : '',
        nome: 'Eu',
      };
    }
  }

  /** Extrai texto legível de um registro de mensagem, se disponível em texto claro. */
  function readableText(row) {
    const pick = (v) => (typeof v === 'string' && v.length ? v : '');
    const t = row.type;
    if (t === 'chat' || !t) return pick(row.body) || pick(row.text);
    if (t === 'location' || t === 'liveLocation') {
      if (row.lat !== undefined && row.lng !== undefined) return `${row.lat},${row.lng}${row.loc ? ' ' + row.loc : ''}`;
    }
    if (t === 'vcard' || t === 'multi_vcard') return pick(row.vcardFormattedName) || '';
    if (t === 'document') return [pick(row.filename), pick(row.caption)].filter(Boolean).join(' — ');
    if (t === 'poll_creation') return pick(row.pollName);
    if (t === 'revoked') return '';
    // Mídias: só legenda; o campo body costuma conter a miniatura em base64.
    return pick(row.caption);
  }

  /**
   * Converte um registro bruto de mensagem (IndexedDB) em registro do dicionário de dados.
   * Retorna null para registros que não são mensagens visíveis.
   */
  function normalizeIdbMessage(row, dir) {
    if (!row) return null;
    if (IGNORED_TYPES.has(row.type)) return null;
    const key = parseMsgKey(row.id);
    if (!key || !key.remote) return null;

    const chatId = dir.idOf(key.remote);
    const chat = dir.chatInfo(chatId);
    const ts = formatTimestamp(row.t);
    const fromMe = key.fromMe;
    const tipo = TYPE_MAP[row.type] || row.type || 'desconhecido';
    if (tipo === 'sistema') {
      return {
        conversa_id: chatId, conversa_nome: chat.nome, conversa_tipo: chat.tipo, mensagem_id: key.id,
        data: ts.data, hora: ts.hora, timestamp_utc: ts.timestamp_utc, epoch: ts.epoch,
        direcao: 'sistema', remetente_numero: '', remetente_nome: '', destinatario_numero: '',
        tipo, texto: readableText(row), resposta_a: '', encaminhada: false, numero_oculto: false,
        texto_disponivel: true, origem: 'local',
      };
    }

    let senderJid;
    if (fromMe) senderJid = dir.selfJid;
    else if (chat.tipo === 'grupo') senderJid = dir.idOf(row.author) || key.participant || '';
    else senderJid = dir.idOf(row.from) || chatId;

    let remetente_numero = '', remetente_nome = '', oculto = false;
    if (fromMe) {
      const me = dir.selfInfo();
      remetente_numero = me.numero;
      remetente_nome = me.nome;
    } else {
      const r = dir.resolveNumber(senderJid);
      remetente_numero = r.numero;
      oculto = r.oculto;
      remetente_nome = dir.contactName(senderJid, row.notifyName);
    }

    let destinatario_numero;
    if (chat.tipo === 'grupo') destinatario_numero = chatId;
    else if (fromMe) destinatario_numero = chat.numero || dir.resolveNumber(chatId).numero;
    else destinatario_numero = dir.selfInfo().numero;

    const texto = readableText(row);

    return {
      conversa_id: chatId,
      conversa_nome: chat.nome,
      conversa_tipo: chat.tipo,
      mensagem_id: key.id,
      data: ts.data,
      hora: ts.hora,
      timestamp_utc: ts.timestamp_utc,
      epoch: ts.epoch,
      direcao: fromMe ? 'enviada' : 'recebida',
      remetente_numero,
      remetente_nome,
      destinatario_numero,
      tipo,
      texto,
      resposta_a: row.quotedStanzaID || (row.quotedMsgKey && parseMsgKey(row.quotedMsgKey)?.id) || '',
      encaminhada: !!row.isForwarded,
      numero_oculto: oculto,
      // O WhatsApp guarda o texto cifrado (msgRowOpaqueData); sem leitura da tela ele fica vazio.
      texto_disponivel: !(row.type === 'chat' && !texto),
      origem: 'local',
    };
  }

  /**
   * Converte uma linha lida da tela em registro do dicionário de dados.
   * d: { id, key?, epoch, author, texto, tipo, encaminhada, lado }
   * chat: { id, nome, tipo, numero } — a conversa aberta (id pode ser vazio se não identificada).
   */
  function normalizeDomMessage(d, dir, chat) {
    if (!d || !d.id) return null;
    const ts = formatTimestamp(d.epoch);
    const direcao = d.tipo === 'sistema' ? 'sistema' : d.lado || '';
    let remetente_numero = '', remetente_nome = '', oculto = false;
    if (direcao === 'enviada') {
      const me = dir.selfInfo();
      remetente_numero = me.numero;
      remetente_nome = me.nome;
    } else if (direcao === 'recebida') {
      let senderJid = '';
      if (d.key && d.key.participant) senderJid = d.key.participant;
      else if (chat.tipo === 'grupo') senderJid = dir.findByName(d.author);
      else senderJid = chat.id;
      if (senderJid) {
        const r = dir.resolveNumber(senderJid);
        remetente_numero = r.numero;
        oculto = r.oculto;
      } else if (chat.tipo !== 'grupo') {
        remetente_numero = chat.numero || '';
      }
      remetente_nome = (chat.tipo === 'grupo' ? d.author : '') || (senderJid ? dir.contactName(senderJid, d.author) : '') || d.author || chat.nome;
    }
    return {
      conversa_id: chat.id || '',
      conversa_nome: chat.nome,
      conversa_tipo: chat.tipo,
      mensagem_id: d.id,
      data: ts.data,
      hora: ts.hora,
      timestamp_utc: ts.timestamp_utc,
      epoch: ts.epoch,
      direcao,
      remetente_numero,
      remetente_nome,
      destinatario_numero: chat.tipo === 'grupo' ? chat.id || '' : direcao === 'enviada' ? chat.numero || '' : direcao === 'recebida' ? dir.selfInfo().numero : '',
      tipo: d.tipo || 'texto',
      texto: d.texto || '',
      resposta_a: '',
      encaminhada: !!d.encaminhada,
      numero_oculto: oculto,
      texto_disponivel: true,
      origem: 'tela',
    };
  }

  /**
   * Mescla o registro da base local (metadados confiáveis: número, data com segundos, direção)
   * com o registro lido da tela (texto decifrado).
   */
  function mergeRecords(base, extra) {
    if (!base) return extra;
    if (!extra) return base;
    const out = Object.assign({}, base);
    if (extra.texto && !out.texto) out.texto = extra.texto;
    out.texto_disponivel = !!out.texto || out.tipo !== 'texto';
    out.origem = 'local+tela';
    if (!out.epoch && extra.epoch) Object.assign(out, { data: extra.data, hora: extra.hora, timestamp_utc: extra.timestamp_utc, epoch: extra.epoch });
    if (!out.remetente_nome && extra.remetente_nome) out.remetente_nome = extra.remetente_nome;
    if (!out.encaminhada && extra.encaminhada) out.encaminhada = true;
    if (extra.conversa_nome) out.conversa_nome = extra.conversa_nome;
    return out;
  }

  g.WAX.normalize = { Directory, normalizeIdbMessage, normalizeDomMessage, mergeRecords, readableText, MSG_COLUMNS, TYPE_MAP, IGNORED_TYPES };
})(globalThis);
