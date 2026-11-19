// Orquestra a extração (WhatsApp Web pessoal e Business):
//  1. Lê da base local os contatos, grupos, números ocultos (LID) e os metadados das mensagens.
//  2. Abre cada conversa e lê o texto na tela (na base local o texto fica cifrado).
//  3. Relê a base local (o WhatsApp grava os metadados das conversas abertas) e cruza tudo pelo ID.
//  4. Gera o .zip.
(function (g) {
  const { idb, dom, normalize, exporter, fmt } = g.WAX;

  class Extractor {
    constructor(onProgress) {
      this.onProgress = onProgress || (() => {});
      this.reset();
    }

    reset() {
      this.state = { running: false, phase: 'ocioso', detail: '', current: 0, total: 0, messages: 0, percent: 0, error: '', summary: null, filename: '' };
      this.cancelled = false;
      this.errors = [];
    }

    emit(patch) {
      Object.assign(this.state, patch);
      this.onProgress(Object.assign({}, this.state));
    }

    cancel() {
      this.cancelled = true;
      this.emit({ detail: 'Cancelando…' });
    }

    stop() {
      return this.cancelled;
    }

    log(msg) {
      this.errors.push(`[${new Date().toISOString()}] ${msg}`);
    }

    /**
     * Executa a extração completa. Retorna { blob, filename, summary } ou lança erro.
     * opts.deep: rola cada conversa até o início. opts.skipUnread: não abre conversas com não lidas.
     */
    async run({ deep = false, skipUnread = true, maxSecondsPerChat = 90 } = {}) {
      if (this.state.running) throw new Error('Já existe uma extração em andamento.');
      this.reset();
      this.emit({ running: true, phase: 'preparando', detail: 'Verificando o WhatsApp Web…', percent: 1 });
      const startedAt = new Date();
      try {
        if (!dom.isLoggedIn()) throw new Error('O WhatsApp Web não está logado nesta aba. Faça login (QR Code) e tente de novo.');

        // 1) Índice local
        this.emit({ phase: 'local', detail: 'Lendo contatos e grupos…', percent: 3 });
        let local = await this.readLocal();
        const dir = local.dir;

        // 2) Tela
        const screen = await this.readScreen({ deep, skipUnread, maxSecondsPerChat });
        if (this.stop()) throw new Error('Extração cancelada.');

        // 3) Relê a base local para pegar os metadados gravados ao abrir as conversas
        this.emit({ phase: 'cruzando', detail: 'Cruzando texto com dados locais…', percent: 91 });
        try {
          const again = await this.readLocal(dir);
          if (again.ok) local = { ok: true, dir, byId: again.byId };
        } catch (e) {
          this.log(`Releitura local falhou: ${e.message}`);
        }
        const conversations = this.assemble(dir, local.byId, screen.chats);
        if (this.stop()) throw new Error('Extração cancelada.');

        // 4) Pacote
        this.emit({ phase: 'gerando', detail: 'Gerando arquivos…', percent: 96 });
        const pkg = exporter.buildPackage(conversations, {
          engine: local.ok ? 'local+tela' : 'tela',
          deep,
          errors: this.errors,
          startedAt,
          extra: {
            whatsapp_business: dom.isBusiness(),
            conversas_na_lista: screen.listed,
            conversas_nao_lidas_puladas: screen.skipped,
          },
        });
        const blob = pkg.zip.toBlob();
        this.emit({ running: false, phase: 'concluido', detail: 'Concluído', percent: 100, summary: pkg.summary, filename: pkg.filename });
        return { blob, filename: pkg.filename, summary: pkg.summary };
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        this.emit({ running: false, phase: this.cancelled ? 'cancelado' : 'erro', error: msg, detail: msg });
        throw e;
      }
    }

    /** Lê a base local. Se falhar, segue só com a tela (sem números resolvidos por LID). */
    async readLocal(existingDir) {
      let db;
      try {
        db = await idb.openDb();
      } catch (e) {
        this.log(`Base local indisponível: ${e.message}`);
        return { ok: false, dir: existingDir || new normalize.Directory({ selfJid: idb.readSelfJid() }), byId: new Map() };
      }
      try {
        const S = idb.STORES;
        let dir = existingDir;
        if (!dir) {
          const [contacts, groups, lidPn, chats] = await Promise.all([
            idb.getAll(db, S.contact), idb.getAll(db, S.group), idb.getAll(db, S.lidPn), idb.getAll(db, S.chat),
          ]);
          dir = new normalize.Directory({ contacts, groups, lidPn, chats, selfJid: idb.readSelfJid() });
          if (!dir.selfJid) this.log('Número do próprio usuário não encontrado; mensagens enviadas ficarão sem número do remetente.');
        }
        const byId = new Map();
        await idb.forEachBatch(db, S.message, async (rows) => {
          for (const row of rows) {
            try {
              const rec = normalize.normalizeIdbMessage(row, dir);
              if (rec) byId.set(rec.mensagem_id, rec);
            } catch (e) {
              this.log(`Registro local ignorado: ${e.message}`);
            }
          }
        }, () => this.stop());
        return { ok: true, dir, byId };
      } finally {
        db.close();
      }
    }

    /** Abre cada conversa da lista e lê as mensagens exibidas. */
    async readScreen({ deep, skipUnread, maxSecondsPerChat }) {
      this.emit({ phase: 'tela', detail: 'Listando conversas…', percent: 6 });
      const list = await dom.listChats(() => this.stop());
      const lang = navigator.language;
      const chats = [];
      let skipped = 0;
      let i = 0;
      for (const c of list) {
        if (this.stop()) break;
        i++;
        const pct = 8 + Math.round((i / Math.max(1, list.length)) * 82);
        if (skipUnread && c.unread) {
          skipped++;
          this.log(`Conversa com mensagens não lidas não foi aberta (opção "Preservar não lidas"): "${c.title}"`);
          this.emit({ current: i, total: list.length, percent: pct });
          continue;
        }
        this.emit({ current: i, total: list.length, percent: pct, detail: `Conversa ${i}/${list.length}: ${c.title}` });
        try {
          const ok = await dom.openChatByTitle(c.title);
          if (!ok) { this.log(`Não foi possível abrir a conversa "${c.title}"`); continue; }
          const rows = await dom.readOpenChat({
            deep,
            maxSeconds: maxSecondsPerChat,
            lang,
            shouldStop: () => this.stop(),
            onTick: (n) => this.emit({ detail: `Conversa ${i}/${list.length}: ${c.title} (${n} mensagens)` }),
          });
          chats.push({ title: c.title, rows });
          this.emit({ messages: this.state.messages + rows.length });
        } catch (e) {
          this.log(`Falha ao ler "${c.title}": ${e.message}`);
        }
      }
      try { await dom.closeChat(); } catch (_) { /* ignora */ }
      return { chats, listed: list.length, skipped };
    }

    /** Chave única de conversa: individuais com o mesmo número (JID ou LID) viram uma só. */
    convKey(dir, chatId, fallback) {
      if (!chatId) return fallback;
      const info = dir.chatInfo(chatId);
      if (info.tipo === 'individual' && info.numero) return `pn:${info.numero.replace(/\D/g, '')}`;
      return chatId;
    }

    /** Monta as conversas cruzando a tela com a base local. */
    assemble(dir, byId, screenChats) {
      const convs = new Map();
      const used = new Set();
      const put = (key, meta, rec) => {
        if (!convs.has(key)) convs.set(key, Object.assign({ messages: new Map() }, meta));
        const c = convs.get(key);
        c.messages.set(rec.mensagem_id, normalize.mergeRecords(c.messages.get(rec.mensagem_id), rec));
      };

      for (const sc of screenChats) {
        // Identifica a conversa: pelo que a base local diz das mensagens exibidas, ou pelo nome.
        const votes = new Map();
        for (const r of sc.rows) {
          const b = byId.get(r.id);
          if (b && b.conversa_id) votes.set(b.conversa_id, (votes.get(b.conversa_id) || 0) + 1);
        }
        let chatId = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || dir.findByName(sc.title);
        let info = chatId ? dir.chatInfo(chatId) : null;
        if (!info) {
          const authors = new Set(sc.rows.filter((r) => r.lado === 'recebida' && r.author).map((r) => r.author));
          info = { id: '', nome: sc.title, tipo: authors.size > 1 ? 'grupo' : 'individual', numero: '' };
        }
        const chat = { id: info.id, nome: sc.title, tipo: info.tipo, numero: info.numero || '' };
        const key = this.convKey(dir, chatId, `tela:${sc.title}`);
        const meta = { id: chat.id || sc.title, nome: chat.nome, tipo: chat.tipo, numero: chat.numero };

        for (const r of sc.rows) {
          const fromScreen = normalize.normalizeDomMessage(r, dir, chat);
          if (!fromScreen) continue;
          const base = byId.get(r.id);
          const rec = base ? normalize.mergeRecords(base, fromScreen) : fromScreen;
          used.add(r.id);
          put(key, meta, rec);
        }
      }

      // Mensagens que só existem na base local (conversas não abertas): metadados sem texto.
      for (const [id, rec] of byId) {
        if (used.has(id)) continue;
        const key = this.convKey(dir, rec.conversa_id, rec.conversa_id);
        const info = dir.chatInfo(rec.conversa_id);
        put(key, { id: info.id, nome: info.nome, tipo: info.tipo, numero: info.numero || '' }, rec);
      }

      return [...convs.values()].map((c) => Object.assign({}, c, { messages: [...c.messages.values()] }));
    }
  }

  g.WAX.Extractor = Extractor;
})(globalThis);
