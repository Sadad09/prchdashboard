/*
 * dash-shim.js
 * Small stand-in for the hosted dashboard runtime, so the PRCH Team Tracker runs as a plain static site
 * (GitHub Pages, Netlify, or just opening index.html).
 *
 * Data is kept in the browser's localStorage. Each browser/device has its own copy.
 * Use "Export data" / "Import data" in the page to back up or move data between devices.
 * To share one live dataset across the team, swap the `store` object below for a real backend
 * (Firebase, Supabase, etc.) — the rest of the code only talks to `claude.use('db')`.
 */
(() => {
  const PREFIX = 'prch-tracker:';
  const DATASETS = {
    tasks: 'data/prch/tasks',
    team: 'data/prch/team',
    pipeline: 'data/prch/pipeline',
    collaterals: 'data/prch/collaterals',
    mom: 'data/prch/mom'
  };

  // ---------- storage ----------
  const store = {
    read(col) {
      try { return JSON.parse(localStorage.getItem(PREFIX + col) || '{}') || {}; } catch (e) { return {}; }
    },
    write(col, obj) { localStorage.setItem(PREFIX + col, JSON.stringify(obj)); }
  };
  const splitPath = (path) => { const i = path.lastIndexOf('/'); return [path.slice(0, i), path.slice(i + 1)]; };
  const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  const db = {
    collection(col) {
      return {
        async add(data) { const all = store.read(col); const id = newId(); all[id] = {...data}; store.write(col, all); changed(); return {id}; }
      };
    },
    doc(path) {
      const [col, id] = splitPath(path);
      return {
        async set(data) { const all = store.read(col); all[id] = {...data}; store.write(col, all); changed(); },
        async update(patch) { const all = store.read(col); all[id] = {...(all[id] || {}), ...patch}; store.write(col, all); changed(); },
        async delete() { const all = store.read(col); delete all[id]; store.write(col, all); changed(); }
      };
    }
  };

  const downloads = {
    async save({filename, data}) {
      const blob = data instanceof Blob ? data : new Blob([data], {type: 'application/octet-stream'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename || 'download';
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  window.claude = { use: async (name) => (name === 'db' ? db : name === 'downloads' ? downloads : null) };

  // ---------- dash API ----------
  const draws = new Map();
  const calcs = new Map();
  const listeners = [];

  const rowsOf = (id) => {
    if (DATASETS[id]) return Object.entries(store.read(DATASETS[id])).map(([k, v]) => ({...v, id: k}));
    if (calcs.has(id)) { const c = calcs.get(id); return c.fn(...c.inputs.map(rowsOf)); }
    return null;
  };

  const runDraw = (name) => {
    const fn = draws.get(name); if (!fn) return;
    document.querySelectorAll(`[data-draw="${name}"]`).forEach((el) => {
      try { fn(el); } catch (e) { console.error(`draw "${name}" failed`, e); }
    });
  };
  const renderAll = () => {
    draws.forEach((_, name) => runDraw(name));
    listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  };
  let queued = false;
  const changed = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; renderAll(); }); };

  window.dash = {
    colors: ['#0029A8', '#2F5BEA', '#E8503A', '#1F8A5B', '#B7791F', '#7C3AED', '#0E7490', '#BE185D'],
    data(id) {
      try {
        const rows = rowsOf(id);
        if (rows == null) return {status: 'missing', data: [], meta: {}};
        const data = Array.isArray(rows) ? rows : rows;
        return {status: 'ok', data, columns: Array.isArray(data) && data[0] ? Object.keys(data[0]) : [], refreshing: false, truncated: false, meta: {}};
      } catch (e) { console.error(e); return {status: 'error', data: [], message: String(e)}; }
    },
    draw(name, fn) { if (typeof fn === 'function') draws.set(name, fn); else runDraw(name); },
    calc(id, def) { calcs.set(id, def); },
    loader() {},
    onData(fn) { listeners.push(fn); },
    refresh() { changed(); },
    setLink(id) { try { history.replaceState(null, '', `#${id}`); } catch (e) { /* ignore */ } changed(); }, // redraw: charts need a visible width
    params: () => ({}), setParams() {}, resetParams() {},
    __start() {
      renderAll();
      let w = window.innerWidth;
      window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - w) > 20) { w = window.innerWidth; changed(); } });
      // keep tabs in sync when another tab of the same browser edits data
      window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith(PREFIX)) changed(); });
      setupDataTools();
    }
  };

  // ---------- backup / restore ----------
  function setupDataTools() {
    const exp = document.getElementById('dataExport');
    const imp = document.getElementById('dataImport');
    if (exp) exp.addEventListener('click', () => {
      const out = {version: 1, exportedAt: new Date().toISOString(), collections: {}};
      Object.values(DATASETS).forEach((col) => { out.collections[col] = store.read(col); });
      const d = new Date(); const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      downloads.save({filename: `prch-tracker-backup-${stamp}.json`, data: new Blob([JSON.stringify(out, null, 2)], {type: 'application/json'})});
    });
    if (imp) imp.addEventListener('change', async () => {
      const f = imp.files && imp.files[0]; if (!f) return;
      try {
        const json = JSON.parse(await f.text());
        const cols = json && json.collections; if (!cols || typeof cols !== 'object') throw new Error('Not a PRCH Tracker backup file.');
        Object.values(DATASETS).forEach((col) => { if (cols[col] && typeof cols[col] === 'object') store.write(col, cols[col]); });
        changed();
        alert('Data imported.');
      } catch (e) { alert(`Import failed: ${e.message}`); }
      imp.value = '';
    });
  }
})();
