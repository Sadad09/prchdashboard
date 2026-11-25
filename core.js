(() => {
const pt = window.pt = {};
pt.col = {mom: 'data/prch/mom', team: 'data/prch/team', tasks: 'data/prch/tasks', pipeline: 'data/prch/pipeline', collaterals: 'data/prch/collaterals'};
pt.iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
pt.today = () => pt.iso(new Date());
pt.taskFilter = 'open';
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
pt.fmtDate = (s) => { if (typeof s !== 'string' || s.length < 10) return '—'; const m = +s.slice(5, 7); return `${+s.slice(8, 10)} ${BLN[m - 1] || ''} ${s.slice(0, 4)}`; };
pt.shortDate = (s) => { if (typeof s !== 'string' || s.length < 10) return '—'; const m = +s.slice(5, 7); return `${+s.slice(8, 10)} ${BLN[m - 1] || ''}`; };
pt.rupiah = (v) => (v === '' || v == null || !isFinite(+v)) ? '—' : new Intl.NumberFormat('en-US', {style: 'currency', currency: 'IDR', maximumFractionDigits: 0}).format(+v);
pt.rupiahShort = (v) => (v === '' || v == null || !isFinite(+v)) ? '—' : new Intl.NumberFormat('en-US', {style: 'currency', currency: 'IDR', notation: 'compact', maximumFractionDigits: 1}).format(+v);
pt.TONES = {
  status: [['Pending', 'pend'], ['To do', 'muted'], ['In progress', 'blue'], ['Review', 'warn'], ['Done', 'ok']],
  priority: [['High', 'bad'], ['Medium', 'warn'], ['Low', 'muted']],
  stage: [['Prospect', 'muted'], ['Pitching', 'blue'], ['Negotiation', 'warn'], ['Deal', 'ok'], ['Lost', 'bad']],
  collat: [['Draft', 'muted'], ['Review', 'warn'], ['Final', 'ok']],
  contract: [['Main con', 'blue'], ['Subcon', 'warn']],
  engagement: [['Retainer', 'ok'], ['Project based', 'blue']],
  sentiment: [['Positif', 'ok'], ['Netral', 'muted'], ['Negatif', 'bad']],
  tier: [['Tier 1', 'blue'], ['Tier 2', 'muted'], ['Tier 3', 'muted']]
};
pt.opts = (name) => pt.TONES[name].map((x) => x[0]);
pt.toneOf = (name, v) => (pt.TONES[name].find((x) => x[0] === v) || pt.TONES[name][0])[1];

pt.save = async (fn) => {
  let ok = true;
  try { const db = await claude.use('db'); if (!db) throw new Error('db'); await fn(db); } catch (e) { ok = false; }
  document.querySelectorAll('#unsaved').forEach((p) => { p.hidden = ok; });
  return ok;
};
pt.add = (k, row) => pt.save((db) => db.collection(pt.col[k]).add({...row, createdAt: new Date().toISOString()}));
pt.update = (k, id, patch) => pt.save((db) => db.doc(`${pt.col[k]}/${id}`).update(patch));
pt.remove = (k, id) => pt.save((db) => db.doc(`${pt.col[k]}/${id}`).delete());

pt.el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
pt.note = (el, text) => { el.replaceChildren(pt.el('p', 'pt-empty', text)); };
pt.msgRow = (el, n, text) => { const tr = document.createElement('tr'); const td = pt.el('td', 'pt-empty', text); td.colSpan = n; tr.append(td); el.replaceChildren(tr); };
pt.mark = (e, src, field, whereCol, whereVal) => { e.setAttribute('data-source', src); e.setAttribute('data-field', field); e.setAttribute('data-where', `${whereCol}=${encodeURIComponent(whereVal)}`); return e; };

pt.pill = (name, value, label, onChange) => {
  const s = document.createElement('select'); s.className = 'dash-select pt-pill'; s.setAttribute('aria-label', label);
  const o = pt.opts(name); o.forEach((x) => s.add(new Option(x)));
  s.value = o.includes(value) ? value : o[0];
  const setT = () => { s.setAttribute('data-tone', pt.toneOf(name, s.value)); }; setT();
  s.addEventListener('change', () => { setT(); onChange(s.value); });
  return s;
};
pt.tag = (name, v) => { const t = pt.el('span', 'pt-tag', v || pt.opts(name)[0]); t.setAttribute('data-tone', pt.toneOf(name, v)); return t; };
pt.avatar = (name, big) => {
  const n = String(name || '?');
  const ini = n.split('(')[0].trim().split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  const h = [...n].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const a = pt.el('span', 'pt-av' + (big ? ' is-big' : ''), ini); a.setAttribute('aria-hidden', 'true');
  a.style.background = dash.colors[h % Math.min(6, dash.colors.length)];
  return a;
};
pt.person = (name) => { const p = pt.el('span', 'pt-person'); if (!name) { p.append(pt.el('span', '', 'No PIC yet')); return p; } p.append(pt.avatar(name), pt.el('span', '', name)); return p; };
pt.delBtn = (k, id) => {
  const b = pt.el('button', 'pt-del', 'Delete'); b.type = 'button'; b.setAttribute('aria-label', 'Delete');
  let armed = null;
  b.addEventListener('click', () => {
    if (armed) {
      clearTimeout(armed); armed = null; b.disabled = true;
      pt.remove(k, id).then((ok) => { if (!ok) { b.disabled = false; b.textContent = 'Delete'; b.classList.remove('is-armed'); } });
      return;
    }
    b.textContent = 'Sure?'; b.classList.add('is-armed');
    armed = setTimeout(() => { armed = null; b.textContent = 'Delete'; b.classList.remove('is-armed'); }, 3000);
  });
  return b;
};
pt.deadlineBadge = (r) => {
  if (!r.deadline) return null;
  const today = pt.today();
  const d3d = new Date(); d3d.setDate(d3d.getDate() + 3); const soon = pt.iso(d3d);
  const open = r.status !== 'Done';
  const late = open && r.deadline < today;
  const b = pt.el('span', 'pt-badge' + (late ? ' is-bad' : (open && r.deadline <= soon ? ' is-soon' : '')));
  b.textContent = late ? `Overdue · ${pt.shortDate(r.deadline)}` : (r.deadline === today ? 'Today' : `📅 ${pt.shortDate(r.deadline)}`);
  return b;
};

pt.table = (el, k, cols, opts) => {
  const st = dash.data(k); const n = cols.length + 1;
  if (st.status === 'loading') return pt.msgRow(el, n, 'Loading…');
  if (st.status === 'error') return pt.msgRow(el, n, 'Could not load data. Try reloading the page.');
  if (st.status !== 'ok') return pt.msgRow(el, n, '—');
  let rows = st.data.slice();
  if (opts.filter) rows = rows.filter(opts.filter);
  if (opts.sort) rows.sort(opts.sort);
  if (!rows.length) return pt.msgRow(el, n, opts.empty);
  el.replaceChildren(...rows.map((r) => {
    const tr = document.createElement('tr'); tr.setAttribute('data-key', encodeURIComponent(r.id));
    cols.forEach((c) => {
      const td = document.createElement('td'); const v = r[c.key];
      if (c.pill) td.append(pt.pill(c.pill, v, c.label, (nv) => pt.update(k, r.id, {[c.key]: nv})));
      else if (c.person) td.append(pt.person(v));
      else if (c.chip) td.append(v ? pt.el('span', 'pt-chip', v) : pt.el('span', 'pt-meta', '—'));
      else if (c.link) {
        const u = typeof v === 'string' ? v.trim() : '';
        if (u.startsWith('https://') || u.startsWith('http://')) { const a = pt.el('a', '', 'Buka ↗'); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; td.append(a); }
        else td.textContent = u || '—';
      } else td.textContent = c.fmt ? c.fmt(v, r) : ((v == null || v === '') ? '—' : String(v));
      const cls = [c.num ? 'pt-num' : '', c.cls ? c.cls(r) : ''].filter(Boolean).join(' ');
      if (cls) td.className = cls;
      tr.append(td);
    });
    const td = document.createElement('td'); td.append(pt.delBtn(k, r.id)); tr.append(td);
    return tr;
  }));
};

pt.board = (el, k, o) => {
  const st = dash.data(k);
  el.classList.toggle('dash-skeleton', st.status === 'loading');
  if (st.status === 'loading') { el.replaceChildren(); return; }
  if (st.status !== 'ok') { pt.note(el, st.status === 'error' ? 'Could not load data. Try reloading the page.' : '—'); return; }
  const cols = pt.opts(o.tone);
  el.replaceChildren(...cols.map((col, ci) => {
    const all = st.data.filter((r) => (cols.includes(r[o.field]) ? r[o.field] : cols[0]) === col);
    if (o.sort) all.sort(o.sort);
    const lim = o.limit && o.limit[col];
    const shown = lim ? all.slice(0, lim) : all;
    const c = pt.el('div', 'pt-col'); c.setAttribute('data-tone', pt.toneOf(o.tone, col)); c.setAttribute('aria-label', `${col} column`);
    const head = pt.el('div', 'pt-col-head'); const nm = pt.el('span', 'pt-col-name'); nm.append(pt.el('span', 'pt-dot'), pt.el('span', '', col));
    head.append(nm, pt.el('span', 'pt-count', String(all.length))); c.append(head);
    if (o.headExtra) c.append(pt.el('div', 'pt-col-extra', o.headExtra(all)));
    if (o.hints && o.hints[col]) c.append(pt.el('div', 'pt-col-extra', o.hints[col]));
    if (!all.length) c.append(pt.el('div', 'pt-col-empty', o.emptyCol || 'Empty. Drag a card here.'));
    shown.forEach((r) => {
      const card = pt.el('div', 'pt-kcard'); card.draggable = true;
      card.append(...o.card(r).filter(Boolean));
      const foot = pt.el('div', 'pt-kcard-foot'); foot.append(o.foot ? o.foot(r) : pt.el('span'));
      const mv = pt.el('div', 'pt-move');
      const prev = pt.el('button', '', '◀'); prev.type = 'button'; prev.disabled = ci === 0; prev.setAttribute('aria-label', ci > 0 ? `Move to ${cols[ci - 1]}` : 'Move left');
      const next = pt.el('button', '', '▶'); next.type = 'button'; next.disabled = ci === cols.length - 1; next.setAttribute('aria-label', ci < cols.length - 1 ? `Move to ${cols[ci + 1]}` : 'Move right');
      prev.addEventListener('click', () => pt.update(k, r.id, {[o.field]: cols[ci - 1]}));
      next.addEventListener('click', () => pt.update(k, r.id, {[o.field]: cols[ci + 1]}));
      mv.append(prev, next); if (o.deletable) mv.append(pt.delBtn(k, r.id)); foot.append(mv); card.append(foot);
      card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move'; card.classList.add('is-drag'); });
      card.addEventListener('dragend', () => card.classList.remove('is-drag'));
      c.append(card);
    });
    if (all.length > shown.length) c.append(pt.el('div', 'pt-more', `+${all.length - shown.length} more, see Table view`));
    c.addEventListener('dragover', (e) => { e.preventDefault(); c.classList.add('is-over'); });
    c.addEventListener('dragleave', (e) => { if (!c.contains(e.relatedTarget)) c.classList.remove('is-over'); });
    c.addEventListener('drop', (e) => {
      e.preventDefault(); c.classList.remove('is-over');
      const id = e.dataTransfer.getData('text/plain'); const r = st.data.find((x) => x.id === id);
      if (r && r[o.field] !== col) pt.update(k, id, {[o.field]: col});
    });
    return c;
  }));
};

pt.hbar = (el, rows, o) => {
  el.replaceChildren();
  const W = Math.max(240, el.clientWidth || 320); const rowH = 34;
  const H = rows.length * rowH + 8;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', o.aria);
  const measure = (cls, texts) => { const g = svg.append('g'); let w = 0; g.selectAll('text').data(texts).join('text').attr('class', cls).text((t) => t).each(function () { w = Math.max(w, this.getComputedTextLength()); }); g.remove(); return w; };
  const short = (t) => t.length > 22 ? t.slice(0, 21) + '…' : t;
  const lw = Math.min(measure('pt-lab', rows.map((d) => short(String(d[o.label])))) + 12, W * 0.4);
  const vw = measure('pt-val', rows.map(o.valueText)) + 12;
  const track = Math.max(20, W - lw - vw);
  const max = d3.max(rows, (d) => +d[o.value]) || 1;
  const x = d3.scaleLinear().domain([0, max]).range([0, track]);
  const g = svg.selectAll('g.pt-row').data(rows).join('g').attr('class', 'pt-row').attr('transform', (d, i) => `translate(0,${i * rowH + 4})`);
  g.append('rect').attr('x', lw).attr('y', 7).attr('height', rowH - 14).attr('rx', 5).attr('width', track).style('fill', 'var(--cds-chart-grid)').style('opacity', 0.5);
  g.append('text').attr('class', 'pt-lab').attr('x', lw - 10).attr('y', rowH / 2).attr('dy', '0.35em').attr('text-anchor', 'end').text((d) => short(String(d[o.label])));
  g.append('rect').attr('x', lw).attr('y', 7).attr('height', rowH - 14).attr('rx', 5).attr('width', (d) => Math.max(+d[o.value] > 0 ? 3 : 0, x(+d[o.value] || 0))).style('fill', (d, i) => o.colorEach ? dash.colors[i % dash.colors.length] : (dash.colors[1] || dash.colors[0]));
  if (o.sub) g.append('rect').attr('x', lw).attr('y', 7).attr('height', rowH - 14).attr('rx', 5).attr('width', (d) => x(Math.min(+d[o.sub] || 0, +d[o.value] || 0))).style('fill', 'var(--color-bad)');
  g.append('text').attr('class', 'pt-val').attr('x', (d) => lw + x(+d[o.value] || 0) + 8).attr('y', rowH / 2).attr('dy', '0.35em').text(o.valueText);
  g.append('rect').attr('x', 0).attr('y', 0).attr('width', W).attr('height', rowH).style('fill', 'transparent');
  const tip = d3.select(el).append('div').attr('class', 'pt-tip');
  g.on('pointermove', (ev, d) => { const [px, py] = d3.pointer(ev, el); tip.text(o.tip(d)).style('opacity', 1).style('left', `${Math.max(0, Math.min(px + 12, el.clientWidth - 200))}px`).style('top', `${py + 14}px`); })
   .on('pointerleave', () => tip.style('opacity', 0));
};

dash.calc('workload', {
  title: 'Workload per person',
  description: 'Open tasks per PIC, how many are overdue, and how many are Done.',
  inputs: ['tasks', 'team'],
  fn: (tasks, team) => {
    const n = new Date();
    const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    const m = new Map();
    team.forEach((t) => { if (t.name) m.set(t.name, {owner: t.name, open: 0, overdue: 0, done: 0}); });
    tasks.forEach((t) => {
      const o = t.owner || 'No PIC yet';
      if (!m.has(o)) m.set(o, {owner: o, open: 0, overdue: 0, done: 0});
      const r = m.get(o);
      if (t.status === 'Done') r.done += 1;
      else { r.open += 1; if (t.deadline && t.deadline < today) r.overdue += 1; }
    });
    return [...m.values()].sort((a, b) => b.open - a.open || a.owner.localeCompare(b.owner));
  }
});

dash.calc('kpi', {
  title: 'Summary figures',
  description: 'Headline figures: open and overdue tasks, active pipeline value (Prospect to Negotiation), deals won, collaterals, team size and number of MoMs.',
  inputs: ['tasks', 'pipeline', 'collaterals', 'team', 'mom'],
  fn: (tasks, pipeline, collaterals, team, mom) => {
    const n = new Date();
    const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    const sum = (rows) => rows.reduce((s, p) => s + (Number(p.value) || 0), 0);
    const open = tasks.filter((t) => t.status !== 'Done');
    const active = pipeline.filter((p) => ['Prospect', 'Pitching', 'Negotiation'].includes(p.stage));
    const won = pipeline.filter((p) => p.stage === 'Deal');
    return [{
      openTasks: open.length,
      overdue: open.filter((t) => t.deadline && t.deadline < today).length,
      pipelineValue: sum(active),
      activeDeals: active.length,
      dealsWon: won.length,
      wonValue: sum(won),
      collatReview: collaterals.filter((c) => c.status === 'Review').length,
      collatOpen: collaterals.filter((c) => c.status !== 'Final').length,
      teamCount: team.length,
      momCount: mom.length
    }];
  }
});

dash.calc('pipeStages', {
  title: 'Pipeline by stage',
  description: 'Number of clients and total project value at each pipeline stage.',
  inputs: ['pipeline'],
  fn: (pipeline) => ['Prospect', 'Pitching', 'Negotiation', 'Deal', 'Lost'].map((stage) => {
    const rows = pipeline.filter((p) => p.stage === stage);
    return {stage, deals: rows.length, value: rows.reduce((s, p) => s + (Number(p.value) || 0), 0)};
  })
});
})();
