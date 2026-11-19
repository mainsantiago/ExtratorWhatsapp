// Testes automatizados (Node 18+, sem dependências): node tests/run-tests.js
// Carregam os mesmos arquivos da extensão em um contexto isolado (vm) e simulam o WhatsApp Web.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const { execFileSync } = require('child_process');

const EXT = path.join(__dirname, '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const LIB_FILES = manifest.content_scripts[0].js.filter((f) => !/content\.js$|overlay\.js$/.test(f));

function loadContext(extra = {}) {
  const store = new Map();
  const ctx = {
    console, TextEncoder, Blob, setTimeout, clearTimeout, Date, Math, JSON, Promise,
    navigator: { language: 'pt-BR' },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    IDBKeyRange: { lowerBound: (k) => ({ lower: k }) },
    ...extra,
  };
  vm.createContext(ctx);
  for (const f of LIB_FILES) vm.runInContext(fs.readFileSync(path.join(EXT, f), 'utf8'), ctx, { filename: f });
  return ctx;
}

const results = [];
async function test(name, fn) {
  try { await fn(); results.push([true, name]); }
  catch (e) { results.push([false, name, e]); }
}

(async () => {
  // ---------- Manifesto ----------
  await test('manifest: MV3, permissões mínimas e arquivos existentes', () => {
    assert.equal(manifest.manifest_version, 3);
    assert.deepEqual(manifest.host_permissions, ['https://web.whatsapp.com/*']);
    assert.equal(manifest.permissions, undefined, 'não deve pedir permissões além do host');
    for (const f of manifest.content_scripts[0].js) assert.ok(fs.existsSync(path.join(EXT, f)), f);
    for (const f of Object.values(manifest.icons)) assert.ok(fs.existsSync(path.join(EXT, f)), f);
    assert.ok(fs.existsSync(path.join(EXT, manifest.action.default_popup)));
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.ok(manifest.description.length <= 132, 'descrição da loja deve ter até 132 caracteres');
  });

  await test('manifest: nenhum código remoto (http/https em <script> ou import)', () => {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of walk(EXT).filter((f) => /\.(js|html)$/.test(f))) {
      const src = fs.readFileSync(f, 'utf8');
      assert.ok(!/<script[^>]+src=["']https?:/i.test(src), `script remoto em ${f}`);
      assert.ok(!/\bimport\s*\(\s*["']https?:/i.test(src), `import remoto em ${f}`);
      assert.ok(!/\beval\s*\(|new Function\s*\(/.test(src), `eval em ${f}`);
      assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket\s*\(/.test(src), `chamada de rede em ${f}`);
    }
  });

  // ---------- Formatação ----------
  const ctx = loadContext();
  const { fmt, csv, zip, normalize, exporter } = ctx.WAX;

  await test('format: JIDs, telefones e chaves de mensagem', () => {
    assert.equal(fmt.parseJid('5511999998888@c.us').user, '5511999998888');
    assert.equal(fmt.parseJid('5511999998888:12@s.whatsapp.net').user, '5511999998888');
    assert.equal(fmt.parseJid('120363000@g.us').isGroup, true);
    assert.equal(fmt.parseJid('987654321@lid').isLid, true);
    assert.equal(fmt.formatPhone('5511999998888'), '+55 11 99999-8888');
    assert.equal(fmt.formatPhone('551133334444'), '+55 11 3333-4444');
    assert.equal(fmt.formatPhone('14155552671'), '+14155552671');
    const k = fmt.parseMsgKey('false_120363000@g.us_3EB0AAA_5511999998888@c.us');
    assert.equal(k.fromMe, false); assert.equal(k.remote, '120363000@g.us'); assert.equal(k.id, '3EB0AAA'); assert.equal(k.participant, '5511999998888@c.us');
    const k2 = fmt.parseMsgKey({ fromMe: true, remote: { _serialized: '5511@c.us' }, id: 'X1' });
    assert.equal(k2.fromMe, true); assert.equal(k2.remote, '5511@c.us');
    assert.equal(fmt.parseMsgKey('lixo'), null);
  });

  await test('format: data-pre-plain-text pt-BR e en-US', () => {
    const a = fmt.parsePrePlainText('[14:32, 19/11/2026] João Silva: ', 'pt-BR');
    const d = new Date(a.epoch * 1000);
    assert.equal(a.author, 'João Silva');
    assert.deepEqual([d.getDate(), d.getMonth() + 1, d.getFullYear(), d.getHours(), d.getMinutes()], [19, 11, 2026, 14, 32]);
    const b = fmt.parsePrePlainText('[2:32 PM, 11/5/2026] John: ', 'en-US');
    const e = new Date(b.epoch * 1000);
    assert.deepEqual([e.getDate(), e.getMonth() + 1, e.getHours()], [5, 11, 14]);
  });

  await test('format: nomes de arquivo seguros e únicos', () => {
    assert.equal(fmt.sanitizeFilename('Família 🏠 / Ação: "teste"'), 'Familia Acao teste');
    assert.equal(fmt.sanitizeFilename(''), 'sem-nome');
    const u = fmt.makeUniqueNamer();
    assert.equal(u('a', '.csv'), 'a.csv');
    assert.equal(u('A', '.csv'), 'A (2).csv');
  });

  // ---------- CSV ----------
  await test('csv: BOM, separador ";", aspas, quebras e proteção contra fórmulas', () => {
    const out = csv.toCsv([{ key: 'a', label: 'a' }, { key: 'b', label: 'b' }], [
      { a: 'x;y', b: 'linha1\nlinha2' },
      { a: '=1+1', b: '+55 11 99999-8888' },
      { a: 'diz "oi"', b: true },
    ]);
    assert.ok(out.startsWith('﻿a;b\r\n'));
    assert.ok(out.includes('"x;y";"linha1\nlinha2"'));
    assert.ok(out.includes("'=1+1;+55 11 99999-8888"));
    assert.ok(out.includes('"diz ""oi""";sim'));
  });

  // ---------- ZIP ----------
  await test('zip: arquivo válido com nomes UTF-8 (verificado pelo unzip)', () => {
    const z = new zip.ZipWriter();
    z.add('pasta/olá.csv', '﻿a;b\r\n1;2\r\n');
    z.add('pasta/dados.json', JSON.stringify({ ok: true }));
    const bytes = z.toUint8Array();
    const tmp = path.join(os.tmpdir(), `wax-test-${process.pid}.zip`);
    fs.writeFileSync(tmp, bytes);
    const t = execFileSync('unzip', ['-t', tmp]).toString();
    assert.match(t, /No errors detected/);
    const json = execFileSync('unzip', ['-p', tmp, 'pasta/dados.json']).toString();
    assert.deepEqual(JSON.parse(json), { ok: true });
    fs.unlinkSync(tmp);
  });

  // ---------- Normalização ----------
  const SELF = '5511900000000@c.us';
  const dir = new normalize.Directory({
    selfJid: SELF,
    contacts: [
      { id: '5511999998888@c.us', name: 'João Silva', pushname: 'Jão' },
      { id: '5521988887777@c.us', pushname: 'Maria' },
      { id: '777000111@lid', phoneNumber: '5531977776666@c.us', name: 'Carla Grupo' },
    ],
    groups: [{ id: '120363000@g.us', subject: 'Equipe Vendas' }],
    lidPn: [{ id: '888000222@lid', phoneNumber: '5541966665555@c.us' }],
    chats: [{ id: '5511999998888@c.us' }, { id: '120363000@g.us' }],
  });

  await test('normalize: mensagem recebida em conversa individual', () => {
    const r = normalize.normalizeIdbMessage({ id: 'false_5511999998888@c.us_A1', t: 1795600000, type: 'chat', body: 'Bom dia!', from: '5511999998888@c.us', to: SELF }, dir);
    assert.equal(r.direcao, 'recebida');
    assert.equal(r.remetente_numero, '+55 11 99999-8888');
    assert.equal(r.remetente_nome, 'João Silva');
    assert.equal(r.destinatario_numero, '+55 11 90000-0000');
    assert.equal(r.texto, 'Bom dia!');
    assert.equal(r.conversa_nome, 'João Silva');
    assert.equal(r.conversa_tipo, 'individual');
    assert.match(r.data, /^\d{2}\/\d{2}\/\d{4}$/);
    assert.match(r.hora, /^\d{2}:\d{2}:\d{2}$/);
    assert.equal(r.timestamp_utc, new Date(1795600000 * 1000).toISOString().replace('.000', ''));
  });

  await test('normalize: mensagem enviada usa o número do próprio usuário', () => {
    const r = normalize.normalizeIdbMessage({ id: 'true_5511999998888@c.us_A2', t: 1795600060, type: 'chat', body: 'Oi' }, dir);
    assert.equal(r.direcao, 'enviada');
    assert.equal(r.remetente_numero, '+55 11 90000-0000');
    assert.equal(r.remetente_nome, 'Eu');
    assert.equal(r.destinatario_numero, '+55 11 99999-8888');
  });

  await test('normalize: grupo com autor por LID resolvido para número', () => {
    const r1 = normalize.normalizeIdbMessage({ id: 'false_120363000@g.us_G1_888000222@lid', author: '888000222@lid', t: 1795600100, type: 'chat', body: 'Olá grupo', notifyName: 'Pedro' }, dir);
    assert.equal(r1.conversa_tipo, 'grupo');
    assert.equal(r1.conversa_nome, 'Equipe Vendas');
    assert.equal(r1.remetente_numero, '+55 41 96666-5555');
    assert.equal(r1.remetente_nome, 'Pedro');
    assert.equal(r1.numero_oculto, false);
    const r2 = normalize.normalizeIdbMessage({ id: 'false_120363000@g.us_G2_777000111@lid', author: '777000111@lid', t: 1795600200, type: 'chat', body: 'x' }, dir);
    assert.equal(r2.remetente_numero, '+55 31 97777-6666');
    assert.equal(r2.remetente_nome, 'Carla Grupo');
    const r3 = normalize.normalizeIdbMessage({ id: 'false_120363000@g.us_G3_999@lid', author: '999@lid', t: 1795600300, type: 'chat', body: 'y' }, dir);
    assert.equal(r3.numero_oculto, true);
    assert.equal(r3.remetente_numero, '');
  });

  await test('normalize: tipos de mídia, sistema, ignorados e texto indisponível', () => {
    const img = normalize.normalizeIdbMessage({ id: 'false_5511999998888@c.us_M1', t: 1, type: 'image', body: '/9j/4AAQ...', caption: 'foto da obra' }, dir);
    assert.equal(img.tipo, 'imagem'); assert.equal(img.texto, 'foto da obra');
    const ptt = normalize.normalizeIdbMessage({ id: 'false_5511999998888@c.us_M2', t: 1, type: 'ptt', body: 'AAAA' }, dir);
    assert.equal(ptt.tipo, 'audio'); assert.equal(ptt.texto, '');
    assert.equal(normalize.normalizeIdbMessage({ id: 'false_5511999998888@c.us_M3', t: 1, type: 'reaction' }, dir), null);
    assert.equal(normalize.normalizeIdbMessage({ id: 'false_5511999998888@c.us_M4', t: 1, type: 'protocol' }, dir), null);
    const enc = normalize.normalizeIdbMessage({ id: 'false_5511999998888@c.us_M5', t: 1, type: 'chat', msgRowOpaqueData: { _data: new Uint8Array(4) } }, dir);
    assert.equal(enc.texto_disponivel, false);
    const fwd = normalize.normalizeIdbMessage({ id: 'false_5511999998888@c.us_M6', t: 1, type: 'chat', body: 'enc', isForwarded: true, quotedStanzaID: 'Q1' }, dir);
    assert.equal(fwd.encaminhada, true); assert.equal(fwd.resposta_a, 'Q1');
  });

  await test('normalize: mescla texto da tela (ID puro, formato atual) com registro local cifrado', () => {
    const base = normalize.normalizeIdbMessage({ id: 'false_5511999998888@c.us_M7', t: 1795600005, type: 'chat', msgRowOpaqueData: {} }, dir);
    assert.equal(base.texto_disponivel, false);
    const chat = { id: '5511999998888@c.us', nome: 'João Silva', tipo: 'individual', numero: '+55 11 99999-8888' };
    const tela = normalize.normalizeDomMessage({ id: 'M7', epoch: 1795600000, author: 'João', texto: 'texto da tela', tipo: 'texto', lado: 'recebida' }, dir, chat);
    const m = normalize.mergeRecords(base, tela);
    assert.equal(m.texto, 'texto da tela'); assert.equal(m.texto_disponivel, true); assert.equal(m.origem, 'local+tela');
    assert.equal(m.epoch, 1795600005, 'mantém a data com segundos da base local');
    assert.equal(m.remetente_numero, '+55 11 99999-8888');
  });

  await test('normalize: mensagem só da tela em grupo identifica o autor pelo nome', () => {
    const chat = { id: '120363000@g.us', nome: 'Equipe Vendas', tipo: 'grupo', numero: '' };
    const r = normalize.normalizeDomMessage({ id: 'Z1', epoch: 1795600000, author: 'Carla Grupo', texto: 'oi', tipo: 'texto', lado: 'recebida' }, dir, chat);
    assert.equal(r.remetente_nome, 'Carla Grupo');
    assert.equal(r.remetente_numero, '+55 31 97777-6666');
    const r2 = normalize.normalizeDomMessage({ id: 'Z2', epoch: 1795600000, author: '+55 21 98888-1111', texto: 'x', tipo: 'texto', lado: 'recebida' }, dir, chat);
    assert.equal(r2.remetente_numero, '+55 21 98888-1111');
    const r3 = normalize.normalizeDomMessage({ id: 'Z3', epoch: 1795600000, author: 'Eu', texto: 'y', tipo: 'texto', lado: 'enviada' }, dir, chat);
    assert.equal(r3.remetente_numero, '+55 11 90000-0000'); assert.equal(r3.direcao, 'enviada');
    const r4 = normalize.normalizeDomMessage({ id: 'Z4', tipo: 'sistema', texto: 'As mensagens são protegidas…' }, dir, chat);
    assert.equal(r4.direcao, 'sistema');
  });

  // ---------- Empacotamento ----------
  await test('export: um CSV + JSON por conversa, índice e resumo', () => {
    const mk = (id, remote, t, body, fromMe = false) => normalize.normalizeIdbMessage({ id: `${fromMe}_${remote}_${id}`, t, type: 'chat', body }, dir);
    const convs = [
      { id: '5511999998888@c.us', nome: 'João Silva', tipo: 'individual', numero: '+55 11 99999-8888', messages: [mk('B', '5511999998888@c.us', 20, 'b', true), mk('A', '5511999998888@c.us', 10, 'a')] },
      { id: '120363000@g.us', nome: 'Equipe Vendas', tipo: 'grupo', numero: '', messages: [mk('C', '120363000@g.us', 30, 'c')] },
      { id: 'vazio@c.us', nome: 'Vazio', tipo: 'individual', numero: '', messages: [] },
    ];
    const pkg = exporter.buildPackage(convs, { engine: 'local', deep: false, errors: ['x'], startedAt: new Date(2026, 10, 19, 14, 30) });
    assert.equal(pkg.filename, 'whatsapp-conversas_2026-11-19_1430.zip');
    assert.equal(pkg.summary.conversas, 2);
    assert.equal(pkg.summary.mensagens, 3);
    const tmp = path.join(os.tmpdir(), `wax-pkg-${process.pid}.zip`);
    fs.writeFileSync(tmp, pkg.zip.toUint8Array());
    const list = execFileSync('unzip', ['-Z1', tmp]).toString().trim().split('\n').sort();
    const root = 'whatsapp-conversas_2026-11-19_1430/';
    assert.deepEqual(list, [
      `${root}conversas/Equipe Vendas_120363000.csv`, `${root}conversas/Equipe Vendas_120363000.json`,
      `${root}conversas/Joao Silva_5511999998888.csv`, `${root}conversas/Joao Silva_5511999998888.json`,
      `${root}erros.log`, `${root}indice.csv`, `${root}resumo.json`,
    ].sort());
    const joao = execFileSync('unzip', ['-p', tmp, `${root}conversas/Joao Silva_5511999998888.csv`]).toString();
    const lines = joao.replace(/^﻿/, '').trim().split('\r\n');
    assert.equal(lines.length, 3);
    assert.ok(lines[0].startsWith('conversa_id;conversa_nome;'));
    assert.ok(lines[1].includes(';recebida;'), 'ordem cronológica: primeiro a recebida (t=10)');
    assert.ok(lines[2].includes(';enviada;'));
    fs.unlinkSync(tmp);
  });

  // ---------- Fluxo completo com WhatsApp simulado ----------
  /** Monta um WhatsApp Web simulado: base local (texto cifrado) + tela. */
  function fakeWhatsApp(c) {
    const W = c.WAX;
    const tables = {
      contact: [
        { id: '5511999998888@c.us', name: 'João Silva' },
        { id: '555@lid', phoneNumber: '5511999998888@c.us' },
        { id: '5531977776666@c.us', name: 'Carla' },
        { id: '5541911112222@c.us', name: 'Cliente Novo' },
      ],
      'group-metadata': [{ id: '120363000@g.us', subject: 'Equipe Vendas' }],
      'lid-pn-mapping': [],
      chat: [{ id: '5511999998888@c.us' }, { id: '555@lid' }, { id: '120363000@g.us' }, { id: '5541911112222@c.us' }],
      message: [
        // Texto cifrado localmente, como no WhatsApp atual.
        { id: 'false_5511999998888@c.us_A1', t: 100, type: 'chat', msgRowOpaqueData: {} },
        { id: 'true_555@lid_A2', t: 200, type: 'chat', msgRowOpaqueData: {} },
        { id: 'false_120363000@g.us_G1_555@lid', author: '555@lid', t: 300, type: 'chat', msgRowOpaqueData: {} },
        { id: 'false_120363000@g.us_G9_555@lid', t: 301, type: 'reaction' },
        { id: 'false_5541911112222@c.us_U1', t: 400, type: 'chat', msgRowOpaqueData: {} },
      ],
    };
    const screen = {
      'João Silva': [
        { id: 'A1', epoch: 100, author: 'João Silva', texto: 'oi', tipo: 'texto', lado: 'recebida' },
        { id: 'A2', epoch: 200, author: 'Eu', texto: 'olá', tipo: 'texto', lado: 'enviada' },
      ],
      'Equipe Vendas': [
        { id: 'G1', epoch: 300, author: 'João Silva', texto: 'bom dia, grupo', tipo: 'texto', lado: 'recebida' },
        // Só na tela (não gravada localmente): autor identificado pelo nome.
        { id: 'G2', epoch: 360, author: 'Carla', texto: 'bom dia!', tipo: 'texto', lado: 'recebida' },
      ],
      'Cliente Novo': [{ id: 'U1', epoch: 400, author: 'Cliente Novo', texto: 'preciso de ajuda', tipo: 'texto', lado: 'recebida' }],
    };
    c.localStorage.setItem('last-wid-md', '"5511900000000:3@c.us"');
    W.idb.openDb = async () => ({ close() {} });
    W.idb.getAll = async (_db, s) => tables[s] || [];
    W.idb.forEachBatch = async (_db, s, cb) => { await cb(tables[s]); };
    let open = '';
    const opened = [];
    W.dom.isLoggedIn = () => true;
    W.dom.isBusiness = () => true;
    W.dom.listChats = async () => [{ title: 'João Silva' }, { title: 'Equipe Vendas' }, { title: 'Cliente Novo', unread: true }];
    W.dom.openChatByTitle = async (t) => { open = t; opened.push(t); return true; };
    W.dom.readOpenChat = async () => screen[open] || [];
    W.dom.closeChat = async () => {};
    return { opened };
  }

  async function runAndUnzip(c, opts) {
    const progress = [];
    const ex = new c.WAX.Extractor((s) => progress.push(s));
    const r = await ex.run(opts);
    const tmp = path.join(os.tmpdir(), `wax-e2e-${process.pid}-${Math.random().toString(36).slice(2)}.zip`);
    fs.writeFileSync(tmp, Buffer.from(await r.blob.arrayBuffer()));
    const files = execFileSync('unzip', ['-Z1', tmp]).toString().trim().split('\n');
    const read = (suffix) => {
      const f = files.find((x) => x.endsWith(suffix));
      return f ? execFileSync('unzip', ['-p', tmp, f]).toString() : null;
    };
    const json = (prefix) => {
      const f = files.find((x) => x.includes(`/conversas/${prefix}`) && x.endsWith('.json'));
      return f ? JSON.parse(execFileSync('unzip', ['-p', tmp, f]).toString()) : null;
    };
    return { r, progress, files, read, json, cleanup: () => fs.unlinkSync(tmp) };
  }

  await test('extractor: 1 clique com texto cifrado localmente — texto vem da tela, números da base local', async () => {
    const c2 = loadContext();
    const { opened } = fakeWhatsApp(c2);
    const out = await runAndUnzip(c2, {});
    assert.deepEqual(opened, ['João Silva', 'Equipe Vendas'], 'não abre a conversa não lida por padrão');
    assert.equal(out.r.summary.conversas, 3);
    assert.equal(out.r.summary.mensagens, 5);
    assert.equal(out.r.summary.whatsapp_business, true);
    assert.equal(out.r.summary.conversas_nao_lidas_puladas, 1);
    assert.equal(out.r.summary.mensagens_sem_texto_disponivel, 1);

    const joao = out.json('Joao Silva');
    assert.ok(joao, 'JID e LID do João viram um único arquivo');
    assert.deepEqual(joao.mensagens.map((m) => [m.direcao, m.texto, m.remetente_numero]), [
      ['recebida', 'oi', '+55 11 99999-8888'],
      ['enviada', 'olá', '+55 11 90000-0000'],
    ]);
    const grupo = out.json('Equipe Vendas');
    assert.deepEqual(grupo.mensagens.map((m) => [m.remetente_nome, m.remetente_numero, m.texto, m.origem]), [
      ['João Silva', '+55 11 99999-8888', 'bom dia, grupo', 'local+tela'],
      ['Carla', '+55 31 97777-6666', 'bom dia!', 'tela'],
    ]);
    const cliente = out.json('Cliente Novo');
    assert.equal(cliente.mensagens[0].texto_disponivel, false);
    assert.equal(cliente.mensagens[0].remetente_numero, '+55 41 91111-2222');
    assert.match(out.read('erros.log'), /não lidas/);
    const p = out.progress;
    assert.equal(p[p.length - 1].phase, 'concluido');
    assert.ok(p.every((s, i) => i === 0 || s.percent >= p[i - 1].percent), 'progresso não regride');
    out.cleanup();
  });

  await test('extractor: com "Preservar não lidas" desligado, abre todas e traz todos os textos', async () => {
    const c4 = loadContext();
    const { opened } = fakeWhatsApp(c4);
    const out = await runAndUnzip(c4, { skipUnread: false });
    assert.equal(opened.length, 3);
    assert.equal(out.r.summary.mensagens_sem_texto_disponivel, 0);
    assert.equal(out.json('Cliente Novo').mensagens[0].texto, 'preciso de ajuda');
    out.cleanup();
  });

  await test('extractor: sem base local, segue só com a tela', async () => {
    const c5 = loadContext();
    fakeWhatsApp(c5);
    c5.WAX.idb.openDb = async () => { throw new Error('indisponível'); };
    const out = await runAndUnzip(c5, { skipUnread: false });
    assert.equal(out.r.summary.motor, 'tela');
    assert.equal(out.r.summary.mensagens, 5);
    assert.equal(out.r.summary.mensagens_sem_texto_disponivel, 0);
    out.cleanup();
  });

  await test('extractor: falha clara quando não está logado', async () => {
    const c3 = loadContext();
    c3.WAX.dom.isLoggedIn = () => false;
    const ex = new c3.WAX.Extractor(() => {});
    await assert.rejects(ex.run(), /não está logado/);
    assert.equal(ex.state.phase, 'erro');
  });

  // ---------- Resultado ----------
  let fail = 0;
  for (const [ok, name, err] of results) {
    console.log(`${ok ? '✔' : '✘'} ${name}`);
    if (!ok) { fail++; console.log('   ', err && err.message ? err.message.split('\n').slice(0, 40).join('\n    ') : err); }
  }
  console.log(`\n${results.length - fail}/${results.length} testes passaram.`);
  process.exit(fail ? 1 : 0);
})();
