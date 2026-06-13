let state = { recording: false, title: '', template: 'standard', steps: [] };
let saveTimer = null;

const $ = (selector) => document.querySelector(selector);
const stepsEl = $('#steps');
const template = $('#stepTemplate');
const titleEl = $('#manualTitle');
const templateEl = $('#templateSelect');
const statusBadge = $('#statusBadge');
const toggleBtn = $('#toggleRecording');
const toastEl = $('#toast');
const stepCountEl = $('#stepCount');

function send(message) { return chrome.runtime.sendMessage(message); }
function toast(message) { toastEl.textContent = message; toastEl.hidden = false; clearTimeout(toastEl._timer); toastEl._timer = setTimeout(() => { toastEl.hidden = true; }, 2600); }
function escapeHtml(str) { return String(str ?? '').replace(/[&<>'"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[s])); }
function escapeMarkdown(str) { return String(str ?? '').replace(/([\\`*_{}\[\]()#+.!|>-])/g, '\\$1'); }
function formatDate(iso) { try { return new Date(iso).toLocaleString('ja-JP'); } catch { return iso || ''; } }
function safeFilename(name, ext) { const base = (name || 'manual-clip').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || 'manual-clip'; return `${base}.${ext}`; }
function download(filename, content, type) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

async function loadState() { const res = await send({ type: 'manualclip_get_state' }); if (res?.ok) { state = { recording: false, title: '', template: 'standard', steps: [], ...res.state }; render(); } }
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => send({ type: 'manualclip_update_steps', steps: state.steps }), 250); }
function setMarkerPosition(marker, step) { if (!step.click) { marker.style.display = 'none'; return; } const vw = step.click.viewportWidth || 1; const vh = step.click.viewportHeight || 1; marker.style.left = `${(step.click.x / vw) * 100}%`; marker.style.top = `${(step.click.y / vh) * 100}%`; marker.style.display = 'block'; }

function render() {
  titleEl.value = state.title || '';
  templateEl.value = state.template || 'standard';
  statusBadge.textContent = state.recording ? '記録中' : '停止中';
  statusBadge.classList.toggle('recording', state.recording);
  toggleBtn.textContent = state.recording ? '記録停止' : '記録開始';
  toggleBtn.classList.toggle('recording', state.recording);
  stepCountEl.textContent = `${state.steps.length}件`;
  stepsEl.innerHTML = '';
  if (!state.steps.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'まだ手順がありません。「記録開始」または「現在画面を追加」から始めてください。'; stepsEl.appendChild(empty); return; }
  const displaySteps = state.steps.map((step, index) => ({ step, index })).reverse();
  displaySteps.forEach(({ step, index }, visualIndex) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = step.id;
    node.querySelector('.step-no').textContent = `手順 ${index + 1}`;
    const img = node.querySelector('.capture'); img.src = step.image;
    img.addEventListener('load', () => setMarkerPosition(node.querySelector('.marker'), step)); setMarkerPosition(node.querySelector('.marker'), step);
    const memo = node.querySelector('.memo'); memo.value = step.memo || ''; memo.addEventListener('input', () => { state.steps[index].memo = memo.value; scheduleSave(); });
    const note = node.querySelector('.note'); note.value = step.note || ''; note.addEventListener('input', () => { state.steps[index].note = note.value; scheduleSave(); });
    node.querySelector('.page-info').innerHTML = `<div>タイトル：${escapeHtml(step.pageTitle || '')}</div><div>URL：${escapeHtml(step.url || '')}</div><div>記録時刻：${escapeHtml(formatDate(step.createdAt))}</div>`;
    const up = node.querySelector('[data-action="up"]'); const down = node.querySelector('[data-action="down"]');
    // 一覧は逆順表示。見た目で上へ動かす場合、保存配列では後ろへ移動する。
    up.disabled = visualIndex === 0; down.disabled = visualIndex === displaySteps.length - 1;
    up.addEventListener('click', () => moveStep(index, 1));
    down.addEventListener('click', () => moveStep(index, -1));
    node.querySelector('[data-action="edit"]').addEventListener('click', () => openEditor(step.id));
    node.querySelector('[data-action="delete"]').addEventListener('click', () => deleteStep(index));
    stepsEl.appendChild(node);
  });
}

async function moveStep(index, delta) { const nextIndex = index + delta; if (nextIndex < 0 || nextIndex >= state.steps.length) return; const next = [...state.steps]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; state.steps = next; await send({ type: 'manualclip_update_steps', steps: state.steps }); render(); }
async function deleteStep(index) { state.steps.splice(index, 1); await send({ type: 'manualclip_update_steps', steps: state.steps }); render(); }
async function openEditor(id) { await chrome.tabs.create({ url: chrome.runtime.getURL(`editor.html?id=${encodeURIComponent(id)}`) }); }

function templateStyles() {
  if (state.template === 'compact') return '.capture-wrap{max-width:720px}.step{margin:18px 0 24px}h2{font-size:16px}.meta{display:none}';
  if (state.template === 'detailed') return '.capture-wrap{max-width:100%}.step{margin:32px 0 44px}.meta{font-size:13px}.note{font-size:15px}';
  return '.capture-wrap{max-width:960px}.step{margin:28px 0 36px}';
}
function buildHtmlDocument() {
  const title = state.title || '手順書';
  const steps = state.steps.map((step, index) => {
    const note = step.note ? `<p class="note"><strong>補足：</strong>${escapeHtml(step.note).replace(/\n/g, '<br>')}</p>` : '';
    const marker = step.click ? `<span class="marker" style="left:${(step.click.x / (step.click.viewportWidth || 1)) * 100}%;top:${(step.click.y / (step.click.viewportHeight || 1)) * 100}%;"></span>` : '';
    return `<section class="step"><h2>${index + 1}. ${escapeHtml(step.memo || '操作します。')}</h2>${note}<div class="capture-wrap"><img src="${step.image}" alt="手順${index + 1}の画面">${marker}</div><p class="meta">${escapeHtml(step.pageTitle || '')}<br>${escapeHtml(step.url || '')}</p></section>`;
  }).join('\n');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.7;color:#111827;margin:32px}h1{font-size:24px;border-bottom:2px solid #1f2937;padding-bottom:8px}.step{break-inside:avoid}h2{font-size:18px;margin:0 0 8px}.note{background:#f3f4f6;border-left:4px solid #6b7280;padding:8px 12px}.capture-wrap{position:relative;display:inline-block;border:1px solid #d1d5db}.capture-wrap img{display:block;max-width:100%;height:auto}.marker{position:absolute;width:16px;height:16px;border:3px solid #ef4444;border-radius:999px;transform:translate(-50%,-50%);box-shadow:0 0 0 2px rgba(255,255,255,.92)}.marker:after{content:"";position:absolute;left:50%;top:50%;width:4px;height:4px;background:#ef4444;border-radius:50%;transform:translate(-50%,-50%)}.meta{font-size:12px;color:#6b7280;word-break:break-all}@media print{body{margin:18mm}.step{page-break-inside:avoid}}${templateStyles()}</style></head><body><h1>${escapeHtml(title)}</h1>${steps || '<p>手順がありません。</p>'}</body></html>`;
}
function buildPlainText() { return [state.title || '手順書', '', ...state.steps.map((s, i) => `${i + 1}. ${s.memo || ''}${s.note ? `\n補足：${s.note}` : ''}`)].join('\n'); }
function buildTsv() { const rows = [['No.', '操作説明', '補足・注意事項', 'ページタイトル', 'URL', '記録時刻']]; state.steps.forEach((s, i) => rows.push([i + 1, s.memo || '', s.note || '', s.pageTitle || '', s.url || '', formatDate(s.createdAt)])); return rows.map(row => row.map(v => String(v).replace(/\t/g, ' ').replace(/\r?\n/g, ' ')).join('\t')).join('\n'); }
function buildExcelHtml() { const rows = state.steps.map((s, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(s.memo || '')}</td><td>${escapeHtml(s.note || '').replace(/\n/g, '<br>')}</td><td><img src="${s.image}" width="320"></td><td>${escapeHtml(s.pageTitle || '')}</td><td>${escapeHtml(s.url || '')}</td></tr>`).join(''); return `<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr><th>No.</th><th>操作説明</th><th>補足・注意事項</th><th>画面</th><th>ページタイトル</th><th>URL</th></tr></thead><tbody>${rows}</tbody></table></body></html>`; }
function buildMarkdown() { const lines = [`# ${escapeMarkdown(state.title || '手順書')}`, '']; state.steps.forEach((s, i) => { lines.push(`## ${i + 1}. ${escapeMarkdown(s.memo || '操作します。')}`, ''); if (s.note) lines.push(`> **補足:** ${escapeMarkdown(s.note).replace(/\n/g, '  \n> ')}`, ''); lines.push(`![手順${i + 1}の画面](${s.image})`, ''); if (s.pageTitle || s.url) lines.push(`<details><summary>ページ情報</summary>`, '', `${escapeMarkdown(s.pageTitle || '')}  `, `${s.url || ''}`, '', `</details>`, ''); }); return lines.join('\n'); }

async function copyWordHtml() { if (!state.steps.length) return toast('コピーする手順がありません。'); const html = buildHtmlDocument(); const plain = buildPlainText(); try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]); toast('Word向けにコピーしました。'); } catch { await navigator.clipboard.writeText(plain); toast('画像込みコピーに失敗したため、文章のみコピーしました。'); } }
async function copyExcel() { if (!state.steps.length) return toast('コピーする手順がありません。'); await navigator.clipboard.writeText(buildTsv()); toast('Excel向けの表をコピーしました。A1セルへ貼り付けてください。'); }
async function copyMarkdown() { await navigator.clipboard.writeText(buildMarkdown()); toast('Markdownをコピーしました。'); }

$('#toggleRecording').addEventListener('click', async () => { await send({ type: 'manualclip_set_recording', recording: !state.recording }); await loadState(); });
$('#manualCapture').addEventListener('click', async () => { const res = await send({ type: 'manualclip_manual_capture' }); if (!res?.ok) toast(res?.error || 'キャプチャに失敗しました。'); await loadState(); });
titleEl.addEventListener('input', async () => { state.title = titleEl.value; await send({ type: 'manualclip_set_title', title: state.title }); });
templateEl.addEventListener('change', async () => { state.template = templateEl.value; await send({ type: 'manualclip_set_template', template: state.template }); toast('出力テンプレートを変更しました。'); });
$('#copyWord').addEventListener('click', copyWordHtml);
$('#copyExcel').addEventListener('click', copyExcel);
$('#downloadExcel').addEventListener('click', () => download(safeFilename(state.title, 'xls'), buildExcelHtml(), 'application/vnd.ms-excel;charset=utf-8'));
$('#downloadHtml').addEventListener('click', () => download(safeFilename(state.title, 'html'), buildHtmlDocument(), 'text/html;charset=utf-8'));
$('#copyMarkdown').addEventListener('click', copyMarkdown);
$('#downloadMarkdown').addEventListener('click', () => download(safeFilename(state.title, 'md'), buildMarkdown(), 'text/markdown;charset=utf-8'));
$('#exportJson').addEventListener('click', () => download(safeFilename(state.title || 'manual-clip-data', 'json'), JSON.stringify({ title: state.title, template: state.template, steps: state.steps }, null, 2), 'application/json;charset=utf-8'));
$('#clearAll').addEventListener('click', async () => { if (!confirm('現在の手順をすべて削除します。よろしいですか？')) return; await send({ type: 'manualclip_clear' }); await loadState(); });
$('#importJson').addEventListener('change', async event => { const file = event.target.files?.[0]; if (!file) return; try { await send({ type: 'manualclip_import_state', state: JSON.parse(await file.text()) }); await loadState(); toast('JSONを読み込みました。'); } catch { toast('JSONの読み込みに失敗しました。'); } finally { event.target.value = ''; } });
chrome.runtime.onMessage.addListener(message => { if (message?.type === 'manualclip_state_changed') loadState(); });
loadState();
