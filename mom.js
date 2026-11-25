(() => {
const LF = String.fromCharCode(10); const CR = String.fromCharCode(13);
pt.xmlEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;');
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
pt.zip = (files) => {
  const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
  files.forEach((f) => {
    const name = enc.encode(f.name); const data = enc.encode(f.text); const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0, true); c.setUint16(10, 0, true);
    c.setUint16(12, 0, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true);
    c.setUint32(38, 0, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  });
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(4, 0, true); e.setUint16(6, 0, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true); e.setUint16(20, 0, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0)); let o = 0; all.forEach((p) => { out.set(p, o); o += p.length; });
  return out;
};
pt.momDocx = (m, actions) => {
  const X = pt.xmlEsc;
  const R = (t, o = {}) => `<w:r><w:rPr><w:rFonts w:ascii='Arial' w:hAnsi='Arial' w:cs='Arial'/>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.color ? `<w:color w:val='${o.color}'/>` : ''}<w:sz w:val='${(o.size || 11) * 2}'/><w:szCs w:val='${(o.size || 11) * 2}'/></w:rPr><w:t xml:space='preserve'>${X(t)}</w:t></w:r>`;
  const P = (runs, o = {}) => `<w:p><w:pPr>${o.border ? `<w:pBdr><w:bottom w:val='single' w:sz='8' w:space='4' w:color='0029A8'/></w:pBdr>` : ''}<w:spacing w:before='${o.before || 0}' w:after='${o.after ?? 120}'/></w:pPr>${runs}</w:p>`;
  const H = (t) => P(R(t, {b: true, size: 12, color: '0029A8'}), {before: 280, after: 80});
  const lines = (t) => { const ls = String(t || '').split(LF).map((l) => l.replace(CR, '')); return (ls.join('').trim() ? ls : ['-']).map((l) => P(R(l), {after: 40})).join(''); };
  const meta = (k, v) => P(R(`${k}: `, {b: true}) + R(v || '-'), {after: 40});
  const W = [500, 4300, 1700, 1600, 1538];
  const cell = (t, i, head) => `<w:tc><w:tcPr><w:tcW w:w='${W[i]}' w:type='dxa'/>${head ? `<w:shd w:val='clear' w:color='auto' w:fill='E6ECF8'/>` : ''}</w:tcPr><w:p><w:pPr><w:spacing w:before='40' w:after='40'/></w:pPr>${R(t, {b: head, size: 10})}</w:p></w:tc>`;
  const row = (cells, head) => `<w:tr>${cells.map((c, i) => cell(c, i, head)).join('')}</w:tr>`;
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val='single' w:sz='4' w:space='0' w:color='B7C3D6'/>`).join('');
  const table = actions.length
    ? `<w:tbl><w:tblPr><w:tblW w:w='9638' w:type='dxa'/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type='fixed'/></w:tblPr><w:tblGrid>${W.map((w) => `<w:gridCol w:w='${w}'/>`).join('')}</w:tblGrid>${row(['No', 'Action item', 'PIC', 'Deadline', 'Status'], true)}${actions.map((a, i) => row([String(i + 1), a.title || '-', a.owner || '-', a.deadline ? pt.fmtDate(a.deadline) : '-', a.status || 'To do'], false)).join('')}</w:tbl>${P('', {after: 0})}`
    : P(R('No action items yet.', {i: true}));
  const body = [
    P(R('MINUTES OF MEETING', {b: true, size: 10, color: '5A6D80'}), {after: 40}),
    P(R(m.title || 'Untitled', {b: true, size: 20}), {after: 160, border: true}),
    meta('Date', m.date ? pt.fmtDate(m.date) : '-'), meta('Client', m.client), meta('Note-taker', m.notulis), meta('Attendees', m.attendees),
    H('Agenda'), lines(m.agenda), H('Discussion'), lines(m.notes), H('Decisions'), lines(m.decisions), H('Action Items'), table,
    P(R(`Generated from PRCH Team Tracker, ${pt.fmtDate(pt.today())}`, {i: true, size: 9, color: '7A8B99'}), {before: 360})
  ].join('');
  const head = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>`;
  return pt.zip([
    {name: '[Content_Types].xml', text: `${head}<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'><Default Extension='rels' ContentType='application/vnd.openxmlformats-package.relationships+xml'/><Default Extension='xml' ContentType='application/xml'/><Override PartName='/word/document.xml' ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'/></Types>`},
    {name: '_rels/.rels', text: `${head}<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'><Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' Target='word/document.xml'/></Relationships>`},
    {name: 'word/document.xml', text: `${head}<w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'><w:body>${body}<w:sectPr><w:pgSz w:w='11906' w:h='16838'/><w:pgMar w:top='1134' w:right='1134' w:bottom='1134' w:left='1134' w:header='709' w:footer='709' w:gutter='0'/></w:sectPr></w:body></w:document>`}
  ]);
};
pt.momFilename = (m) => {
  const bad = [47, 92, 58, 42, 63, 34, 60, 62, 124];
  const t = [...String(m.title || 'MoM')].filter((ch) => !bad.includes(ch.charCodeAt(0))).join('').trim().slice(0, 80);
  return `MoM ${m.date || ''} ${t}.docx`.split('  ').join(' ');
};

dash.calc('momProgress', {
  title: 'Action item progress per MoM',
  description: 'Number of action items (tasks linked to a MoM) and how many are Done, per MoM.',
  inputs: ['mom', 'tasks'],
  fn: (mom, tasks) => mom.map((m) => {
    const a = tasks.filter((t) => t.momId === m.id);
    return {id: m.id, title: m.title, actions: a.length, done: a.filter((t) => t.status === 'Done').length};
  })
});

pt.momOpen = new Set();

dash.draw('momSelect', (sel) => {
  const ms = dash.data('mom'); const keep = sel.value;
  const rows = ms.status === 'ok' ? ms.data.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))) : [];
  sel.replaceChildren(new Option('Not linked to a MoM', ''), ...rows.map((m) => new Option(`${pt.shortDate(m.date)} · ${m.title || '(untitled)'}`, m.id)));
  sel.value = rows.some((m) => m.id === keep) ? keep : '';
});

dash.draw('momList', (el) => {
  const ms = dash.data('mom'); const ts = dash.data('tasks');
  el.classList.toggle('dash-skeleton', ms.status === 'loading');
  if (ms.status === 'loading') { el.replaceChildren(); return; }
  if (ms.status !== 'ok') { pt.note(el, ms.status === 'error' ? 'Could not load MoMs. Try reloading the page.' : '—'); return; }
  if (!ms.data.length) { pt.note(el, 'No MoMs yet. Click “＋ New MoM” above to record your first meeting.'); return; }
  const tasks = ts.status === 'ok' ? ts.data : [];
  const rows = ms.data.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  el.replaceChildren(...rows.map((m) => {
    const acts = tasks.filter((t) => t.momId === m.id).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    const done = acts.filter((t) => t.status === 'Done').length;
    const d = pt.el('details', 'pt-mom'); d.open = pt.momOpen.has(m.id);
    d.addEventListener('toggle', () => { if (d.open) pt.momOpen.add(m.id); else pt.momOpen.delete(m.id); });
    const s = pt.el('summary', 'pt-mom-sum');
    const okDate = typeof m.date === 'string' && m.date.length >= 10;
    const dt = pt.el('div', 'pt-mom-date');
    dt.append(pt.el('span', 'pt-mom-day', okDate ? String(+m.date.slice(8, 10)) : '–'), pt.el('span', 'pt-mom-mon', okDate ? `${pt.shortDate(m.date).split(' ')[1]} ${m.date.slice(2, 4)}` : ''));
    const main = pt.el('div', 'pt-mom-main');
    const peserta = String(m.attendees || '').split(',').map((x) => x.trim()).filter(Boolean).length;
    main.append(pt.el('span', 'pt-mom-title', m.title || '(untitled)'), pt.el('span', 'pt-meta', [m.client, m.notulis ? `Note-taker: ${m.notulis}` : '', peserta ? `${peserta} attendees` : ''].filter(Boolean).join(' · ')));
    const prog = pt.el('div', 'pt-mom-prog');
    const pl = pt.el('span', 'pt-meta');
    pl.append(pt.el('span', 'pt-strong', String(done)), document.createTextNode(' / '), pt.el('span', 'pt-strong', String(acts.length)), document.createTextNode(' actions done'));
    const bar = pt.el('div', 'pt-bar'); const fill = pt.el('span'); fill.style.width = `${acts.length ? Math.round(done / acts.length * 100) : 0}%`; bar.append(fill);
    prog.append(pl, bar);
    const mby = pt.byline(m); if (mby) main.append(mby);
    s.append(dt, main, prog);
    const body = pt.el('div', 'pt-mom-body');
    const grid = pt.el('div', 'pt-mom-grid');
    [['Attendees', m.attendees], ['Agenda', m.agenda], ['Discussion', m.notes], ['Decisions', m.decisions]].forEach(([h, v]) => { const b = pt.el('div', 'pt-mom-block'); b.append(pt.el('h3', '', h), pt.el('p', 'pt-pre', v || '—')); grid.append(b); });
    const ah = pt.el('div', 'pt-mom-block'); ah.append(pt.el('h3', '', 'Action items'));
    if (!acts.length) ah.append(pt.el('p', 'pt-meta', 'No action items yet. Add them from the Tasks tab and choose this MoM under “From MoM”.'));
    else {
      const ul = pt.el('ul', 'pt-list');
      acts.forEach((a) => {
        const li = pt.el('li', 'pt-li'); const b = pt.el('div', 'pt-li-body');
        b.append(pt.el('span', 'pt-li-title', a.title || '(untitled)'), pt.person(a.owner));
        li.append(pt.pill('status', a.status, 'Action item status', (nv) => pt.update('tasks', a.id, {status: nv})), b);
        const dl = pt.deadlineBadge(a); if (dl) li.append(dl);
        ul.append(li);
      });
      ah.append(ul);
    }
    const bar2 = pt.el('div', 'pt-mom-bar');
    const ex = pt.el('button', 'pt-btn', '⬇ Export to Word (.docx)'); ex.type = 'button';
    const msg = pt.el('span', 'pt-meta');
    ex.addEventListener('click', async () => {
      msg.textContent = '';
      const dl = await claude.use('downloads');
      if (!dl) { msg.textContent = 'Export is not available in this view.'; return; }
      try { await dl.save({filename: pt.momFilename(m), data: pt.momDocx(m, acts)}); }
      catch (e) { if (!e || e.code !== 'declined') msg.textContent = `Export failed${e && e.message ? `: ${e.message}` : ''}.`; }
    });
    bar2.append(ex, msg, pt.delBtn('mom', m.id));
    body.append(grid, ah, bar2);
    d.append(s, body);
    return d;
  }));
});
})();
