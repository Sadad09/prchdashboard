/*
 * dash-shim.js
 * Data layer + page runtime for the PRCH Team Tracker.
 * Data lives in Firebase Firestore (shared, live for everyone); people sign in with Google.
 *  - Core team: emails listed in firebase-config.js (and in firestore.rules).
 *  - Partners: emails a team member adds under Team → Partner access.
 * The rest of the app only talks to claude.use('db') and dash.data(), so the UI code is unchanged.
 */
(() => {
  const CFG = window.PRCH_CONFIG || {firebase: {}, team: {}};
  const TEAM = Object.fromEntries(Object.entries(CFG.team || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const DATASETS = {
    tasks: 'data/prch/tasks',
    team: 'data/prch/team',
    pipeline: 'data/prch/pipeline',
    collaterals: 'data/prch/collaterals',
    mom: 'data/prch/mom',
    meetings: 'data/prch/meetings',
    activity: 'data/prch/activity'
  };
  const SYNCED = Object.values(DATASETS);

  // ---------- live cache filled by Firestore listeners ----------
  const cache = {};   // col -> {id: row}
  const state = {};   // col -> 'loading' | 'ok' | 'error'
  const errors = {};
  let fb = null;      // window.fbApi once loaded
  let me = null;      // {type: 'team'|'partner', name, agency?, email}
  const unsubs = [];

  const splitPath = (path) => { const i = path.lastIndexOf('/'); return [path.slice(0, i), path.slice(i + 1)]; };
  const label = (u) => (!u ? 'Unknown' : u.type === 'partner' ? `${u.name} (${u.agency})` : u.name);
  const isTeam = () => !!me && me.type === 'team';
  window.ptWho = {get: () => me, label, isTeam};

  const listen = (col, q) => {
    state[col] = 'loading';
    const ref = q || fb.collection(fb.db, col);
    unsubs.push(fb.onSnapshot(ref, (snap) => {
      const all = {}; snap.forEach((d) => { all[d.id] = d.data(); });
      cache[col] = all; state[col] = 'ok'; changed();
    }, (err) => { state[col] = 'error'; errors[col] = err; console.error(col, err); changed(); }));
  };
  const startSync = () => {
    SYNCED.forEach((col) => {
      if (col === DATASETS.activity) listen(col, fb.query(fb.collection(fb.db, col), fb.orderBy('at', 'desc'), fb.limit(60)));
      else listen(col);
    });
    if (isTeam()) listen('access');
  };
  const stopSync = () => { unsubs.splice(0).forEach((u) => { try { u(); } catch (e) { /* ignore */ } }); };

  // ---------- change stamps + activity log ----------
  const KIND = {'data/prch/tasks': 'task', 'data/prch/team': 'team member', 'data/prch/pipeline': 'prospect',
    'data/prch/collaterals': 'document', 'data/prch/mom': 'MoM', 'data/prch/meetings': 'meeting'};
  const titleOf = (r) => (r && (r.title || r.name || r.client)) || '(untitled)';
  const LABELS = {status: 'status', stage: 'stage', priority: 'priority', owner: 'PIC', pic: 'PIC', deadline: 'deadline',
    value: 'value', engagement: 'engagement', notes: 'notes', contract: 'PRCH role'};
  const stamp = () => ({updatedBy: label(me), updatedByEmail: me ? me.email : '', updatedAt: new Date().toISOString()});
  const logActivity = (col, action, row, detail) => {
    if (!KIND[col]) return Promise.resolve();
    return fb.addDoc(fb.collection(fb.db, DATASETS.activity), {
      at: new Date().toISOString(), by: label(me), action, kind: KIND[col], title: titleOf(row), detail: detail || ''
    }).catch((e) => console.warn('activity log', e));
  };
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([k, v]) => k !== 'id' && v !== undefined));

  const db = {
    collection(col) {
      return {
        async add(data) {
          const s = stamp(); const row = clean({...data, createdBy: s.updatedBy, ...s});
          const ref = await fb.addDoc(fb.collection(fb.db, col), row);
          logActivity(col, 'added', row); return {id: ref.id};
        }
      };
    },
    doc(path) {
      const [col] = splitPath(path);
      const ref = () => fb.doc(fb.db, path);
      return {
        async set(data) {
          const [, id] = splitPath(path); const isNew = !(cache[col] && cache[col][id]);
          const s = stamp(); const row = clean({...data, ...(isNew ? {createdBy: s.updatedBy} : {}), ...s});
          await fb.setDoc(ref(), row); logActivity(col, isNew ? 'added' : 'updated', row);
        },
        async update(patch) {
          const [, id] = splitPath(path); const before = (cache[col] && cache[col][id]) || {};
          await fb.updateDoc(ref(), clean({...patch, ...stamp()}));
          const detail = Object.keys(patch).filter((k) => before[k] !== patch[k]).map((k) => {
            const lab = LABELS[k] || k; const v = patch[k];
            return (typeof v === 'string' && v.length < 40) ? `${lab} → ${v}` : lab;
          }).join(', ');
          logActivity(col, 'updated', {...before, ...patch}, detail);
        },
        async delete() {
          const [, id] = splitPath(path); const before = (cache[col] && cache[col][id]) || {};
          await fb.deleteDoc(ref()); logActivity(col, 'deleted', before);
        }
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
  window.claude = { use: async (name) => (name === 'db' ? (fb && me ? db : null) : name === 'downloads' ? downloads : null) };

  // ---------- dash API ----------
  const draws = new Map();
  const calcs = new Map();
  const listeners = [];
  const statusOf = (id) => {
    if (DATASETS[id]) return state[DATASETS[id]] || 'loading';
    if (calcs.has(id)) {
      const st = calcs.get(id).inputs.map(statusOf);
      return st.includes('error') ? 'error' : st.includes('loading') ? 'loading' : 'ok';
    }
    return 'missing';
  };
  const rowsOf = (id) => {
    if (DATASETS[id]) return Object.entries(cache[DATASETS[id]] || {}).map(([k, v]) => ({...v, id: k}));
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
      const status = statusOf(id);
      if (status === 'missing') return {status, data: [], meta: {}};
      if (status !== 'ok') return {status, data: calcs.has(id) ? null : [], message: status === 'error' ? 'Could not load data.' : '', meta: {}};
      try {
        const data = rowsOf(id);
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
      setupDataTools();
      setupAccessUI();
      if (window.fbApi) boot(); else {
        window.addEventListener('fb-ready', boot, {once: true});
        setTimeout(() => { if (!fb) gate('error', 'Could not load Firebase. Check your internet connection and reload the page.'); }, 20000);
      }
    }
  };

  // ---------- sign-in gate ----------
  const $ = (id) => document.getElementById(id);
  function gate(view, msg) {
    const g = $('whoGate'); if (!g) return;
    g.hidden = view === 'none';
    g.querySelectorAll('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== view; });
    if (msg != null && $('gateMsg')) $('gateMsg').textContent = msg;
  }
  const showBadge = () => {
    if ($('whoBadge')) $('whoBadge').textContent = me ? label(me) : '—';
    document.querySelectorAll('[data-team-only]').forEach((el) => { el.hidden = !isTeam(); });
  };

  function boot() {
    fb = window.fbApi;
    $('gateSignIn') && $('gateSignIn').addEventListener('click', async () => {
      gate('busy');
      try { await fb.signInWithPopup(fb.auth, new fb.GoogleAuthProvider()); }
      catch (e) { gate('signin', e && e.code === 'auth/popup-closed-by-user' ? '' : `Sign-in failed: ${e.code || e.message}`); }
    });
    document.querySelectorAll('[data-signout]').forEach((b) => b.addEventListener('click', () => fb.signOut(fb.auth)));
    const pf = $('whoPartner');
    if (pf) pf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = pf.elements.name.value.trim(); const agency = pf.elements.agency.value.trim();
      if (!name || !agency || !me) return;
      try {
        await fb.updateDoc(fb.doc(fb.db, `access/${me.email}`), {name, agency});
        me = {...me, name, agency}; enter();
      } catch (err) { gate('partner', `Could not save: ${err.code || err.message}`); }
    });

    gate('busy');
    fb.onAuthStateChanged(fb.auth, async (user) => {
      stopSync(); me = null; Object.keys(cache).forEach((k) => delete cache[k]); Object.keys(state).forEach((k) => delete state[k]);
      showBadge(); changed();
      if (!user) { gate('signin', ''); return; }
      const email = String(user.email || '').toLowerCase();
      if (TEAM[email]) { me = {type: 'team', name: TEAM[email], email}; enter(); return; }
      try {
        const snap = await fb.getDoc(fb.doc(fb.db, `access/${email}`));
        if (!snap.exists()) { gate('denied', `${email} doesn't have access yet. Ask the PRCH team to add you under Team → Partner access.`); return; }
        const a = snap.data();
        me = {type: 'partner', name: a.name || '', agency: a.agency || '', email};
        if (!a.name || !a.agency) {
          const pf2 = $('whoPartner'); if (pf2) { pf2.elements.agency.value = a.agency || ''; pf2.elements.name.value = a.name || (user.displayName || ''); }
          gate('partner', ''); return;
        }
        enter();
      } catch (e) { gate('denied', `${email} doesn't have access yet. Ask the PRCH team to add you under Team → Partner access.`); }
    });
  }
  function enter() { gate('none'); showBadge(); startSync(); changed(); }

  // ---------- partner access (team only) ----------
  function setupAccessUI() {
    const f = $('accessForm');
    if (f) f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = f.elements.email.value.trim().toLowerCase(); const agency = f.elements.agency.value.trim();
      if (!email || !agency || !isTeam()) return;
      try { await fb.setDoc(fb.doc(fb.db, `access/${email}`), {agency, name: '', addedBy: label(me), addedAt: new Date().toISOString()}); f.reset(); }
      catch (err) { alert(`Could not add partner: ${err.code || err.message}`); }
    });
    draws.set('accessList', (el) => {
      if (!isTeam()) { el.replaceChildren(); return; }
      const rows = Object.entries(cache.access || {}).sort((a, b) => a[0].localeCompare(b[0]));
      const li = (text) => { const x = document.createElement('li'); x.className = 'pt-empty'; x.textContent = text; return x; };
      if (state.access === 'error') { el.replaceChildren(li('Could not load partner access. Check the Firestore rules.')); return; }
      if (!rows.length) { el.replaceChildren(li('No partners yet.')); return; }
      el.replaceChildren(...rows.map(([email, a]) => {
        const x = document.createElement('li'); x.className = 'pt-li';
        const body = document.createElement('div'); body.className = 'pt-li-body';
        const t = document.createElement('span'); t.className = 'pt-li-title'; t.textContent = a.name ? `${a.name} (${a.agency})` : a.agency;
        const m = document.createElement('span'); m.className = 'pt-meta'; m.textContent = `${email}${a.name ? '' : ' · has not signed in yet'}`;
        body.append(t, m);
        const b = document.createElement('button'); b.type = 'button'; b.className = 'pt-del'; b.textContent = 'Remove';
        let armed = null;
        b.addEventListener('click', async () => {
          if (!armed) { b.textContent = 'Sure?'; b.classList.add('is-armed'); armed = setTimeout(() => { armed = null; b.textContent = 'Remove'; b.classList.remove('is-armed'); }, 3000); return; }
          clearTimeout(armed); b.disabled = true;
          try { await fb.deleteDoc(fb.doc(fb.db, `access/${email}`)); } catch (err) { b.disabled = false; alert(`Could not remove: ${err.code || err.message}`); }
        });
        x.append(body, b); return x;
      }));
    });
  }

  // ---------- backup / restore ----------
  function setupDataTools() {
    const exp = $('dataExport');
    const imp = $('dataImport');
    if (exp) exp.addEventListener('click', () => {
      const out = {version: 1, exportedAt: new Date().toISOString(), collections: {}};
      SYNCED.forEach((col) => { out.collections[col] = cache[col] || {}; });
      const d = new Date(); const stampDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      downloads.save({filename: `prch-tracker-backup-${stampDate}.json`, data: new Blob([JSON.stringify(out, null, 2)], {type: 'application/json'})});
    });
    if (imp) imp.addEventListener('change', async () => {
      const file = imp.files && imp.files[0]; if (!file) return;
      try {
        if (!fb || !me) throw new Error('Sign in first.');
        const json = JSON.parse(await file.text());
        const cols = json && json.collections; if (!cols || typeof cols !== 'object') throw new Error('Not a PRCH Tracker backup file.');
        let n = 0; let batch = fb.writeBatch(fb.db);
        for (const col of SYNCED) {
          if (col === DATASETS.activity || !cols[col] || typeof cols[col] !== 'object') continue;
          for (const [id, row] of Object.entries(cols[col])) {
            batch.set(fb.doc(fb.db, `${col}/${id}`), clean(row)); n += 1;
            if (n % 400 === 0) { await batch.commit(); batch = fb.writeBatch(fb.db); }
          }
        }
        await batch.commit();
        alert(`Imported ${n} items.`);
      } catch (e) { alert(`Import failed: ${e.message}`); }
      imp.value = '';
    });
  }
})();
