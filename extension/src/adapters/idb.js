// Adaptador IndexedDB: lê as bases locais que o próprio WhatsApp Web mantém no navegador.
// Toda dependência de nomes internos (bases, tabelas, campos) fica concentrada aqui (RNF06).
// Somente leitura: as transações são abertas em modo "readonly".
(function (g) {
  const DB_NAME = 'model-storage';
  const STORES = {
    message: 'message',
    chat: 'chat',
    contact: 'contact',
    group: 'group-metadata',
    lidPn: 'lid-pn-mapping',
  };
  const BATCH = 2000;

  function req(r) {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  async function openDb() {
    if (typeof indexedDB.databases === 'function') {
      const list = await indexedDB.databases();
      if (!list.some((d) => d.name === DB_NAME)) {
        throw new Error(`Base local "${DB_NAME}" não encontrada. O WhatsApp Web está logado nesta aba?`);
      }
    }
    // Abrir sem versão não cria nem altera a base existente.
    const r = indexedDB.open(DB_NAME);
    r.onupgradeneeded = () => {
      // Se cair aqui, a base não existia: aborta para não criar uma vazia.
      r.transaction.abort();
    };
    return req(r);
  }

  function hasStore(db, name) {
    return db.objectStoreNames.contains(name);
  }

  async function count(db, store) {
    if (!hasStore(db, store)) return 0;
    return req(db.transaction(store, 'readonly').objectStore(store).count());
  }

  async function getAll(db, store) {
    if (!hasStore(db, store)) return [];
    return req(db.transaction(store, 'readonly').objectStore(store).getAll());
  }

  /** Percorre uma tabela em lotes, cada lote em transação própria, para não travar a página. */
  async function forEachBatch(db, store, onBatch, shouldStop) {
    if (!hasStore(db, store)) return;
    let lastKey = null;
    for (;;) {
      if (shouldStop && shouldStop()) return;
      const os = db.transaction(store, 'readonly').objectStore(store);
      const range = lastKey === null ? null : IDBKeyRange.lowerBound(lastKey, true);
      const [values, keys] = await Promise.all([req(os.getAll(range, BATCH)), req(os.getAllKeys(range, BATCH))]);
      if (!values.length) return;
      await onBatch(values);
      lastKey = keys[keys.length - 1];
      if (values.length < BATCH) return;
      await new Promise((r) => setTimeout(r, 0)); // devolve o controle à interface
    }
  }

  /** Lê o JID do próprio usuário a partir do localStorage do WhatsApp Web. */
  function readSelfJid() {
    const keys = ['last-wid-md', 'last-wid', 'WAWebLastWid'];
    for (const k of keys) {
      try {
        const v = g.localStorage && g.localStorage.getItem(k);
        if (v) return String(v).replace(/^"|"$/g, '');
      } catch (_) { /* ignora */ }
    }
    return '';
  }

  /**
   * Relatório de diagnóstico: quais tabelas/campos existem e com que frequência estão preenchidos.
   * Não inclui conteúdo de mensagens, apenas nomes de campos e contagens.
   */
  async function diagnose() {
    const db = await openDb();
    try {
      const out = { db: DB_NAME, version: db.version, stores: {}, selfJidFound: !!readSelfJid() };
      for (const [alias, store] of Object.entries(STORES)) {
        if (!hasStore(db, store)) { out.stores[alias] = { exists: false }; continue; }
        const total = await count(db, store);
        const os = db.transaction(store, 'readonly').objectStore(store);
        const sample = await req(os.getAll(null, 300));
        const fields = {};
        for (const row of sample) {
          for (const [k, v] of Object.entries(row || {})) {
            const f = (fields[k] = fields[k] || { filled: 0, types: {} });
            if (v !== null && v !== undefined && v !== '') f.filled++;
            const t = Array.isArray(v) ? 'array' : v instanceof ArrayBuffer || ArrayBuffer.isView(v) ? 'binary' : typeof v;
            f.types[t] = (f.types[t] || 0) + 1;
          }
        }
        out.stores[alias] = { exists: true, store, total, sampled: sample.length, fields };
      }
      return out;
    } finally {
      db.close();
    }
  }

  g.WAX.idb = { DB_NAME, STORES, openDb, hasStore, count, getAll, forEachBatch, readSelfJid, diagnose };
})(globalThis);
