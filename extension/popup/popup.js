// Popup: um botão para extrair tudo, opções, progresso e resumo.
const WA_URL = 'https://web.whatsapp.com/';
const $ = (id) => document.getElementById(id);
let tabId = null;

function setStatus(text, kind = 'wait') {
  const el = $('status');
  el.textContent = text;
  el.className = `status status--${kind}`;
}

function show(id, visible) { $(id).hidden = !visible; }

function loadPrefs() {
  try {
    $('opt-deep').checked = localStorage.getItem('wax.deep') === '1';
    $('opt-skip-unread').checked = localStorage.getItem('wax.skipUnread') !== '0';
  } catch (_) {}
}
function savePrefs() {
  try {
    localStorage.setItem('wax.deep', $('opt-deep').checked ? '1' : '0');
    localStorage.setItem('wax.skipUnread', $('opt-skip-unread').checked ? '1' : '0');
  } catch (_) {}
}

function renderState(s) {
  if (!s) return;
  const running = !!s.running;
  show('progress', running || s.phase === 'concluido' || s.phase === 'erro' || s.phase === 'cancelado');
  $('fill').style.width = `${s.percent || 0}%`;
  $('detail').textContent = s.detail || '';
  show('btn-cancel', running);
  $('btn-extract').disabled = running;
  $('btn-extract').textContent = running ? 'Extraindo…' : 'Extrair todas as conversas';

  if (s.phase === 'concluido' && s.summary) {
    const r = s.summary;
    const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
    const box = $('summary');
    box.innerHTML = '';
    const title = document.createElement('div');
    title.innerHTML = '<strong>Arquivo baixado:</strong> ';
    title.append(document.createTextNode(s.filename || ''));
    const dl = document.createElement('dl');
    const rows = [
      ['Conversas', r.conversas.toLocaleString('pt-BR')],
      ['Mensagens', r.mensagens.toLocaleString('pt-BR')],
      ['Período', `${fmtDate(r.periodo.inicio)} a ${fmtDate(r.periodo.fim)}`],
      ['Sem texto disponível', r.mensagens_sem_texto_disponivel.toLocaleString('pt-BR')],
      ['Não lidas preservadas', String(r.conversas_nao_lidas_puladas || 0)],
      ['Ocorrências no log', String(r.erros)],
    ];
    for (const [k, v] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    }
    box.append(title, dl);
    if (r.mensagens_sem_texto_disponivel > 0) {
      const tip = document.createElement('p');
      tip.textContent = r.conversas_nao_lidas_puladas
        ? 'Mensagens sem texto vêm de conversas não lidas, que não foram abertas. Desmarque "Preservar conversas não lidas" em Opções para incluí-las.'
        : 'Algumas mensagens não estavam carregadas na tela. Ative "Aprofundar histórico" em Opções para trazê-las.';
      box.append(tip);
    }
    show('summary', true);
  } else if (running) {
    show('summary', false);
  }
  if (s.phase === 'erro') setStatus(s.error || 'Falha na extração.', 'err');
  if (s.phase === 'cancelado') setStatus('Extração cancelada.', 'warn');
}

async function sendToTab(message) {
  return chrome.tabs.sendMessage(tabId, message);
}

async function init() {
  loadPrefs();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith(WA_URL)) {
    setStatus('Abra o WhatsApp Web nesta aba para extrair as conversas.', 'warn');
    show('btn-extract', false);
    show('btn-open', true);
    return;
  }
  tabId = tab.id;
  let pong;
  try {
    pong = await sendToTab({ type: 'wax:ping' });
  } catch (_) {
    setStatus('A extensão ainda não está ativa nesta aba. Recarregue a página do WhatsApp Web.', 'warn');
    show('btn-reload', true);
    return;
  }
  if (!pong.loggedIn) {
    setStatus('O WhatsApp Web não está logado. Leia o QR Code com o celular e aguarde as conversas carregarem.', 'warn');
    return;
  }
  setStatus('WhatsApp Web conectado. Pronto para extrair.', 'ok');
  $('btn-extract').disabled = false;
  renderState(pong.state);
}

$('btn-extract').addEventListener('click', async () => {
  savePrefs();
  show('summary', false);
  setStatus('Extração em andamento. Você pode fechar este popup; o progresso aparece na página.', 'ok');
  try {
    const r = await sendToTab({ type: 'wax:start', deep: $('opt-deep').checked, skipUnread: $('opt-skip-unread').checked });
    if (!r.ok) setStatus(r.error, 'err');
  } catch (e) {
    setStatus(`Não foi possível iniciar: ${e.message}`, 'err');
  }
});

$('btn-cancel').addEventListener('click', () => sendToTab({ type: 'wax:cancel' }).catch(() => {}));
$('btn-open').addEventListener('click', () => chrome.tabs.create({ url: WA_URL }));
$('btn-reload').addEventListener('click', async () => {
  await chrome.tabs.reload(tabId);
  window.close();
});
$('opt-deep').addEventListener('change', savePrefs);
$('opt-skip-unread').addEventListener('change', savePrefs);
$('btn-diagnose').addEventListener('click', async () => {
  try {
    const r = await sendToTab({ type: 'wax:diagnose' });
    setStatus(r.ok ? 'Relatório de diagnóstico baixado.' : `Diagnóstico falhou: ${r.error}`, r.ok ? 'ok' : 'err');
  } catch (e) {
    setStatus(`Diagnóstico falhou: ${e.message}`, 'err');
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'wax:progress' && sender.tab && sender.tab.id === tabId) renderState(msg.state);
});

init();
