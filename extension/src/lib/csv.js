// Geração de CSV compatível com Excel pt-BR: UTF-8 com BOM, separador ";" e quebras CRLF.
(function (g) {
  const SEP = ';';
  const BOM = '﻿';

  function cell(v) {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'boolean' ? (v ? 'sim' : 'não') : String(v);
    // Evita que o Excel interprete o conteúdo como fórmula (CSV injection).
    if (/^[=+\-@\t\r]/.test(s) && !/^[+\-]?\d[\d\s().\-]*$/.test(s)) s = `'${s}`;
    if (s.includes(SEP) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      s = `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  /** columns: [{key, label}] ; rows: objetos */
  function toCsv(columns, rows) {
    const lines = [columns.map((c) => cell(c.label)).join(SEP)];
    for (const r of rows) lines.push(columns.map((c) => cell(r[c.key])).join(SEP));
    return BOM + lines.join('\r\n') + '\r\n';
  }

  g.WAX.csv = { toCsv, cell, SEP, BOM };
})(globalThis);
