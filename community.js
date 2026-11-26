// PRCH Community tracker: events, sponsors & partners, coverage.
// Loaded after core.js and draw.js on community.html; reuses their helpers (pt.*) and the task/team/meeting views.
(() => {
  const pt = window.pt;
  pt.col = {
    events: 'data/prch/c_events', sponsors: 'data/prch/c_sponsors', coverage: 'data/prch/c_coverage',
    tasks: 'data/prch/c_tasks', team: 'data/prch/c_team', meetings: 'data/prch/c_meetings'
  };
  pt.TONES.event = [['Idea', 'muted'], ['Planning', 'blue'], ['Confirmed', 'warn'], ['Done', 'ok'], ['Cancelled', 'bad']];
  pt.TONES.sponsor = [['Prospect', 'muted'], ['Pitching', 'blue'], ['Negotiation', 'warn'], ['Confirmed', 'ok'], ['Declined', 'bad']];
  pt.TONES.ptype = [['Sponsor', 'blue'], ['Media partner', 'warn'], ['Community partner', 'ok'], ['Venue', 'muted'], ['Speaker', 'pend']];
  pt.TONES.format = [['Offline', 'blue'], ['Online', 'ok'], ['Hybrid', 'warn']];

  const num = (v) => (v === '' || v == null || !isFinite(+v) ? 0 : +v);
  const todayIso = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
  const isLive = (e) => e.status !== 'Done' && e.status !== 'Cancelled';

  dash.calc('ckpi', {
    title: 'Community summary',
    description: 'Upcoming events, attendees at events done this year, confirmed sponsorship, open tasks and coverage.',
    inputs: ['events', 'sponsors', 'tasks', 'coverage', 'team'],
    fn: (events, sponsors, tasks, coverage, team) => {
      const today = todayIso(); const year = today.slice(0, 4);
      const up = events.filter((e) => isLive(e) && (e.date || '') >= today).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const done = events.filter((e) => e.status === 'Done' && String(e.date || '').startsWith(year));
      const conf = sponsors.filter((s) => s.stage === 'Confirmed');
      const open = tasks.filter((t) => t.status !== 'Done');
      return [{
        upcoming: up.length,
        nextLabel: up[0] ? `${up[0].name || '(untitled)'} · ${pt.shortDate(up[0].date)}` : 'nothing scheduled',
        attendees: done.reduce((s, e) => s + num(e.actual), 0),
        eventsDone: done.length,
        eventsActive: events.filter(isLive).length,
        sponsorValue: conf.reduce((s, x) => s + num(x.value), 0),
        sponsorsConfirmed: conf.length,
        sponsorsActive: sponsors.filter((s) => !['Confirmed', 'Declined'].includes(s.stage)).length,
        openTasks: open.length,
        overdue: open.filter((t) => t.deadline && t.deadline < today).length,
        coverageCount: coverage.length,
        teamCount: team.length
      }];
    }
  });

  dash.calc('eventStages', {
    title: 'Events by status', description: 'Number of events at each status.', inputs: ['events'],
    fn: (events) => pt.opts('event').map((status) => ({status, count: events.filter((e) => (e.status || 'Idea') === status).length}))
  });

  // numbers in sentences and KPI cards
  dash.draw('ckpi', (el) => {
    const k = dash.data('ckpi');
    const row = k.status === 'ok' && Array.isArray(k.data) ? k.data[0] : null;
    el.classList.toggle('dash-skeleton', k.status === 'loading');
    if (!row) { el.textContent = '—'; return; }
    const v = row[el.getAttribute('data-field')];
    el.textContent = el.getAttribute('data-fmt') === 'rp' ? pt.rupiah(v) : String(v ?? '—');
  });

  // event names for the "Event" fields
  dash.draw('clientList', (dl) => {
    const e = dash.data('events');
    const names = e.status === 'ok' ? [...new Set(e.data.map((r) => r.name).filter(Boolean))].sort((a, b) => a.localeCompare(b)) : [];
    dl.replaceChildren(...names.map((n) => new Option(n)));
  });

  const dateLine = (r) => [r.date ? pt.fmtDate(r.date) : 'Date TBC', r.time].filter(Boolean).join(' · ');
  const attendees = (r) => {
    const a = num(r.actual); const t = num(r.target);
    if (a && t) return `👥 ${a} / ${t} target`;
    if (a) return `👥 ${a} attended`;
    if (t) return `👥 target ${t}`;
    return '';
  };
  const safeLink = (u, text, cls) => {
    const s = typeof u === 'string' ? u.trim() : '';
    if (!(s.startsWith('https://') || s.startsWith('http://'))) return null;
    const a = pt.el('a', cls || 'pt-meta', text); a.href = s; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
  };

  // ----- Events -----
  dash.draw('eventBoard', (el) => {
    pt.board(el, 'events', {
      field: 'status', tone: 'event', deletable: true,
      sort: (a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')),
      emptyCol: 'No events here.',
      card: (r) => {
        const top = pt.el('div', 'pt-kcard-top'); top.append(pt.tag('format', r.format || 'Offline'));
        const d = pt.el('span', 'pt-badge' + (r.date && r.date === todayIso() ? ' is-soon' : ''), r.date ? `📅 ${pt.shortDate(r.date)}${r.time ? ` · ${r.time}` : ''}` : 'Date TBC');
        top.append(d);
        const out = [top, pt.el('div', 'pt-kcard-title', r.name || '(untitled)')];
        if (r.venue) out.push(pt.el('span', 'pt-meta', `📍 ${r.venue}`));
        const at = attendees(r); if (at) out.push(pt.el('span', 'pt-meta', at));
        if (num(r.budget)) out.push(pt.el('span', 'pt-meta', `💰 Budget ${pt.rupiah(r.budget)}`));
        if (r.notes) out.push(pt.el('span', 'pt-meta pt-note', `📝 ${r.notes}`));
        const rc = safeLink(r.recap, '🎬 Recap ↗', 'pt-file'); if (rc) out.push(rc);
        return out;
      },
      foot: (r) => pt.person(r.pic)
    });
  });
  dash.draw('eventBody', (el) => {
    const ST = pt.opts('event');
    pt.table(el, 'events', [
      {key: 'name'}, {key: 'date', fmt: (v, r) => dateLine(r), cls: () => 'pt-nowrap'},
      {key: 'status', label: 'Status', pill: 'event'}, {key: 'format', chip: true}, {key: 'venue'},
      {key: 'actual', fmt: (v, r) => attendees(r).replace('👥 ', '') || '—'},
      {key: 'budget', num: true, fmt: (v) => (num(v) ? pt.rupiah(v) : '—')},
      {key: 'pic', person: true}, {key: 'recap', link: true, linkText: () => '🎬 Recap'}
    ], {
      sort: (a, b) => ST.indexOf(a.status) - ST.indexOf(b.status) || String(a.date || '9999').localeCompare(String(b.date || '9999')),
      empty: 'No events yet. Click “＋ Add event” above.'
    });
  });
  dash.draw('eventNext', (el) => {
    const e = dash.data('events');
    if (e.status !== 'ok') { el.replaceChildren(pt.el('li', 'pt-empty', e.status === 'loading' ? 'Loading…' : '—')); return; }
    const today = todayIso();
    const rows = e.data.filter((r) => isLive(r) && (r.date || '') >= today).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 5);
    if (!rows.length) { el.replaceChildren(pt.el('li', 'pt-empty', 'No upcoming events. Add one in the Events tab.')); return; }
    el.replaceChildren(...rows.map((r) => {
      const li = pt.el('li', 'pt-li');
      const dt = pt.el('div', 'pt-mom-date');
      dt.append(pt.el('span', 'pt-mom-day', String(+r.date.slice(8, 10))), pt.el('span', 'pt-mom-mon', pt.shortDate(r.date).split(' ')[1]));
      const body = pt.el('div', 'pt-li-body');
      body.append(pt.el('span', 'pt-li-title', r.name || '(untitled)'), pt.el('span', 'pt-meta', [r.time, r.venue, attendees(r).replace('👥 ', '')].filter(Boolean).join(' · ')));
      li.append(dt, body, pt.tag('event', r.status || 'Idea'));
      return li;
    }));
  });
  dash.draw('eventChart', (el) => {
    const p = dash.data('eventStages');
    el.classList.toggle('dash-skeleton', p.status === 'loading');
    if (p.status !== 'ok' || !Array.isArray(p.data)) { if (p.status !== 'loading') pt.note(el, '—'); else el.replaceChildren(); return; }
    if (!p.data.some((d) => d.count > 0)) { pt.note(el, 'No events yet. Add your first event in the Events tab.'); return; }
    pt.hbar(el, p.data, {
      label: 'status', value: 'count', colorEach: true, aria: 'Bar chart of events per status',
      valueText: (d) => `${d.count} event${d.count === 1 ? '' : 's'}`, tip: (d) => `${d.status}\n${d.count} events`
    });
  });

  // ----- Sponsors & partners -----
  dash.draw('sponsorBoard', (el) => {
    pt.board(el, 'sponsors', {
      field: 'stage', tone: 'sponsor', deletable: true,
      sort: (a, b) => num(b.value) - num(a.value),
      headExtra: (rows) => pt.rupiahShort(rows.reduce((s, r) => s + num(r.value), 0)),
      emptyCol: 'Nothing at this stage.',
      card: (r) => {
        const top = pt.el('div', 'pt-kcard-top'); top.append(pt.tag('ptype', r.type || 'Sponsor'));
        const out = [top, pt.el('div', 'pt-kcard-title', r.name || '(unnamed)')];
        if (num(r.value)) out.push(pt.el('div', 'pt-kcard-value', pt.rupiah(r.value)));
        if (r.event) out.push(pt.el('span', 'pt-chip', `🎪 ${r.event}`));
        if (r.contact) out.push(pt.el('span', 'pt-meta', `☎ ${r.contact}`));
        if (r.notes) out.push(pt.el('span', 'pt-meta pt-note', `📝 ${r.notes}`));
        return out;
      },
      foot: (r) => pt.person(r.pic)
    });
  });
  dash.draw('sponsorBody', (el) => {
    const ST = pt.opts('sponsor');
    pt.table(el, 'sponsors', [
      {key: 'name', fmt: (v, r) => (r.notes ? `${v || '(unnamed)'} — ${r.notes}` : (v || '—'))},
      {key: 'type', chip: true}, {key: 'event', chip: true},
      {key: 'stage', label: 'Stage', pill: 'sponsor'},
      {key: 'value', num: true, fmt: (v) => (num(v) ? pt.rupiah(v) : '—')},
      {key: 'contact'}, {key: 'pic', person: true}
    ], {
      sort: (a, b) => ST.indexOf(a.stage) - ST.indexOf(b.stage) || num(b.value) - num(a.value),
      empty: 'No sponsors or partners yet. Click “＋ Add sponsor / partner” above.'
    });
  });

  // ----- Coverage -----
  dash.draw('coverageBody', (el) => {
    pt.table(el, 'coverage', [
      {key: 'title'}, {key: 'event', chip: true}, {key: 'media'}, {key: 'channel', chip: true},
      {key: 'date', fmt: (v) => pt.fmtDate(v), cls: () => 'pt-nowrap'},
      {key: 'sentiment', label: 'Sentiment', pill: 'sentiment'},
      {key: 'link', link: true, linkText: () => '🔗 Open'}
    ], {
      sort: (a, b) => String(b.date || '').localeCompare(String(a.date || '')),
      empty: 'No coverage yet. Click “＋ Add coverage” above.'
    });
  });
})();
