(() => {
const HARI = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

dash.draw('greet', (el) => { const h = new Date().getHours(); el.textContent = h < 12 ? 'Good morning' : (h < 18 ? 'Good afternoon' : 'Good evening'); });
dash.draw('todayLabel', (el) => { const d = new Date(); el.textContent = `${HARI[d.getDay()]}, ${pt.fmtDate(pt.iso(d))}`; });

const drawNum = (src) => (el) => {
  const k = dash.data(src);
  const row = k.status === 'ok' && Array.isArray(k.data) ? k.data[0] : null;
  el.classList.toggle('dash-skeleton', k.status === 'loading');
  if (!row) { el.textContent = '—'; return; }
  const v = row[el.getAttribute('data-field')];
  const f = el.getAttribute('data-fmt');
  el.textContent = f === 'rp' ? pt.rupiah(v) : (f === 'pct' ? `${v}%` : String(v ?? '—'));
  if (el.hasAttribute('data-badwhen')) el.classList.toggle('is-bad', Number(v) > 0);
};
dash.draw('kpi', drawNum('kpi'));

const chartState = (el, st, errText) => {
  el.classList.toggle('dash-skeleton', st.status === 'loading');
  if (st.status === 'loading') { el.replaceChildren(); return false; }
  if (st.status !== 'ok' || !Array.isArray(st.data)) { pt.note(el, st.status === 'error' ? errText : '—'); return false; }
  return true;
};

dash.draw('workloadChart', (el) => {
  const w = dash.data('workload');
  if (!chartState(el, w, 'Could not load workload.')) return;
  if (!w.data.length) { pt.note(el, 'No team members or tasks yet. Start in the Team tab, then add tasks in the Tasks tab.'); return; }
  pt.hbar(el, w.data, {
    label: 'owner', value: 'open', sub: 'overdue', aria: 'Bar chart of open tasks per team member',
    valueText: (d) => d.overdue ? `${d.open} (${d.overdue} overdue)` : String(d.open),
    tip: (d) => `${d.owner}\nOpen: ${d.open}\nOverdue: ${d.overdue}\nDone: ${d.done}`
  });
});

dash.draw('pipeChart', (el) => {
  const p = dash.data('pipeStages');
  if (!chartState(el, p, 'Could not load the pipeline.')) return;
  if (!p.data.some((d) => d.deals > 0)) { pt.note(el, 'The pipeline is empty. Add your first prospect in the Pipeline tab.'); return; }
  pt.hbar(el, p.data, {
    label: 'stage', value: 'deals', colorEach: true, aria: 'Bar chart of clients per pipeline stage',
    valueText: (d) => `${d.deals} clients · ${pt.rupiahShort(d.value)}`,
    tip: (d) => `${d.stage}\n${d.deals} clients\nTotal value: ${pt.rupiah(d.value)}`
  });
});

dash.draw('upcoming', (el) => {
  const t = dash.data('tasks');
  const msg = (text) => { el.replaceChildren(pt.el('li', 'pt-empty', text)); };
  if (t.status === 'loading') return msg('Loading…');
  if (t.status !== 'ok') return msg(t.status === 'error' ? 'Could not load tasks.' : '—');
  const d7 = new Date(); d7.setDate(d7.getDate() + 7); const lim = pt.iso(d7);
  const rows = t.data.filter((r) => r.status !== 'Done' && r.deadline && r.deadline <= lim).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 7);
  if (!rows.length) return msg('✨ All clear: nothing overdue or due this week.');
  el.replaceChildren(...rows.map((r) => {
    const li = pt.el('li', 'pt-li');
    const body = pt.el('div', 'pt-li-body');
    body.append(pt.el('span', 'pt-li-title', r.title || '(untitled)'), pt.el('span', 'pt-meta', [r.client, r.status].filter(Boolean).join(' · ')));
    li.append(pt.avatar(r.owner || '?'), body, pt.deadlineBadge(r));
    return li;
  }));
});

dash.draw('ownerSelect', (sel) => {
  const t = dash.data('team'); const keep = sel.value;
  const names = t.status === 'ok' ? [...new Set(t.data.map((r) => r.name).filter(Boolean))].sort((a, b) => a.localeCompare(b)) : [];
  sel.replaceChildren(new Option('Select PIC', ''), ...names.map((n) => new Option(n)));
  sel.value = names.includes(keep) ? keep : '';
});

dash.draw('clientList', (dl) => {
  const set = new Set();
  ['tasks', 'pipeline', 'collaterals', 'mom'].forEach((k) => { const d = dash.data(k); if (d.status === 'ok') d.data.forEach((r) => { if (r.client) set.add(r.client); }); });
  dl.replaceChildren(...[...set].sort((a, b) => a.localeCompare(b)).map((c) => new Option(c)));
});

const PRIO = {High: 0, Medium: 1, Low: 2};
const byDeadline = (a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || (PRIO[a.priority] ?? 1) - (PRIO[b.priority] ?? 1);

dash.draw('taskBoard', (el) => {
  pt.board(el, 'tasks', {
    field: 'status', tone: 'status', limit: {Done: 6}, deletable: true,
    sort: (a, b) => a.status === 'Done' && b.status === 'Done' ? String(b.createdAt || '').localeCompare(String(a.createdAt || '')) : byDeadline(a, b),
    card: (r) => {
      const top = pt.el('div', 'pt-kcard-top'); top.append(pt.tag('priority', r.priority || 'Medium'));
      const dl = pt.deadlineBadge(r); if (dl) top.append(dl);
      const title = pt.el('div', 'pt-kcard-title', r.title || '(untitled)');
      return [top, title, r.client ? pt.el('span', 'pt-chip', r.client) : null, r.momId ? pt.el('span', 'pt-chip', `🗒️ ${r.momTitle || 'From MoM'}`) : null];
    },
    foot: (r) => pt.person(r.owner)
  });
});

dash.draw('pipeBoard', (el) => {
  pt.board(el, 'pipeline', {
    field: 'stage', tone: 'stage',
    sort: (a, b) => (Number(b.value) || 0) - (Number(a.value) || 0),
    headExtra: (rows) => pt.rupiahShort(rows.reduce((s, r) => s + (Number(r.value) || 0), 0)),
    emptyCol: 'No clients at this stage.',
    card: (r) => {
      const title = pt.el('div', 'pt-kcard-title', r.client || '(unnamed)');
      const val = pt.el('div', 'pt-kcard-value', pt.rupiah(r.value));
      const top = pt.el('div', 'pt-kcard-top'); top.append(pt.tag('contract', r.contract || 'Main con'));
      if (r.partner) top.append(pt.el('span', 'pt-meta', `${r.contract === 'Subcon' ? 'Main con' : 'Subcon'}: ${r.partner}`));
      return [top, title, val, r.nextStep ? pt.el('span', 'pt-meta', `➡ ${r.nextStep}`) : null];
    },
    foot: (r) => pt.person(r.pic)
  });
});

dash.draw('tasksBody', (el) => {
  const today = pt.today(); const f = pt.taskFilter;
  pt.table(el, 'tasks', [
    {key: 'title'}, {key: 'client', chip: true}, {key: 'owner', person: true},
    {key: 'deadline', fmt: (v) => pt.fmtDate(v), cls: (r) => (r.status !== 'Done' && r.deadline && r.deadline < today) ? 'pt-bad' : ''},
    {key: 'priority', label: 'Priority', pill: 'priority'},
    {key: 'status', label: 'Status', pill: 'status'}
  ], {
    filter: (r) => f === 'all' ? true : (f === 'done' ? r.status === 'Done' : r.status !== 'Done'),
    sort: byDeadline,
    empty: f === 'done' ? 'No tasks marked Done yet.' : 'No tasks yet. Click “＋ Add task” above.'
  });
});

dash.draw('pipeBody', (el) => {
  const ST = pt.opts('stage');
  pt.table(el, 'pipeline', [
    {key: 'client'}, {key: 'stage', label: 'Stage', pill: 'stage'},
    {key: 'contract', label: 'PRCH role', pill: 'contract'}, {key: 'partner'},
    {key: 'value', num: true, fmt: (v) => pt.rupiah(v)},
    {key: 'pic', person: true}, {key: 'nextStep'}
  ], {
    sort: (a, b) => ST.indexOf(a.stage) - ST.indexOf(b.stage) || (Number(b.value) || 0) - (Number(a.value) || 0),
    empty: 'The pipeline is empty. Click “＋ Add prospect” above.'
  });
});

const CST = {Draft: 0, Review: 1, Final: 2};
dash.draw('collBody', (el) => {
  pt.table(el, 'collaterals', [
    {key: 'name'}, {key: 'client', chip: true}, {key: 'type', chip: true}, {key: 'owner', person: true},
    {key: 'status', label: 'Status', pill: 'collat'}, {key: 'link', link: true}
  ], {
    sort: (a, b) => (CST[a.status] ?? 0) - (CST[b.status] ?? 0) || String(a.name || '').localeCompare(String(b.name || '')),
    empty: 'No documents yet. Click “＋ Add document” above.'
  });
});

dash.draw('teamCards', (el) => {
  const t = dash.data('team'); const w = dash.data('workload');
  el.classList.toggle('dash-skeleton', t.status === 'loading');
  if (t.status === 'loading') { el.replaceChildren(); return; }
  if (t.status !== 'ok') { pt.note(el, t.status === 'error' ? 'Could not load team data.' : '—'); return; }
  if (!t.data.length) { pt.note(el, 'No members yet. Click “＋ Add member” above.'); return; }
  const wl = new Map((w.status === 'ok' && Array.isArray(w.data) ? w.data : []).map((r) => [r.owner, r]));
  el.replaceChildren(...t.data.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).map((m) => {
    const card = pt.el('div', 'pt-card pt-member');
    const top = pt.el('div', 'pt-member-top'); const info = pt.el('div', 'pt-member-info');
    info.append(pt.el('span', 'pt-member-name', m.name || '(unnamed)'), pt.el('span', 'pt-meta', m.role || 'Role not set'));
    top.append(pt.avatar(m.name, true), info);
    const stats = pt.el('div', 'pt-stats'); const r = wl.get(m.name);
    [['open', 'Active'], ['overdue', 'Overdue'], ['done', 'Done']].forEach(([f, lab]) => {
      const s = pt.el('div', 'pt-stat');
      const v = pt.el('span', 'pt-stat-val', r ? String(r[f]) : '—');
      if (r && f === 'overdue' && r[f] > 0) v.classList.add('is-bad');
      s.append(v, pt.el('span', 'pt-stat-lab', lab)); stats.append(s);
    });
    const foot = pt.el('div', 'pt-member-foot'); foot.append(pt.delBtn('team', m.id));
    card.append(top, stats, foot);
    return card;
  }));
});
})();
