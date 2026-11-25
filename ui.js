(() => {
const pt = window.pt;
document.querySelectorAll('.pt').forEach((e) => { dash.colors.forEach((c, i) => e.style.setProperty(`--pt-c${i}`, c)); });

const tabs = [...document.querySelectorAll('.pt-tab')];
const openTab = (id) => {
  const secs = [...document.querySelectorAll('.pt-sec')];
  if (!secs.some((s) => s.id === id)) return;
  secs.forEach((s) => { s.hidden = s.id !== id; });
  tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === id)));
  dash.setLink(id);
};
tabs.forEach((t) => t.addEventListener('click', () => openTab(t.dataset.tab)));
const start = (location.hash || '').slice(1);
if (start) openTab(start);

document.querySelectorAll('.pt-segbtn').forEach((b) => b.addEventListener('click', () => {
  const of = b.dataset.for; const v = b.dataset.view;
  document.querySelectorAll('.pt-view').forEach((x) => { if (x.dataset.of === of) x.hidden = x.dataset.view !== v; });
  document.querySelectorAll('.pt-segbtn').forEach((y) => { if (y.dataset.for === of) y.setAttribute('aria-pressed', String(y.dataset.view === v)); });
}));

document.querySelectorAll('#taskFilter').forEach((s) => s.addEventListener('change', () => { pt.taskFilter = s.value; dash.draw('tasksBody'); }));

const aiRows = () => [...document.querySelectorAll('.pt-ai-row')];
document.querySelectorAll('#aiMore').forEach((b) => b.addEventListener('click', () => {
  const next = aiRows().find((r) => r.hidden);
  if (next) next.hidden = false;
  b.disabled = !aiRows().some((r) => r.hidden);
}));

const saveMom = async (row) => {
  const now = new Date().toISOString();
  const acts = [];
  for (let i = 1; i <= 8; i++) {
    const t = String(row[`ai_task_${i}`] || '').trim();
    if (t) acts.push({title: t, owner: row[`ai_owner_${i}`] || '', deadline: row[`ai_deadline_${i}`] || ''});
    delete row[`ai_task_${i}`]; delete row[`ai_owner_${i}`]; delete row[`ai_deadline_${i}`];
  }
  const id = `mom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return pt.save(async (db) => {
    await db.doc(`${pt.col.mom}/${id}`).set({...row, createdAt: now});
    for (const a of acts) await db.collection(pt.col.tasks).add({...a, client: row.client || '', priority: 'Medium', status: 'To do', momId: id, momTitle: row.title || '', createdAt: new Date().toISOString()});
  });
};

document.querySelectorAll('.pt-form[data-col]').forEach((f) => f.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const k = f.dataset.col; const row = {};
  new FormData(f).forEach((v, key) => { row[key] = typeof v === 'string' ? v.trim() : v; });
  if ('value' in row) row.value = row.value === '' ? 0 : Number(row.value);
  if (k === 'tasks') {
    if (row.momId) { const ms = dash.data('mom'); const m = (ms.status === 'ok' ? ms.data : []).find((x) => x.id === row.momId); row.momTitle = m ? (m.title || '') : ''; }
    else delete row.momId;
  }
  const btns = f.querySelectorAll('button'); btns.forEach((b) => { b.disabled = true; });
  const ok = k === 'mom' ? await saveMom(row) : await pt.add(k, row);
  btns.forEach((b) => { b.disabled = false; });
  if (ok) {
    f.querySelectorAll('input, textarea').forEach((i) => { i.value = ''; });
    if (k === 'mom') { f.querySelectorAll('.pt-ai-row select').forEach((s) => { s.value = ''; }); aiRows().forEach((r, i) => { r.hidden = i >= 3; }); }
    const d = f.closest('details'); if (d) d.open = false;
  }
}));

const wasHidden = new Map();
window.addEventListener('beforeprint', () => { document.querySelectorAll('.pt-sec, .pt-view').forEach((s) => { if (!wasHidden.has(s)) wasHidden.set(s, s.hidden); s.hidden = false; }); });
window.addEventListener('afterprint', () => { wasHidden.forEach((h, s) => { s.hidden = h; }); wasHidden.clear(); });
})();
