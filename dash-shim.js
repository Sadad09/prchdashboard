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
  const OWNER = String(CFG.admin || '').toLowerCase();
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
  let me = null;      // {type: 'admin'|'team'|'partner', name, agency?, email}
  const unsubs = [];

  const splitPath = (path) => { const i = path.lastIndexOf('/'); return [path.slice(0, i), path.slice(i + 1)]; };
  const label = (u) => (!u ? 'Unknown' : u.type === 'partner' ? `${u.name} (${u.agency})` : u.name);
  const isAdmin = () => !!me && me.type === 'admin';
  const isTeam = () => !!me && (me.type === 'team' || me.type === 'admin');
  window.ptWho = {get: () => me, label, isTeam, isAdmin};

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
    if (isAdmin()) { listen('members'); listen('requests'); }
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
    const sub = document.querySelector('.pt-me-sub'); if (sub) sub.textContent = me ? ({admin: 'Admin', team: 'PRCH team', partner: 'Partner'}[me.type] || '') : 'Not signed in';
    if ($('whoAvatar')) $('whoAvatar').textContent = me && me.name ? me.name.trim()[0].toUpperCase() : '•';
    document.querySelectorAll('[data-admin-only]').forEach((el) => { el.hidden = !isAdmin(); });
  };
  const errText = (e) => (e && (e.code || e.message)) || 'unknown error';
  const memberRef = (em) => fb.doc(fb.db, `members/${em}`);
  const requestRef = (em) => fb.doc(fb.db, `requests/${em}`);
  let authUser = null;

  function boot() {
    fb = window.fbApi;
    $('gateSignIn') && $('gateSignIn').addEventListener('click', async () => {
      gate('busy');
      try { await fb.signInWithPopup(fb.auth, new fb.GoogleAuthProvider()); }
      catch (e) { gate('signin', e && e.code === 'auth/popup-closed-by-user' ? '' : `Sign-in failed: ${errText(e)}`); }
    });
    document.querySelectorAll('[data-signout]').forEach((b) => b.addEventListener('click', () => fb.signOut(fb.auth)));

    // first sign-in of an accepted member: fill in name (and agency for partners)
    const pf = $('whoProfile');
    if (pf) pf.addEventListener('submit', async (e) => {
      e.preventDefault(); if (!me) return;
      const name = pf.elements.name.value.trim(); const agency = pf.elements.agency.value.trim();
      if (!name || (me.type === 'partner' && !agency)) return;
      try {
        const patch = me.type === 'partner' ? {name, agency} : {name};
        await fb.updateDoc(memberRef(me.email), patch); me = {...me, ...patch}; enter();
      } catch (err) { gate('profile', `Could not save: ${errText(err)}`); }
    });

    // not a member yet: ask the admin for access
    const rf = $('whoRequest');
    if (rf) {
      const sync = () => { rf.querySelector('[data-agency]').hidden = rf.elements.role.value !== 'partner'; };
      rf.elements.role.addEventListener('change', sync);
      sync();
      rf.addEventListener('submit', async (e) => {
        e.preventDefault(); if (!authUser) return;
        const email = String(authUser.email || '').toLowerCase();
        const role = rf.elements.role.value || 'team';
        const name = rf.elements.name.value.trim(); const agency = role === 'partner' ? rf.elements.agency.value.trim() : '';
        if (!name || (role === 'partner' && !agency)) return;
        try {
          await fb.setDoc(requestRef(email), {email, name, agency, role, at: new Date().toISOString()});
          gate('pending', `Request sent as ${role === 'partner' ? `${name} (${agency})` : name}. You'll get in once the admin accepts it. Reload this page later.`);
        } catch (err) { gate('request', `Could not send the request: ${errText(err)}`); }
      });
    }

    gate('busy');
    fb.onAuthStateChanged(fb.auth, async (user) => {
      authUser = user;
      stopSync(); me = null; Object.keys(cache).forEach((k) => delete cache[k]); Object.keys(state).forEach((k) => delete state[k]);
      showBadge(); changed();
      if (!user) { gate('signin', ''); return; }
      const email = String(user.email || '').toLowerCase();
      try {
        let snap = await fb.getDoc(memberRef(email));
        if (!snap.exists() && email === OWNER) {
          await fb.setDoc(memberRef(email), {role: 'admin', name: CFG.adminName || user.displayName || 'Admin', agency: '', addedBy: 'setup', addedAt: new Date().toISOString()});
          snap = await fb.getDoc(memberRef(email));
          me = {type: 'admin', name: snap.data().name, agency: '', email};
          addToPicList(snap.data().name).catch(() => {});
        }
        if (snap.exists()) {
          const m = snap.data();
          const type = email === OWNER ? 'admin' : (m.role || 'team');
          me = {type, name: m.name || '', agency: m.agency || '', email};
          if (!me.name || (type === 'partner' && !me.agency)) {
            pf.elements.name.value = me.name || user.displayName || ''; pf.elements.agency.value = me.agency || '';
            pf.querySelector('[data-agency]').hidden = type !== 'partner';
            gate('profile', `Welcome! You were added as ${type === 'partner' ? 'a partner' : 'a team member'}. Confirm your details.`); return;
          }
          enter(); return;
        }
        // not a member: show request form, or "pending" if already requested
        const req = await fb.getDoc(requestRef(email)).catch(() => null);
        if (req && req.exists()) { gate('pending', `${email}: your access request is waiting for the admin. Reload this page later.`); return; }
        if (rf) { rf.reset(); rf.elements.name.value = user.displayName || ''; rf.elements.role.dispatchEvent(new Event('change')); }
        gate('request', `${email} doesn't have access yet. Send a request to the admin.`);
      } catch (e) { gate('error', `Could not check your access: ${errText(e)}`); }
    });
  }
  function enter() { gate('none'); showBadge(); startSync(); changed(); }

  // ---------- admin: requests + members ----------
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const ROLE_LABEL = {admin: 'Admin', team: 'PRCH team', partner: 'Partner'};
  const addToPicList = async (name) => {
    if (!name) return;
    const exists = Object.values(cache[DATASETS.team] || {}).some((r) => String(r.name || '').toLowerCase() === name.toLowerCase());
    if (!exists) await db.collection(DATASETS.team).add({name, role: ''});
  };
  function setupAccessUI() {
    const f = $('memberForm');
    if (f) {
      const sync = () => { f.querySelector('[data-agency]').hidden = f.elements.role.value !== 'partner'; };
      f.elements.role.addEventListener('change', sync); sync();
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); if (!isAdmin()) return;
        const email = f.elements.email.value.trim().toLowerCase(); const role = f.elements.role.value;
        const name = f.elements.name.value.trim(); const agency = role === 'partner' ? f.elements.agency.value.trim() : '';
        if (!email || (role === 'partner' && !agency)) return;
        try {
          await fb.setDoc(memberRef(email), {role, name, agency, addedBy: label(me), addedAt: new Date().toISOString()});
          if (role !== 'partner') await addToPicList(name);
          f.reset(); sync();
        } catch (err) { alert(`Could not add member: ${errText(err)}`); }
      });
    }
    draws.set('requestList', (el) => {
      if (!isAdmin()) { el.replaceChildren(); return; }
      const rows = Object.entries(cache.requests || {}).sort((a, b) => String(a[1].at).localeCompare(String(b[1].at)));
      if (state.requests === 'error') { el.replaceChildren(mk('li', 'pt-empty', 'Could not load requests. Check the Firestore rules.')); return; }
      if (!rows.length) { el.replaceChildren(mk('li', 'pt-empty', 'No pending requests.')); return; }
      el.replaceChildren(...rows.map(([email, r]) => {
        const li = mk('li', 'pt-li'); const body = mk('div', 'pt-li-body');
        body.append(mk('span', 'pt-li-title', r.role === 'partner' ? `${r.name} (${r.agency})` : r.name),
          mk('span', 'pt-meta', `${email} · wants to join as ${ROLE_LABEL[r.role] || r.role}`));
        const acts = mk('div', 'pt-req-acts');
        const accept = mk('button', 'pt-btn', 'Accept'); accept.type = 'button';
        const reject = mk('button', 'pt-del', 'Reject'); reject.type = 'button';
        accept.addEventListener('click', async () => {
          accept.disabled = reject.disabled = true;
          try {
            await fb.setDoc(memberRef(email), {role: r.role === 'partner' ? 'partner' : 'team', name: r.name || '', agency: r.agency || '', addedBy: label(me), addedAt: new Date().toISOString()});
            await fb.deleteDoc(requestRef(email));
            if (r.role !== 'partner') await addToPicList(r.name);
          } catch (err) { accept.disabled = reject.disabled = false; alert(`Could not accept: ${errText(err)}`); }
        });
        reject.addEventListener('click', async () => {
          if (!reject.classList.contains('is-armed')) { reject.classList.add('is-armed'); reject.textContent = 'Sure?'; setTimeout(() => { reject.classList.remove('is-armed'); reject.textContent = 'Reject'; }, 3000); return; }
          reject.disabled = accept.disabled = true;
          try { await fb.deleteDoc(requestRef(email)); } catch (err) { reject.disabled = accept.disabled = false; alert(`Could not reject: ${errText(err)}`); }
        });
        acts.append(accept, reject); li.append(body, acts); return li;
      }));
    });
    draws.set('memberList', (el) => {
      if (!isAdmin()) { el.replaceChildren(); return; }
      if (state.members === 'error') { el.replaceChildren(mk('li', 'pt-empty', 'Could not load members. Check the Firestore rules.')); return; }
      const rows = Object.entries(cache.members || {}).sort((a, b) => (a[1].role || '').localeCompare(b[1].role || '') || a[0].localeCompare(b[0]));
      if (!rows.length) { el.replaceChildren(mk('li', 'pt-empty', 'No members yet.')); return; }
      el.replaceChildren(...rows.map(([email, m]) => {
        const li = mk('li', 'pt-li'); const body = mk('div', 'pt-li-body');
        const nm = m.name ? (m.role === 'partner' ? `${m.name} (${m.agency})` : m.name) : (m.role === 'partner' ? `(${m.agency})` : '(name not set yet)');
        body.append(mk('span', 'pt-li-title', nm), mk('span', 'pt-meta', `${email}${m.name ? '' : ' · has not signed in yet'}`));
        li.append(body);
        if (email === OWNER) { li.append(mk('span', 'pt-badge', 'Owner · admin')); return li; }
        const sel = mk('select', 'dash-select'); sel.setAttribute('aria-label', `Role of ${email}`);
        ['admin', 'team', 'partner'].forEach((r) => sel.add(new Option(ROLE_LABEL[r], r)));
        sel.value = m.role || 'team';
        sel.addEventListener('change', async () => {
          try { await fb.updateDoc(memberRef(email), {role: sel.value}); } catch (err) { alert(`Could not change role: ${errText(err)}`); }
        });
        const rm = mk('button', 'pt-del', 'Remove'); rm.type = 'button';
        rm.addEventListener('click', async () => {
          if (!rm.classList.contains('is-armed')) { rm.classList.add('is-armed'); rm.textContent = 'Sure?'; setTimeout(() => { rm.classList.remove('is-armed'); rm.textContent = 'Remove'; }, 3000); return; }
          rm.disabled = true;
          try { await fb.deleteDoc(memberRef(email)); } catch (err) { rm.disabled = false; alert(`Could not remove: ${errText(err)}`); }
        });
        li.append(sel, rm); return li;
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
