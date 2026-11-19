// Montagem do pacote de saída: um CSV + um JSON por conversa, índice geral, resumo e log de erros.
(function (g) {
  const { toCsv } = g.WAX.csv;
  const { sanitizeFilename, makeUniqueNamer, formatTimestamp, pad } = g.WAX.fmt;
  const { MSG_COLUMNS } = g.WAX.normalize;

  const INDEX_COLUMNS = [
    { key: 'conversa_nome', label: 'conversa_nome' },
    { key: 'conversa_tipo', label: 'conversa_tipo' },
    { key: 'conversa_id', label: 'conversa_id' },
    { key: 'numero', label: 'numero' },
    { key: 'total_mensagens', label: 'total_mensagens' },
    { key: 'enviadas', label: 'enviadas' },
    { key: 'recebidas', label: 'recebidas' },
    { key: 'sem_texto', label: 'mensagens_sem_texto_disponivel' },
    { key: 'primeira', label: 'primeira_mensagem' },
    { key: 'ultima', label: 'ultima_mensagem' },
    { key: 'arquivo_csv', label: 'arquivo_csv' },
    { key: 'arquivo_json', label: 'arquivo_json' },
  ];

  function stamp(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  /**
   * conversations: Array<{ id, nome, tipo, numero, messages: Record[] }>
   * meta: { engine, deep, errors: string[], startedAt, selfNumero }
   */
  function buildPackage(conversations, meta) {
    const zip = new g.WAX.zip.ZipWriter();
    const unique = makeUniqueNamer();
    const index = [];
    let total = 0, minEpoch = null, maxEpoch = null, semTexto = 0;
    const root = `whatsapp-conversas_${stamp(meta.startedAt)}`;

    const sorted = [...conversations].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    for (const conv of sorted) {
      const msgs = [...conv.messages].sort((a, b) => (a.epoch || 0) - (b.epoch || 0));
      if (!msgs.length) continue;
      const idPart = conv.numero ? conv.numero.replace(/\D/g, '') : String(conv.id).split('@')[0];
      const base = `${sanitizeFilename(conv.nome)}_${sanitizeFilename(idPart, 30)}`;
      const csvName = unique(`conversas/${base}`, '.csv');
      const jsonName = csvName.replace(/\.csv$/, '.json');

      const plain = msgs.map((m) => {
        const o = {};
        for (const c of MSG_COLUMNS) o[c.key] = m[c.key];
        return o;
      });
      zip.add(`${root}/${csvName}`, toCsv(MSG_COLUMNS, plain));
      zip.add(
        `${root}/${jsonName}`,
        JSON.stringify({ conversa: { id: conv.id, nome: conv.nome, tipo: conv.tipo, numero: conv.numero || '' }, mensagens: plain }, null, 2)
      );

      const first = msgs.find((m) => m.epoch);
      const last = [...msgs].reverse().find((m) => m.epoch);
      const st = msgs.filter((m) => m.texto_disponivel === false).length;
      semTexto += st;
      total += msgs.length;
      if (first && (minEpoch === null || first.epoch < minEpoch)) minEpoch = first.epoch;
      if (last && (maxEpoch === null || last.epoch > maxEpoch)) maxEpoch = last.epoch;
      const fts = first ? formatTimestamp(first.epoch) : null;
      const lts = last ? formatTimestamp(last.epoch) : null;
      index.push({
        conversa_nome: conv.nome,
        conversa_tipo: conv.tipo,
        conversa_id: conv.id,
        numero: conv.numero || '',
        total_mensagens: msgs.length,
        enviadas: msgs.filter((m) => m.direcao === 'enviada').length,
        recebidas: msgs.filter((m) => m.direcao === 'recebida').length,
        sem_texto: st,
        primeira: fts ? `${fts.data} ${fts.hora}` : '',
        ultima: lts ? `${lts.data} ${lts.hora}` : '',
        arquivo_csv: csvName,
        arquivo_json: jsonName,
      });
    }

    zip.add(`${root}/indice.csv`, toCsv(INDEX_COLUMNS, index));
    const summary = {
      gerado_em: new Date().toISOString(),
      versao_extensao: g.WAX.VERSION,
      motor: meta.engine,
      modo_aprofundar: !!meta.deep,
      conversas: index.length,
      mensagens: total,
      mensagens_sem_texto_disponivel: semTexto,
      periodo: {
        inicio: minEpoch ? formatTimestamp(minEpoch).timestamp_utc : null,
        fim: maxEpoch ? formatTimestamp(maxEpoch).timestamp_utc : null,
      },
      erros: (meta.errors || []).length,
    };
    Object.assign(summary, meta.extra || {});
    zip.add(`${root}/resumo.json`, JSON.stringify(summary, null, 2));
    if (meta.errors && meta.errors.length) zip.add(`${root}/erros.log`, meta.errors.join('\r\n') + '\r\n');

    return { zip, summary, filename: `${root}.zip` };
  }

  g.WAX.exporter = { buildPackage, INDEX_COLUMNS, stamp };
})(globalThis);
