/* Dispute Console prototype — shared shell and page behaviour.
   Vanilla JS, no build step, no network calls. Loaded as an external file so the
   pages keep the console's CSP rule of no inline scripts (NFR-5 AC 5). */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ data */
  const NOW_LABEL = 'Wed Oct 28, 2026 · 09:30 ET';
  const ROLES = {
    analyst: { user: 'analyst1', label: 'Analyst', initials: 'A1' },
    supervisor: { user: 'supervisor1', label: 'Supervisor', initials: 'S1' },
    auditor: { user: 'auditor1', label: 'Compliance Auditor', initials: 'CA' },
    admin: { user: 'admin1', label: 'Admin', initials: 'AD' },
  };
  const CASES = [
    { ref: 'DSP-2026-000398', regime: 'Reg E', net: 'Mastercard', cat: 'Non-receipt', rc: '4855', amt: 219.40, due: 'Thu Oct 29 · 17:00', left: '1 BD', clock: 'at_risk', pct: 90, status: 'awaiting_approval', who: 'analyst2', channel: 'Portal' },
    { ref: 'DSP-2026-000366', regime: 'Reg Z', net: 'Mastercard', cat: 'Not as described', rc: '4853', amt: 310.00, due: 'Fri Oct 30 · ack', left: '2 days', clock: 'at_risk', pct: 93, status: 'awaiting_approval', who: 'analyst1', channel: 'IVR' },
    { ref: 'DSP-2026-000401', regime: 'Reg E', net: 'Visa', cat: 'Duplicate', rc: '12.6', amt: 38.20, due: 'Fri Oct 30 · 17:00', left: '2 BD', clock: 'at_risk', pct: 80, status: 'needs_manual_completion', who: '', channel: 'Portal' },
    { ref: 'DSP-2026-000355', regime: 'Reg E', net: 'Mastercard', cat: 'Not as described', rc: '4853', amt: 129.00, due: 'Mon Nov 2 · network', left: '3 days', clock: 'network_critical', pct: 85, status: 'awaiting_approval', who: 'analyst1', channel: 'REST API' },
    { ref: 'DSP-2026-000412', regime: 'Reg E', net: 'Visa', cat: 'Fraud', rc: '10.4', amt: 842.17, due: 'Tue Nov 3 · 17:00', left: '4 BD', clock: 'open', pct: 60, status: 'awaiting_approval', who: 'supervisor1', channel: 'REST API' },
    { ref: 'DSP-2026-000377', regime: 'Reg Z', net: 'Visa', cat: 'Credit not processed', rc: '13.6', amt: 64.99, due: 'Sun Nov 1 · ack', left: '4 days', clock: 'open', pct: 86, status: 'awaiting_approval', who: 'analyst1', channel: 'Console' },
    { ref: 'DSP-2026-000312', regime: 'Reg E', net: 'Visa', cat: 'Fraud', rc: '10.4', amt: 57.80, due: 'Fri Nov 6 · response', left: '9 days', clock: 'open', pct: 45, status: 'representment_review', who: 'analyst2', channel: 'REST API' },
    { ref: 'DSP-2026-000431', regime: 'Reg E', net: 'Visa', cat: 'Duplicate', rc: '12.6', amt: 49.00, due: 'Thu Nov 12 · 17:00', left: '10 BD', clock: 'open', pct: 2, status: 'triaged', who: '', channel: 'Chat' },
    { ref: 'DSP-2026-000340', regime: 'Reg Z', net: 'Mastercard', cat: 'Fraud', rc: '4837', amt: 1310.55, due: 'Mon Dec 14 · resolve', left: '47 days', clock: 'open', pct: 30, status: 'awaiting_network', who: 'supervisor2', channel: 'REST API' },
    { ref: 'DSP-2026-000299', regime: 'Reg E', net: 'Mastercard', cat: 'Credit not processed', rc: '4860', amt: 450.00, due: 'Thu Nov 12 · manual', left: '10 BD', clock: 'manual', pct: 55, status: 'manual_prearb', who: 'supervisor1', channel: 'Portal' },
  ];
  const PAGES = [
    { id: 'queue', href: 'queue.html', label: 'Cases', icon: 'cases', roles: 'all', count: '1,284', hot: false },
    { id: 'inbox', href: 'inbox.html', label: 'Approvals', icon: 'check', roles: 'analyst supervisor', count: '5', hot: true },
    { id: 'dashboard', href: 'dashboard.html', label: 'SLA dashboard', icon: 'chart', roles: 'all' },
    { id: 'intake', href: 'intake.html', label: 'New dispute', icon: 'plus', roles: 'analyst supervisor' },
    { group: 'Governance' },
    { id: 'audit', href: 'audit.html', label: 'Audit trail', icon: 'shield', roles: 'supervisor auditor admin' },
    { id: 'admin', href: 'admin.html', label: 'Configuration', icon: 'sliders', roles: 'auditor admin' },
    { group: 'Cardholder side' },
    { id: 'chat', href: 'chat.html', label: 'Portal chat demo', icon: 'chat', roles: 'all', ext: true },
  ];

  /* ----------------------------------------------------------------- utils */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const store = {
    get(k, d) { try { const v = localStorage.getItem('dca.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('dca.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const ICONS = {
    cases: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16 9.5"/>',
    chart: '<path d="M4 20V11M10 20V5M16 20v-6M2 20h20"/>',
    plus: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>',
    shield: '<path d="M12 3l7.5 3v6c0 4.6-3.2 7.7-7.5 9-4.3-1.3-7.5-4.4-7.5-9V6z"/><path d="M9 12l2 2 4-4"/>',
    sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    chat: '<path d="M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 20.5l1-4.5A8.5 8.5 0 1 1 20.5 12z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    send: '<path d="M5 12l14-7-5 15-2.5-6.5z"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    keys: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  };
  const icon = (n) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[n] + '</svg>';

  /* ----------------------------------------------------------------- state */
  const state = {
    role: store.get('role', 'supervisor'),
    auto: store.get('auto', false),
  };
  const me = () => ROLES[state.role];
  const can = (roles) => roles === 'all' || roles.split(' ').includes(state.role);

  /* ---------------------------------------------------------------- theme */
  function applyTheme() {
    const t = store.get('theme', null);
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  function toggleTheme() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.hasAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    store.set('theme', dark ? 'light' : 'dark');
    applyTheme();
  }
  applyTheme();

  /* ---------------------------------------------------------------- toast */
  function toast(msg, kind) {
    let host = $('.toasts');
    if (!host) { host = document.createElement('div'); host.className = 'toasts'; host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.innerHTML = '<i></i><span>' + esc(msg) + '</span>';
    host.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 3600);
    setTimeout(() => t.remove(), 4000);
  }

  /* --------------------------------------------------------------- dialog */
  /* opts: title, html, confirm, confirmClass, reason ('required'|'optional'|null), reasonLabel, check, onConfirm(reason) */
  function dialog(opts) {
    const d = document.createElement('dialog');
    const reason = opts.reason ? '<div class="field"><label for="dlg-reason">' + esc(opts.reasonLabel || 'Reason') + (opts.reason === 'required' ? ' <span class="muted">(required)</span>' : '') + '</label><textarea id="dlg-reason" placeholder="' + esc(opts.reasonPlaceholder || '') + '"></textarea><div class="err" id="dlg-err" hidden>Please give a reason. It is stored in the audit log.</div></div>' : '';
    const check = opts.check ? '<label class="switch" style="font-weight:500"><input type="checkbox" id="dlg-check"><span class="track"></span><span>' + esc(opts.check) + '</span></label>' : '';
    d.innerHTML = '<form method="dialog"><div class="dlg-h"><h2>' + esc(opts.title) + '</h2></div><div class="dlg-b">' + (opts.html || '') + reason + check + '</div>' +
      '<div class="dlg-f"><button class="btn sec" value="cancel" type="submit">Cancel</button><button class="btn ' + (opts.confirmClass || '') + '" value="ok" id="dlg-ok" type="submit">' + esc(opts.confirm || 'Confirm') + '</button></div></form>';
    document.body.appendChild(d);
    const ok = $('#dlg-ok', d);
    const chk = $('#dlg-check', d);
    if (chk) { ok.disabled = true; chk.addEventListener('change', () => { ok.disabled = !chk.checked; }); }
    d.addEventListener('submit', (e) => {
      const btn = e.submitter;
      if (btn && btn.value === 'ok') {
        const ta = $('#dlg-reason', d);
        if (opts.reason === 'required' && ta && !ta.value.trim()) {
          e.preventDefault(); ta.setAttribute('aria-invalid', 'true'); $('#dlg-err', d).hidden = false; ta.focus(); return;
        }
        if (opts.onConfirm) opts.onConfirm(ta ? ta.value.trim() : '');
      }
    });
    d.addEventListener('close', () => d.remove());
    d.showModal();
    const first = $('#dlg-reason', d) || chk || ok;
    first.focus();
    return d;
  }

  /* ---------------------------------------------------------------- shell */
  function buildShell() {
    const page = document.body.dataset.page;
    if (!page || page === 'signin' || page === 'portal') return;
    const main = $('main');
    const app = document.createElement('div'); app.className = 'app';
    const side = document.createElement('aside'); side.className = 'side'; side.setAttribute('aria-label', 'Main navigation');
    let nav = '<div class="brand"><span class="mark">D</span><span>Dispute Console<small>Card disputes · Reg E / Z</small></span></div><nav class="nav" aria-label="Primary">';
    PAGES.forEach((p) => {
      if (p.group) { nav += '<div class="nav-label">' + p.group + '</div>'; return; }
      if (!can(p.roles)) return;
      nav += '<a href="' + p.href + '"' + (p.id === page ? ' aria-current="page"' : '') + '>' + icon(p.icon) + '<span>' + p.label + '</span>' +
        (p.count ? '<span class="count' + (p.hot ? ' hot' : '') + '">' + p.count + '</span>' : '') + (p.ext ? '<span class="count">' + icon('ext').replace('<svg', '<svg style="width:12px;height:12px"') + '</span>' : '') + '</a>';
    });
    nav += '</nav>';
    const roleOpts = Object.keys(ROLES).map((k) => '<option value="' + k + '"' + (k === state.role ? ' selected' : '') + '>' + ROLES[k].label + ' · ' + ROLES[k].user + '</option>').join('');
    nav += '<div class="side-foot"><div class="who"><span class="avatar">' + me().initials + '</span><div><b>' + me().user + '</b><span>' + me().label + '</span></div></div>' +
      '<label class="sr-only" for="role-sw">Switch role</label><select id="role-sw" title="Prototype only: switch the signed-in role">' + roleOpts + '</select></div>';
    side.innerHTML = nav;

    const content = document.createElement('div'); content.className = 'content';
    const top = document.createElement('header'); top.className = 'topbar';
    const crumbs = (document.body.dataset.crumbs || '').split('|').filter(Boolean);
    top.innerHTML = '<div class="crumbs">' + crumbs.map((c, i) => {
      const [label, href] = c.split('>');
      return (i ? '<span aria-hidden="true">/</span>' : '') + (href ? '<a href="' + href + '">' + esc(label) + '</a>' : '<b>' + esc(label) + '</b>');
    }).join('') + '</div>' +
      '<button class="search-btn" id="open-palette" type="button">' + icon('search').replace('<svg', '<svg style="width:16px;height:16px"') + '<span>Search cases or jump to…</span><span class="kbd">⌘K</span></button>' +
      '<span class="pill ' + (state.auto ? 'auto' : 'ok') + '" id="auto-pill" title="Auto-approve mode is shown to every role (FR-13)">Auto-approve ' + (state.auto ? 'ON' : 'OFF') + '</span>' +
      '<span class="pill warn" title="Local stack running the deterministic mock LLM provider">Mock LLM</span>' +
      '<button class="icon-btn" id="theme-btn" type="button" title="Toggle dark mode" aria-label="Toggle dark mode">' + icon('moon') + '</button>' +
      '<button class="icon-btn" id="keys-btn" type="button" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">' + icon('keys') + '</button>';
    main.parentNode.insertBefore(app, main);
    content.appendChild(top);
    content.appendChild(main);
    app.appendChild(side);
    app.appendChild(content);
    const note = document.createElement('div');
    note.className = 'proto-note';
    note.innerHTML = '<span class="dot"></span><span>Clickable prototype · synthetic data · mock “now” ' + NOW_LABEL + ' · nothing calls a backend</span>';
    main.prepend(note);

    $('#role-sw').addEventListener('change', (e) => {
      store.set('role', e.target.value);
      toast('Signed in as ' + ROLES[e.target.value].user + ' (' + ROLES[e.target.value].label + ')');
      setTimeout(() => location.reload(), 350);
    });
    $('#theme-btn').addEventListener('click', toggleTheme);
    $('#keys-btn').addEventListener('click', showShortcuts);
    $('#open-palette').addEventListener('click', openPalette);

    const pg = PAGES.find((p) => p.id === page);
    if (pg && !can(pg.roles)) {
      const c = document.createElement('div');
      c.className = 'callout warn'; c.style.marginBottom = '16px';
      c.textContent = 'Your role (' + me().label + ') cannot use this page. The real console hides it and the API returns 403. It is shown here so you can explore the prototype.';
      note.after(c);
    }
  }

  function applyRoleGates() {
    $$('[data-roles]').forEach((el) => { el.hidden = !can(el.dataset.roles); });
    $$('[data-roles-not]').forEach((el) => { el.hidden = can(el.dataset.rolesNot); });
    $$('[data-me]').forEach((el) => { el.textContent = me().user; });
  }

  /* ------------------------------------------------------------- palette */
  function openPalette() {
    const items = [];
    PAGES.filter((p) => p.id).forEach((p) => items.push({ grp: 'Go to', label: p.label, sub: p.href, href: p.href }));
    CASES.forEach((c) => items.push({ grp: 'Cases', label: c.ref, sub: c.regime + ' · ' + c.cat + ' · ' + money(c.amt), href: 'case.html' }));
    items.push({ grp: 'Actions', label: 'Toggle dark mode', sub: '', run: toggleTheme });
    Object.keys(ROLES).forEach((k) => items.push({ grp: 'Actions', label: 'Switch role to ' + ROLES[k].label, sub: ROLES[k].user, run: () => { store.set('role', k); location.reload(); } }));
    const d = document.createElement('dialog');
    d.className = 'palette';
    d.innerHTML = '<label class="sr-only" for="pal-in">Search</label><input id="pal-in" placeholder="Search cases, pages and actions…" autocomplete="off"><ul role="listbox" id="pal-list"></ul><div class="foot"><span><span class="kbd">↑</span> <span class="kbd">↓</span> move</span><span><span class="kbd">↵</span> open</span><span><span class="kbd">esc</span> close</span></div>';
    document.body.appendChild(d);
    const inp = $('#pal-in', d), list = $('#pal-list', d);
    let shown = [], sel = 0;
    function render() {
      const q = inp.value.trim().toLowerCase();
      shown = items.filter((i) => !q || (i.label + ' ' + i.sub).toLowerCase().includes(q)).slice(0, 14);
      sel = Math.min(sel, Math.max(shown.length - 1, 0));
      let html = '', grp = '';
      shown.forEach((it, i) => {
        if (it.grp !== grp) { grp = it.grp; html += '<li class="grp" aria-hidden="true">' + grp + '</li>'; }
        html += '<li role="option" data-i="' + i + '" aria-selected="' + (i === sel) + '">' + esc(it.label) + '<small>' + esc(it.sub) + '</small></li>';
      });
      list.innerHTML = html || '<li class="grp">No matches</li>';
    }
    function go(i) { const it = shown[i]; if (!it) return; d.close(); if (it.run) it.run(); else location.href = it.href; }
    inp.addEventListener('input', () => { sel = 0; render(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); render(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); render(); e.preventDefault(); }
      if (e.key === 'Enter') { go(sel); e.preventDefault(); }
    });
    list.addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) go(+li.dataset.i); });
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    d.addEventListener('close', () => d.remove());
    render();
    d.showModal();
    inp.focus();
  }

  function showShortcuts() {
    dialog({
      title: 'Keyboard shortcuts', confirm: 'Done',
      html: '<div class="summary">' + [
        ['⌘K or /', 'Search and jump'], ['g then c / a / d / u', 'Go to Cases / Approvals / Dashboard / Audit'],
        ['j / k', 'Move through lists'], ['Enter', 'Open the selected case'], ['a / e / r', 'Approve / return / reject (inbox and case)'],
        ['c', 'Open the case copilot'], ['?', 'This help'],
      ].map((r) => '<div><span>' + r[1] + '</span><b class="kbd">' + r[0] + '</b></div>').join('') + '</div>',
    });
  }

  let gPending = false;
  function globalKeys(e) {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!$('dialog[open]')) openPalette(); return; }
    if (typing || $('dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') { e.preventDefault(); openPalette(); return; }
    if (e.key === '?') { showShortcuts(); return; }
    if (gPending) {
      gPending = false;
      const map = { c: 'queue.html', a: 'inbox.html', d: 'dashboard.html', u: 'audit.html' };
      if (map[e.key]) location.href = map[e.key];
      return;
    }
    if (e.key === 'g') { gPending = true; setTimeout(() => { gPending = false; }, 900); return; }
    document.dispatchEvent(new CustomEvent('pagekey', { detail: e }));
  }

  /* --------------------------------------------------------------- helpers */
  const STATUS_PILL = {
    awaiting_approval: 'brand', needs_manual_completion: 'warn', investigating: 'info', triaged: 'info',
    representment_review: 'info', awaiting_network: 'plain', manual_prearb: 'plain', executing: 'auto', resolved: 'ok',
  };
  function clockCell(c) {
    const cls = c.clock === 'at_risk' ? 'warn' : c.clock === 'network_critical' ? 'bad' : c.clock === 'manual' ? '' : 'info';
    const tag = c.clock === 'at_risk' ? '<span class="pill warn">at risk</span>' : c.clock === 'network_critical' ? '<span class="pill bad">network-critical</span>' : c.clock === 'manual' ? '<span class="pill plain">manual queue</span>' : '<span class="pill info">open</span>';
    return '<div class="due"><div class="lbl"><b>' + c.due + '</b><span class="muted">' + c.left + '</span></div><div class="meter ' + cls + '"><i style="width:' + c.pct + '%"></i></div></div><div style="margin-top:4px">' + tag + '</div>';
  }

  /* ================================================================ pages */

  /* ----- sign-in ----- */
  function pageSignin() {
    $$('[data-pick-role]').forEach((a) => a.addEventListener('click', () => store.set('role', a.dataset.pickRole)));
  }

  /* ----- queue ----- */
  function pageQueue() {
    const body = $('#queue-body');
    const view = { tab: 'all', q: '', regime: '', net: '', cat: '' };
    let sel = 0;
    const tabs = {
      all: () => true,
      mine: (c) => c.who === me().user,
      risk: (c) => c.clock === 'at_risk' || c.clock === 'network_critical',
      approval: (c) => c.status === 'awaiting_approval',
      unassigned: (c) => !c.who,
    };
    function rows() {
      return CASES.filter(tabs[view.tab]).filter((c) =>
        (!view.regime || c.regime === view.regime) && (!view.net || c.net === view.net) && (!view.cat || c.cat === view.cat) &&
        (!view.q || (c.ref + ' ' + c.cat + ' ' + c.who + ' ' + c.status + ' ' + c.net).toLowerCase().includes(view.q)));
    }
    function render() {
      const r = rows();
      sel = Math.min(sel, Math.max(r.length - 1, 0));
      Object.keys(tabs).forEach((k) => { const el = $('[data-count="' + k + '"]'); if (el) el.textContent = CASES.filter(tabs[k]).length; });
      body.innerHTML = r.map((c, i) => '<tr data-i="' + i + '"' + (i === sel ? ' class="sel"' : '') + '>' +
        '<td><a class="case-link" href="case.html">' + c.ref + '</a><span class="sub">' + c.channel + (c.channel === 'Chat' ? ' · <span class="pill auto plain" style="font-size:11px;padding:0 6px">new via chat</span>' : '') + '</span></td>' +
        '<td><span class="tag">' + c.regime + '</span></td>' +
        '<td>' + c.cat + '<span class="sub">' + c.net + ' · ' + c.rc + '</span></td>' +
        '<td class="num"><b>' + money(c.amt) + '</b>' + (c.amt > 500 ? '<span class="sub">Supervisor</span>' : '') + '</td>' +
        '<td>' + clockCell(c) + '</td>' +
        '<td><span class="pill ' + (STATUS_PILL[c.status] || '') + '">' + c.status.replace(/_/g, ' ') + '</span></td>' +
        '<td>' + (c.who ? '<span class="who" style="padding:0"><span class="avatar" style="width:24px;height:24px;font-size:10px">' + c.who.slice(0, 1).toUpperCase() + c.who.slice(-1) + '</span>' + c.who + '</span>' : '<button class="btn sm sec" data-claim="' + c.ref + '" data-roles="analyst supervisor">Claim</button>') + '</td></tr>').join('') ||
        '<tr><td colspan="7"><div class="empty">No cases match these filters.</div></td></tr>';
      $('#queue-summary').textContent = r.length + ' shown · sorted by nearest deadline';
      applyRoleGates();
    }
    $$('#queue-tabs [role=tab]').forEach((b) => b.addEventListener('click', () => {
      $$('#queue-tabs [role=tab]').forEach((x) => x.setAttribute('aria-selected', 'false'));
      b.setAttribute('aria-selected', 'true'); view.tab = b.dataset.tab; sel = 0; render();
    }));
    $('#q').addEventListener('input', (e) => { view.q = e.target.value.trim().toLowerCase(); render(); });
    ['regime', 'net', 'cat'].forEach((k) => $('#f-' + k).addEventListener('change', (e) => { view[k] = e.target.value; render(); }));
    $('#f-reset').addEventListener('click', () => { ['regime', 'net', 'cat'].forEach((k) => { view[k] = ''; $('#f-' + k).value = ''; }); view.q = ''; $('#q').value = ''; render(); });
    body.addEventListener('click', (e) => {
      const claim = e.target.closest('[data-claim]');
      if (claim) { e.stopPropagation(); const c = CASES.find((x) => x.ref === claim.dataset.claim); c.who = me().user; toast(c.ref + ' assigned to you'); render(); return; }
      const tr = e.target.closest('tr[data-i]');
      if (tr && !e.target.closest('a')) location.href = 'case.html';
    });
    document.addEventListener('pagekey', (ev) => {
      const e = ev.detail, n = rows().length;
      if (e.key === 'j') { sel = Math.min(sel + 1, n - 1); render(); }
      if (e.key === 'k') { sel = Math.max(sel - 1, 0); render(); }
      if (e.key === 'Enter' && n) location.href = 'case.html';
    });
    render();
  }

  /* ----- case detail ----- */
  function pageCase() {
    // tabs
    const tabBtns = $$('#case-tabs [role=tab]');
    function showTab(id) {
      tabBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
      $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== id; });
    }
    tabBtns.forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    // draft switcher
    $$('#draft-seg [role=tab]').forEach((b) => b.addEventListener('click', () => {
      $$('#draft-seg [role=tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      $$('[data-draft]').forEach((p) => { p.hidden = p.dataset.draft !== b.dataset.d; });
    }));
    // citations jump to the referenced record
    document.addEventListener('click', (e) => {
      const c = e.target.closest('[data-ref]');
      if (!c) return;
      e.preventDefault();
      const target = document.getElementById(c.dataset.ref);
      if (!target) return;
      const panel = target.closest('[data-panel]');
      if (panel) showTab(panel.dataset.panel);
      const dr = target.closest('[data-draft]');
      if (dr) { const b = $('#draft-seg [data-d="' + dr.dataset.draft + '"]'); if (b) b.click(); }
      if (window.innerWidth < 1600) closeCopilot();
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.remove('flash'); void target.offsetWidth; target.classList.add('flash');
    });

    // approvals on the action bar (FR-11, FR-12)
    const step = { n: 0 };
    const STEPS = [
      { title: 'Approve provisional credit', amt: 842.17, what: 'Satisfies the investigate-or-credit clock · due Tue Nov 3, 17:00 (4 business days)', role: 'supervisor', hash: 'sha256:9c1e…b47a', pid: 'P-1' },
      { title: 'Approve customer notice: provisional credit letter', amt: null, what: 'Satisfies the PC-notice clock (2 business days after the credit posts)', role: 'analyst', hash: 'sha256:51d0…e902', pid: 'P-2' },
      { title: 'Approve chargeback filing to Visa (10.4)', amt: 842.17, what: 'Visa filing window open until Tue Dec 15', role: 'supervisor', hash: 'sha256:c7a3…1f08', pid: 'P-3' },
    ];
    function renderBar() {
      const s = STEPS[step.n];
      const bar = $('#action-bar');
      if (!s) { bar.innerHTML = '<div class="what"><b>All proposals decided</b><span>Effects are executing through the outbox. Clocks update when each one succeeds.</span></div>'; return; }
      const supOnly = s.role === 'supervisor';
      let ctl;
      if (state.role === 'auditor' || state.role === 'admin') ctl = '<span class="note">' + me().label + 's cannot approve case actions (D-3). Read-only.</span>';
      else if (supOnly && state.role === 'analyst') ctl = '<span class="pill warn">Needs a Supervisor · over $500</span><button class="btn sec" data-act="return">Return<span class="kbd">e</span></button>';
      else ctl = '<button class="btn ok" data-act="approve">Approve<span class="kbd">a</span></button><button class="btn sec" data-act="return">Return<span class="kbd">e</span></button><button class="btn danger-sec" data-act="reject">Reject<span class="kbd">r</span></button>';
      bar.innerHTML = '<div class="what"><span class="muted small">Next decision · ' + (step.n + 1) + ' of 3 · prepared by svc:decide (agent)</span><b>' + s.title + (s.amt ? ' · ' + money(s.amt) : '') + '</b><span>' + s.what + '</span></div><div class="btn-row">' + ctl + '</div>';
    }
    function decide(kind) {
      const s = STEPS[step.n];
      if (!s || state.role === 'auditor' || state.role === 'admin') return;
      if (kind === 'approve' && s.role === 'supervisor' && state.role === 'analyst') { toast('A Supervisor must approve this (over $500)', 'warn'); return; }
      const sum = '<div class="summary"><div><span>Action</span><b>' + s.title.replace('Approve ', '') + '</b></div>' + (s.amt ? '<div><span>Amount</span><b>' + money(s.amt) + '</b></div>' : '') +
        '<div><span>Policy outcome</span><b>grant_provisional_credit · RE-PC-001</b></div><div><span>Confidence</span><b>0.93 (high)</b></div><div><span>Approval binds to</span><b class="mono">' + s.hash + '</b></div></div>';
      if (kind === 'approve') {
        dialog({
          title: s.title, confirm: 'Approve', confirmClass: 'ok', html: sum + '<p class="note">You are ' + me().user + ', not the preparer, so four-eyes is satisfied. If the proposal changes before execution, this approval stops counting (FR-11 AC 4).</p>',
          check: 'I have reviewed the evidence, decision and drafts',
          onConfirm: () => { addTimeline('approval.approved · ' + s.pid + ' · ' + me().user); markProposal(s.pid, 'approved', 'ok'); toast('Approved. ' + (s.amt ? 'Ledger posting queued (idempotent effect).' : 'Letter queued for dispatch.')); step.n++; renderBar(); },
        });
      } else {
        dialog({
          title: (kind === 'reject' ? 'Reject: ' : 'Return for rework: ') + s.title.replace('Approve ', ''), confirm: kind === 'reject' ? 'Reject' : 'Return', confirmClass: kind === 'reject' ? 'danger' : '',
          html: sum, reason: 'required', reasonLabel: kind === 'reject' ? 'Why are you rejecting it?' : 'What needs to change?',
          onConfirm: (r) => { addTimeline('approval.' + (kind === 'reject' ? 'rejected' : 'returned') + ' · ' + s.pid + ' · “' + r + '”'); markProposal(s.pid, kind === 'reject' ? 'rejected' : 'returned', kind === 'reject' ? 'bad' : 'warn'); toast(kind === 'reject' ? 'Rejected with reason' : 'Returned to the agent for rework', 'warn'); step.n++; renderBar(); },
        });
      }
    }
    function markProposal(pid, label, cls) { const el = $('#prop-' + pid + ' .pill'); if (el) { el.className = 'pill ' + cls; el.textContent = label; } }
    function addTimeline(text, cls) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="dot ' + (cls || '') + '"></span><div>' + esc(text) + '<small>Today 09:3' + Math.floor(Math.random() * 9) + ' · appended to the audit chain</small></div>';
      const tl = $('#timeline-list'); const fut = $('.dot.future', tl);
      tl.insertBefore(li, fut ? fut.closest('li') : null);
    }
    $('#action-bar').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) decide(b.dataset.act); });
    document.addEventListener('pagekey', (ev) => {
      const k = ev.detail.key;
      if (k === 'a') decide('approve'); if (k === 'r') decide('reject'); if (k === 'e') decide('return');
      if (k === 'c') openCopilot();
    });
    $('#edit-draft').addEventListener('click', () => dialog({
      title: 'Edit this draft?', confirm: 'Start editing',
      html: '<div class="callout warn">Saving an edit creates v2 and makes you the preparer. You will not be able to approve this proposal yourself, and any existing approval stops counting (FR-10 AC 3, D-2).</div>',
      onConfirm: () => toast('Editor opened (not built in the prototype)'),
    }));
    renderBar();

    /* ---- copilot (FR-36) ---- */
    const drawer = $('#copilot'), scrim = $('#scrim'), log = $('#copilot-log'), input = $('#copilot-in');
    function openCopilot() { drawer.classList.add('open'); scrim.classList.add('show'); document.body.classList.add('copilot-open'); drawer.setAttribute('aria-hidden', 'false'); setTimeout(() => input.focus(), 200); }
    function closeCopilot() { drawer.classList.remove('open'); scrim.classList.remove('show'); document.body.classList.remove('copilot-open'); drawer.setAttribute('aria-hidden', 'true'); }
    $('#copilot-fab').addEventListener('click', openCopilot);
    $('#copilot-close').addEventListener('click', closeCopilot);
    scrim.addEventListener('click', closeCopilot);
    drawer.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCopilot(); });
    const C = (ref, label) => '<button class="cite" data-ref="' + ref + '" title="Jump to ' + esc(label) + '">' + esc(label) + '</button>';
    const ANSWERS = [
      { m: /(ignore|approve (this|it)|bypass|override)/i, inj: true,
        a: () => 'I can’t approve, reject or change anything on a case. Approval is a human decision, and the approve control is in the action bar when your role allows it ' + C('prop-P-1', 'P-1') + '.' },
      { m: /supervisor|who (can|needs to) approve|why.*approv/i,
        a: () => 'The provisional credit is $842.17, over the $500 Supervisor threshold ' + C('prop-P-1', 'P-1') + '. Confidence is 0.93, above the 0.80 low-confidence line, so that is not a reason ' + C('conf', 'confidence') + '.' },
      { m: /missing|chargeback|before.*fil|affidavit|evidence/i, act: 'redraft',
        a: () => 'The signed affidavit of unauthorized use is still missing ' + C('ev-E-5', 'E-5') + '. A customer info request for it is drafted and waiting for approval ' + C('draft-info', 'info request v1') + '. The Visa filing window stays open until Dec 15 ' + C('clk-visa', 'Visa 10.4 clock') + '.' },
      { m: /clock|deadline|due|nearest|when/i,
        a: () => 'The nearest deadline is the investigate-or-credit clock, due Tue Nov 3 at 17:00, 4 business days away ' + C('clk-pc', 'Reg E 10 BD') + '. Approving the provisional credit satisfies it ' + C('prop-P-1', 'P-1') + '. If the credit posts in time, investigation can extend to 45 days, until Dec 4 ' + C('clk-ext', 'extension clock') + '.' },
      { m: /summar|overview|tl;?dr|what.*(this|case) about/i,
        a: () => 'The cardholder reports a $842.17 card-present purchase they did not make ' + C('claim', 'claim') + '. The device and merchant profile do not match prior use ' + C('ev-E-2', 'E-2') + ', and there are no prior disputes ' + C('ev-E-3', 'E-3') + '. Policy recommends provisional credit under rule RE-PC-001 ' + C('trace', 'rule trace') + ', and it is waiting for a Supervisor ' + C('prop-P-1', 'P-1') + '.' },
      { m: /reason code|10\.4|why.*fraud|categor/i,
        a: () => 'The category is fraud because the cardholder says they did not authorize the purchase ' + C('claim', 'claim') + '. The authoritative Visa table maps fraud to 10.4, and the model’s suggestion agreed with it ' + C('trace', 'CAT-FRAUD-02') + '.' },
      { m: /letter|notice|draft/i, act: 'redraft',
        a: () => 'The provisional-credit notice is at v1, written by the agent from template pc_notice.v3 ' + C('draft-pc', 'PC notice v1') + '. All required Reg E disclosures are present and the amounts match the case record ' + C('draft-checks', 'draft checks') + '.' },
    ];
    let busy = false;
    function addMsg(cls, html, meta) {
      const d = document.createElement('div');
      d.className = 'msg ' + cls;
      d.innerHTML = html + (meta ? '<span class="meta">' + meta + '</span>' : '');
      log.appendChild(d); log.scrollTop = log.scrollHeight;
      return d;
    }
    async function ask(q) {
      if (busy || !q.trim()) return;
      busy = true;
      $$('#copilot-suggest button').forEach((b) => { if (b.textContent === q) b.remove(); });
      addMsg('me', esc(q), me().user + ' · just now');
      const t = addMsg('bot', '<span class="typing" aria-label="Copilot is thinking"><i></i><i></i><i></i></span>');
      t.style.padding = '0';
      await wait(850);
      const hit = ANSWERS.find((x) => x.m.test(q));
      let html, meta;
      if (hit) {
        html = hit.a();
        meta = hit.inj ? 'Instruction in your message ignored · the copilot has no approve action' : 'copilot_answer.v1 · mock-1 · every sentence cited';
      } else {
        html = 'I can’t answer that from this case’s records. Try asking about the decision, evidence, clocks or drafts.';
        meta = 'No cited answer passed validation';
      }
      t.style.padding = '';
      t.innerHTML = html + '<span class="meta">' + meta + '</span>';
      if (hit && hit.act === 'redraft') {
        const acts = document.createElement('div');
        acts.className = 'acts';
        if (can('analyst supervisor')) {
          acts.innerHTML = '<button class="btn sm sec" data-sugg="redraft">Redraft info request: add the chat link</button><button class="btn sm sec" data-sugg="note">Add as case note</button>';
        } else {
          acts.innerHTML = '<span class="note">Suggested actions are hidden for your role.</span>';
        }
        t.insertBefore(acts, $('.meta', t));
      }
      log.scrollTop = log.scrollHeight;
      busy = false;
    }
    log.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sugg]');
      if (!b) return;
      if (b.dataset.sugg === 'note') { addTimeline('case.note · via copilot · ' + me().user); toast('Note added to the case as ' + me().user); b.disabled = true; return; }
      dialog({
        title: 'Redraft the customer info request?', confirm: 'Create v2 as me',
        html: '<p>The drafting agent will write v2 with your instruction: <i>“add the portal chat link so the cardholder can reply there.”</i></p><div class="callout warn">This counts as your edit. You become the preparer of v2, so a different person must approve it (D-10).</div>',
        onConfirm: () => { addTimeline('draft.version · info request v2 · preparer ' + me().user + ' (via copilot)', 'ai'); toast('Draft v2 created. You are its preparer.'); b.disabled = true; b.textContent = 'v2 created'; },
      });
    });
    $('#copilot-suggest').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ask(b.textContent); });
    $('#copilot-form').addEventListener('submit', (e) => { e.preventDefault(); const q = input.value; input.value = ''; ask(q); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#copilot-form').requestSubmit(); } });
    if (location.hash === '#copilot') openCopilot();
  }

  /* ----- approvals inbox ----- */
  function pageInbox() {
    const items = [
      { id: 'P-7', ref: 'DSP-2026-000398', action: 'Provisional credit', cat: 'Non-receipt · MC 4855', amt: 219.40, conf: 0.91, due: 'Thu Oct 29 · 17:00', left: '1 BD', pct: 90, risk: true, role: 'analyst', preparer: 'svc:decide', rule: 'RE-PC-001', summary: 'Merchant shows no delivery confirmation [E-3]; cardholder contacted the merchant on Oct 21 [E-4].' },
      { id: 'P-9', ref: 'DSP-2026-000366', action: 'Acknowledgment letter (Reg Z)', cat: 'Not as described · MC 4853', amt: null, conf: 0.88, due: 'Fri Oct 30 · ack', left: '2 days', pct: 93, risk: true, role: 'analyst', preparer: 'svc:decide', rule: 'RZ-ACK-001', summary: 'Written acknowledgment due within 30 days of the billing-error notice [C-1].' },
      { id: 'P-1', ref: 'DSP-2026-000412', action: 'Provisional credit', cat: 'Fraud · Visa 10.4', amt: 842.17, conf: 0.93, due: 'Tue Nov 3 · 17:00', left: '4 BD', pct: 60, risk: false, role: 'supervisor', why: 'over $500', preparer: 'svc:decide', rule: 'RE-PC-001', summary: 'Card-present at a merchant profile that does not match prior use [E-2]; no prior disputes [E-3].' },
      { id: 'P-4', ref: 'DSP-2026-000355', action: 'Chargeback filing', cat: 'Not as described · MC 4853', amt: 129.00, conf: 0.74, due: 'Mon Nov 2 · network', left: '3 days', pct: 85, risk: true, role: 'supervisor', why: 'low confidence', preparer: 'svc:decide', rule: 'NET-CB-002', summary: 'The model suggested 4855; the policy table says 4853, so confidence was capped [R-FR9-5].' },
      { id: 'P-6', ref: 'DSP-2026-000377', action: 'Provisional credit (edited)', cat: 'Credit not processed · Visa 13.6', amt: 64.99, conf: 0.95, due: 'Sun Nov 1 · ack', left: '4 days', pct: 86, risk: false, role: 'analyst', preparer: 'supervisor1', rule: 'RZ-CR-003', summary: 'Merchant credit of $64.99 was issued but never posted [E-5].' },
    ];
    let list = items.slice(), sel = 0;
    const body = $('#inbox-body'), pane = $('#preview');
    function blocked(it) {
      if (state.role === 'auditor' || state.role === 'admin') return me().label + 's cannot approve case actions (D-3).';
      if (it.preparer === me().user) return 'You prepared this proposal, so someone else must approve it. The server would return 403 four_eyes_violation.';
      if (it.role === 'supervisor' && state.role !== 'supervisor') return 'Needs a Supervisor (' + it.why + ').';
      return '';
    }
    function render() {
      sel = Math.min(sel, Math.max(list.length - 1, 0));
      $('#pending-count').textContent = list.length;
      body.innerHTML = list.map((it, i) => '<tr data-i="' + i + '"' + (i === sel ? ' class="sel"' : '') + '><td><b>' + it.action + '</b><span class="sub">' + it.ref + ' · ' + it.cat + '</span></td>' +
        '<td class="num">' + (it.amt ? money(it.amt) : '—') + '</td>' +
        '<td><div class="due"><div class="lbl"><b>' + it.due + '</b><span class="muted">' + it.left + '</span></div><div class="meter ' + (it.risk ? 'warn' : '') + '"><i style="width:' + it.pct + '%"></i></div></div></td>' +
        '<td>' + (it.role === 'supervisor' ? '<span class="pill warn">Supervisor · ' + it.why + '</span>' : '<span class="pill plain">Analyst</span>') + (blocked(it) ? '<span class="sub">You can’t approve</span>' : '') + '</td></tr>').join('') ||
        '<tr><td colspan="4"><div class="empty"><b>Inbox zero.</b><br>Every proposal you can decide has been decided.</div></td></tr>';
      renderPreview();
    }
    function renderPreview() {
      const it = list[sel];
      if (!it) { pane.innerHTML = '<div class="card-b"><div class="empty">Nothing selected</div></div>'; return; }
      const b = blocked(it);
      const confCls = it.conf < 0.8 ? 'warn' : 'ok';
      pane.innerHTML = '<div class="card-h"><h2>' + it.action + (it.amt ? ' · ' + money(it.amt) : '') + '</h2><div class="right"><a href="case.html" class="btn sm ghost">Open case →</a></div></div><div class="card-b">' +
        '<div class="summary"><div><span>Case</span><b>' + it.ref + '</b></div><div><span>Category</span><b>' + it.cat + '</b></div><div><span>Policy rule</span><b class="mono">' + it.rule + '</b></div><div><span>Prepared by</span><b>' + it.preparer + '</b></div></div>' +
        '<div><div class="lbl small muted" style="display:flex;justify-content:space-between"><span>Confidence</span><b>' + it.conf.toFixed(2) + (it.conf < 0.8 ? ' · low' : '') + '</b></div><div class="meter ' + confCls + '"><i style="width:' + it.conf * 100 + '%"></i></div></div>' +
        '<div><h3 style="margin-top:0">Agent evidence summary</h3><p class="small">' + esc(it.summary) + '</p></div>' +
        (b ? '<div class="callout warn">' + b + '</div><div class="btn-row"><button class="btn sec" data-act="return">Return<span class="kbd">e</span></button></div>' :
          '<div class="btn-row"><button class="btn ok lg" data-act="approve">Approve<span class="kbd">a</span></button><button class="btn sec" data-act="return">Return<span class="kbd">e</span></button><button class="btn danger-sec" data-act="reject">Reject<span class="kbd">r</span></button></div>') +
        '<p class="note">Approval binds to content hash <span class="mono">sha256:' + (it.id.charCodeAt(2) * 7919).toString(16) + '…e4</span>. Any later edit voids it.</p></div>';
      if (state.role === 'auditor' || state.role === 'admin') $$('[data-act]', pane).forEach((x) => x.remove());
    }
    function act(kind) {
      const it = list[sel];
      if (!it || state.role === 'auditor' || state.role === 'admin') return;
      if (kind === 'approve' && blocked(it)) { toast(blocked(it), 'warn'); return; }
      const done = (msg, k) => { list.splice(sel, 1); toast(msg, k); render(); };
      if (kind === 'approve') {
        dialog({ title: 'Approve ' + it.action.toLowerCase() + '?', confirm: 'Approve', confirmClass: 'ok',
          html: '<div class="summary"><div><span>Case</span><b>' + it.ref + '</b></div><div><span>Amount</span><b>' + (it.amt ? money(it.amt) : '—') + '</b></div><div><span>Deadline</span><b>' + it.due + '</b></div></div>',
          onConfirm: () => done('Approved ' + it.ref + '. Executing exactly once.') });
      } else {
        dialog({ title: (kind === 'reject' ? 'Reject ' : 'Return ') + it.action.toLowerCase(), confirm: kind === 'reject' ? 'Reject' : 'Return for rework', confirmClass: kind === 'reject' ? 'danger' : '',
          reason: 'required', reasonLabel: kind === 'reject' ? 'Why are you rejecting it?' : 'What needs to change?',
          onConfirm: () => done(kind === 'reject' ? 'Rejected ' + it.ref : 'Returned ' + it.ref + ' to the agent', 'warn') });
      }
    }
    body.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-i]'); if (tr) { sel = +tr.dataset.i; render(); } });
    pane.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act); });
    document.addEventListener('pagekey', (ev) => {
      const k = ev.detail.key;
      if ($('#tab-pending').hidden) return;
      if (k === 'j') { sel = Math.min(sel + 1, list.length - 1); render(); }
      if (k === 'k') { sel = Math.max(sel - 1, 0); render(); }
      if (k === 'a') act('approve'); if (k === 'r') act('reject'); if (k === 'e') act('return');
      if (k === 'Enter') location.href = 'case.html';
    });
    // section tabs
    $$('#inbox-tabs [role=tab]').forEach((b) => b.addEventListener('click', () => {
      $$('#inbox-tabs [role=tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      $$('[data-section]').forEach((s) => { s.hidden = s.id !== b.dataset.target; });
    }));
    // QA verdicts and call-backs
    document.addEventListener('click', (e) => {
      const q = e.target.closest('[data-qa]');
      if (q) {
        const row = q.closest('tr');
        if (q.dataset.qa === 'agree') { row.querySelector('.verdict').innerHTML = '<span class="pill ok">agree · ' + me().user + '</span>'; toast('QA verdict recorded'); }
        else dialog({ title: 'Disagree with this auto-action', confirm: 'Record disagreement', confirmClass: 'danger', reason: 'required', reasonLabel: 'What was wrong?',
          html: '<div class="callout auto">A disagreement opens a remediation task. Any reversal goes through a new, approved proposal (FR-14 AC 2).</div>',
          onConfirm: () => { row.querySelector('.verdict').innerHTML = '<span class="pill bad">disagree · remediation opened</span>'; toast('Remediation task opened', 'warn'); } });
      }
      const cb = e.target.closest('[data-callback]');
      if (cb) { cb.closest('tr').querySelector('.verdict').innerHTML = '<span class="pill ok">called back · ' + me().user + '</span>'; toast('Call-back closed'); }
    });
    render();
  }

  /* ----- dashboard ----- */
  function pageDashboard() {
    $$('svg.spark[data-points]').forEach((svg) => {
      const pts = svg.dataset.points.split(',').map(Number);
      const max = Math.max(...pts), min = Math.min(...pts), w = 200, h = 36, pad = 3;
      const xy = pts.map((v, i) => [(i / (pts.length - 1)) * w, h - pad - ((v - min) / ((max - min) || 1)) * (h - pad * 2)]);
      const d = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      const color = svg.dataset.color || 'var(--brand)';
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.innerHTML = '<path d="' + d + ' L' + w + ' ' + h + ' L0 ' + h + 'Z" fill="' + color + '" opacity=".12"/><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" vector-effect="non-scaling-stroke"/>';
    });
  }

  /* ----- admin ----- */
  function pageAdmin() {
    const sw = $('#auto-toggle');
    sw.checked = state.auto;
    function paint() {
      $('#auto-state').innerHTML = state.auto ? '<span class="pill auto">ON</span>' : '<span class="pill ok">OFF</span>';
      const p = $('#auto-pill'); if (p) { p.className = 'pill ' + (state.auto ? 'auto' : 'ok'); p.textContent = 'Auto-approve ' + (state.auto ? 'ON' : 'OFF'); }
    }
    sw.addEventListener('change', () => {
      const turningOn = sw.checked;
      sw.checked = state.auto; // revert until confirmed
      if (state.role !== 'admin') { toast('Only an Admin can change auto-approve', 'warn'); return; }
      dialog({
        title: turningOn ? 'Turn auto-approve ON?' : 'Turn auto-approve OFF?', confirm: turningOn ? 'Turn ON' : 'Turn OFF', confirmClass: turningOn ? 'danger' : '',
        html: turningOn ? '<div class="callout auto">High-confidence (≥ 0.90) provisional credits and chargeback filings up to $100 will execute without a human. 10% are sampled for Supervisor QA. Letters, denials, write-offs and representment responses still need approval.</div>'
          : '<div class="callout info">New auto-actions stop within 5 seconds. Auto-actions not yet executed go back to the approvals inbox. Executed ones are not reversed.</div>',
        reason: 'required', reasonLabel: 'Reason (stored in the audit log)', reasonPlaceholder: 'e.g. Pilot window approved by Compliance on Oct 27',
        onConfirm: (r) => {
          state.auto = turningOn; store.set('auto', turningOn); sw.checked = turningOn; paint();
          const tb = $('#cfg-history'); const tr = document.createElement('tr');
          tr.innerHTML = '<td>15</td><td>' + me().user + '</td><td class="mono">auto_approve.enabled ' + !turningOn + ' → ' + turningOn + '</td><td>' + esc(r) + '</td>';
          tb.prepend(tr);
          toast('Auto-approve is now ' + (turningOn ? 'ON' : 'OFF') + ' · config v15', turningOn ? 'warn' : '');
        },
      });
    });
    paint();
    // threshold validation (D-4, FR-9 AC 3)
    const f = { sup: $('#t-sup'), auto: $('#t-auto'), low: $('#t-low'), high: $('#t-high'), qa: $('#t-qa') };
    function validate() {
      const errs = [];
      const sup = +f.sup.value, au = +f.auto.value, lo = +f.low.value, hi = +f.high.value;
      const bad = (el, on, msg) => { el.setAttribute('aria-invalid', String(on)); const e = $('#' + el.id + '-err'); if (e) { e.hidden = !on; if (msg) e.textContent = msg; } if (on) errs.push(msg); };
      bad(f.auto, au > sup, 'Must be ≤ the Supervisor threshold ($' + sup + ') so auto-approve can’t bypass Supervisor sign-off (D-4).');
      bad(f.high, hi < lo, 'Must be ≥ the low-confidence line (' + lo + ') (FR-9 AC 3).');
      const changed = Object.values(f).some((el) => el.value !== el.defaultValue);
      $('#save-cfg').disabled = !!errs.length || !changed;
      return errs;
    }
    Object.values(f).forEach((el) => el.addEventListener('input', validate));
    $('#save-cfg').addEventListener('click', () => {
      const diffs = Object.values(f).filter((el) => el.value !== el.defaultValue).map((el) => '<div><span>' + el.dataset.key + '</span><b class="mono">' + el.defaultValue + ' → ' + esc(el.value) + '</b></div>').join('');
      dialog({ title: 'Save configuration v15', confirm: 'Save', html: '<div class="summary">' + diffs + '</div>', reason: 'required', reasonLabel: 'Reason for the change',
        onConfirm: () => { Object.values(f).forEach((el) => { el.defaultValue = el.value; }); validate(); toast('Saved as config v15. Diff appended to the audit log.'); } });
    });
    validate();
    $$('[data-kill]').forEach((k) => k.addEventListener('change', () => toast((k.checked ? 'Enabled ' : 'Paused ') + k.dataset.kill + ' · audit-logged', k.checked ? '' : 'warn')));
  }

  /* ----- audit ----- */
  function pageAudit() {
    $('#verify').addEventListener('click', async () => {
      const btn = $('#verify'), bar = $('#vbar'), out = $('#vstatus');
      btn.disabled = true; out.innerHTML = '<span class="muted">Recomputing hashes…</span>';
      const total = 48221;
      for (let i = 1; i <= 20; i++) { bar.style.width = (i * 5) + '%'; out.innerHTML = '<span class="muted tnum">seq ' + Math.round(total * i / 20).toLocaleString() + ' / ' + total.toLocaleString() + '</span>'; await wait(60); }
      out.innerHTML = '<span class="pill ok">Chain intact · seq 1 → 48,221 · 1.2 s</span>';
      btn.disabled = false; toast('Audit chain verified. No breaks.');
    });
    $('#replay').addEventListener('click', async () => {
      const out = $('#replay-out'); out.innerHTML = '<span class="muted">Replaying 4 decisions from the record…</span>'; await wait(900);
      out.innerHTML = '<span class="pill ok">Match · 0 diffs · policy 2026.10.1 · LLM outputs replayed from record</span>';
    });
    $('#audit-body').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-seq]');
      if (!tr) return;
      const c = tr.children;
      dialog({ title: 'Event #' + tr.dataset.seq, confirm: 'Close',
        html: '<div class="summary"><div><span>Type</span><b class="mono">' + c[3].textContent + '</b></div><div><span>Actor</span><b>' + c[2].textContent + '</b></div><div><span>Time</span><b>' + c[1].textContent + '</b></div><div><span>Versions</span><b class="mono">' + c[4].textContent + '</b></div><div><span>Hash</span><b class="mono">' + c[5].textContent + '</b></div><div><span>Prev hash</span><b class="mono">' + (tr.previousElementSibling ? tr.previousElementSibling.children[5].textContent : '…') + '</b></div><div><span>Payload</span><b class="mono">digest only (restricted)</b></div></div>' });
    });
    $('#audit-q').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      $$('#audit-body tr').forEach((tr) => { tr.hidden = q && !tr.textContent.toLowerCase().includes(q); });
    });
    $$('[data-etype]').forEach((ch) => ch.addEventListener('click', () => {
      const on = ch.getAttribute('aria-pressed') !== 'true';
      $$('[data-etype]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      ch.setAttribute('aria-pressed', String(on));
      $$('#audit-body tr').forEach((tr) => { tr.hidden = on && !tr.dataset.type.startsWith(ch.dataset.etype); });
    }));
  }

  /* ----- intake ----- */
  function pageIntake() {
    const card = $('#pan'), amt = $('#amt'), prev = $('#preview-body');
    function luhn(d) { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; }
    function update() {
      const digits = card.value.replace(/\D/g, '');
      card.value = digits.replace(/(.{4})/g, '$1 ').trim().slice(0, 23);
      let net = '', msg = '', ok = false;
      if (/^3[47]/.test(digits)) msg = 'American Express is out of scope (OOS-3). The API would return 422 out_of_scope_network.';
      else if (/^6(011|5)/.test(digits)) msg = 'Discover is out of scope (OOS-3). The API would return 422 out_of_scope_network.';
      else if (/^4/.test(digits)) net = 'Visa'; else if (/^(5[1-5]|2[2-7])/.test(digits)) net = 'Mastercard';
      if (!msg && digits.length >= 13 && !luhn(digits)) msg = 'That card number fails the check digit. Check for a typo.';
      if (net && digits.length >= 13 && luhn(digits)) ok = true;
      card.setAttribute('aria-invalid', String(!!msg)); $('#pan-err').hidden = !msg; $('#pan-err').textContent = msg;
      const a = parseFloat(amt.value);
      const amtBad = amt.value !== '' && !(a > 0);
      amt.setAttribute('aria-invalid', String(amtBad)); $('#amt-err').hidden = !amtBad;
      const credit = $('#product').value === 'credit';
      const rows = [];
      rows.push(['Card', ok ? '•••• ' + digits.slice(-4) + ' · ' + net + ' · token issued by the vault' : 'Waiting for a valid card number']);
      rows.push(['Regime', credit ? 'Reg Z (credit card)' : 'Reg E (debit)']);
      if (credit) { rows.push(['Acknowledgment', 'Fri Nov 27 · 30 days']); rows.push(['Resolution', 'Within 2 billing cycles, by Tue Jan 26 at the latest']); }
      else { rows.push(['Investigate or credit', 'Thu Nov 12 · 10 business days (Nov 11 holiday skipped)']); rows.push(['Extended investigation', 'Sat Dec 12 · 45 days, if credit posts in time']); }
      if (net) rows.push([net + ' filing window', net === 'Visa' ? '120 days from processing' : '120 days from settlement']);
      if (+a > 500) rows.push(['Approvals', 'Over $500: a Supervisor must approve money movement']);
      prev.innerHTML = rows.map((r) => '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
      $('#submit').disabled = !(ok && a > 0 && !msg);
    }
    ['input', 'change'].forEach((ev) => $('#intake-form').addEventListener(ev, update));
    $('#intake-form').addEventListener('submit', (e) => {
      e.preventDefault();
      toast('Dispute DSP-2026-000432 created · clocks started');
      setTimeout(() => { location.href = 'case.html'; }, 1100);
    });
    update();
  }

  /* ----- cardholder portal chat (FR-37) ----- */
  function pagePortal() {
    const log = $('#chat-log'), quick = $('#quick'), form = $('#chat-form'), inp = $('#chat-in'), ev = $('#events');
    const TXNS = [
      { id: 't1', m: 'NORTHSIDE FITNESS', amt: 49.00, d: 'Oct 24', ic: 'NF' },
      { id: 't2', m: 'NORTHSIDE FITNESS', amt: 49.00, d: 'Oct 24', ic: 'NF' },
      { id: 't3', m: 'CITY GROCER #14', amt: 82.15, d: 'Oct 25', ic: 'CG' },
      { id: 't4', m: 'BRIGHTLINE TRANSIT', amt: 2.90, d: 'Oct 26', ic: 'BT' },
      { id: 't5', m: 'CAFE LUMEN', amt: 6.40, d: 'Oct 27', ic: 'CL' },
    ];
    const CATS = {
      fraud: 'I didn’t make or authorize it', duplicate: 'I was charged more than once', non_receipt: 'I paid but never got it',
      not_as_described: 'It wasn’t what was promised', credit_not_processed: 'I returned it or cancelled, but got no refund',
    };
    const CAT_SOUNDS = {
      fraud: 'you didn’t make or authorize this charge', duplicate: 'you were charged more than once for the same purchase', non_receipt: 'you paid but never received what you bought',
      not_as_described: 'what you got wasn’t what was promised', credit_not_processed: 'you returned or cancelled it but didn’t get a refund',
    };
    let s, clock = 0;
    const T = () => { const m = 11 + Math.floor(clock / 2); clock++; return '09:' + String(m).padStart(2, '0'); };
    function reset() {
      s = { state: 'menu', txn: null, cat: null, desc: '', learned: '', unclear: 0, notice: null, submitted: false };
      clock = 0; log.innerHTML = ''; ev.innerHTML = '';
      logEv('conversation.started · principal <code>cust:C-10982</code> · library <code>replies.v1</code> (approved by compliance1)');
      bot('Hi, I’m an automated assistant for card disputes. I can help you report a problem with a charge, check on a dispute, or answer a request we sent you. You can ask for a person at any time. Please don’t type your full card number.', 'greet.v1');
      menu();
    }
    function logEv(html, hl) { const li = document.createElement('li'); li.innerHTML = '<time>' + T() + '</time><span' + (hl ? ' class="hl"' : '') + '>' + html + '</span>'; ev.appendChild(li); ev.scrollTop = ev.scrollHeight; }
    function scroll() { log.scrollTop = log.scrollHeight; }
    function me_(text) { const d = document.createElement('div'); d.className = 'msg me'; d.textContent = text; log.appendChild(d); scroll(); }
    function bot(html, tpl, extra) {
      const d = document.createElement('div'); d.className = 'msg bot'; d.innerHTML = html + (extra || ''); log.appendChild(d); scroll();
      if (tpl) logEv('reply <code>' + tpl + '</code>');
      return d;
    }
    async function botSay(html, tpl, extra) {
      setQuick([]);
      const t = document.createElement('div'); t.className = 'msg bot'; t.style.padding = '0'; t.innerHTML = '<span class="typing" aria-label="Assistant is typing"><i></i><i></i><i></i></span>'; log.appendChild(t); scroll();
      await wait(650); t.remove();
      return bot(html, tpl, extra);
    }
    function setQuick(opts) {
      quick.innerHTML = opts.map((o, i) => '<button type="button" data-q="' + i + '">' + esc(o[0]) + '</button>').join('');
      quick._opts = opts;
    }
    quick.addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (!b) return; const o = quick._opts[+b.dataset.q]; me_(o[0]); o[1](); });
    function menu() { s.state = 'menu'; setQuick([['Report a problem with a charge', startDispute], ['Check on a dispute', status], ['Answer a request you sent me', evidence], ['Talk to a person', handoff]]); }

    async function startDispute(hint) {
      s.state = 'pick_txn';
      logEv('intent <code>start_dispute</code>' + (hint && hint.merchant ? ' · merchant hint <code>' + hint.merchant + '</code>' : ''));
      const list = hint && hint.merchant ? TXNS.filter((t) => t.m.toLowerCase().includes(hint.merchant)) : TXNS;
      const cards = list.map((t) => '<button class="txn-card" data-txn="' + t.id + '"><span class="ic">' + t.ic + '</span><span><b>' + t.m + '</b><span>' + t.d + ', 2026 · debit •••• 7731</span></span><span class="amt">' + money(t.amt) + '</span></button>').join('');
      await botSay(list.length > 1 && hint && hint.merchant ? 'I found ' + list.length + ' charges that may match. Which one is the problem?' : 'Which charge is the problem? Here are your recent transactions.', 'pick_txn.v1', cards);
      if (hint && hint.cat) s.catHint = hint.cat;
      setQuick([['It’s not listed', handoff]]);
    }
    log.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-txn]');
      if (!b || s.state !== 'pick_txn') return;
      const t = TXNS.find((x) => x.id === b.dataset.txn);
      $$('[data-txn]', log).forEach((x) => { x.disabled = true; x.style.opacity = x === b ? '1' : '.45'; });
      me_(t.m + ' · ' + money(t.amt) + ' · ' + t.d + (t.id === 't2' ? ' (second charge)' : ''));
      s.txn = t;
      s.notice = T();
      logEv('slot <code>txn</code> validated against the cardholder’s own transactions');
      logEv('chat.notice_asserted · ' + s.notice + ' ET · the Reg E clock starts here, even if the chat is abandoned (TD-57)', true);
      if (s.catHint) {
        s.state = 'confirm_cat';
        await botSay('Thanks. It sounds like ' + CAT_SOUNDS[s.catHint] + '. Is that right?', 'confirm_category.v1');
        setQuick([['Yes, that’s right', () => { s.cat = s.catHint; logEv('slot <code>category=' + s.cat + '</code> confirmed'); askDesc(); }], ['Something else', askCat]]);
      } else askCat();
    });
    async function askCat() {
      s.state = 'ask_cat';
      await botSay('What went wrong with this charge?', 'ask_category.v1');
      setQuick(Object.keys(CATS).map((k) => [CATS[k], () => { s.cat = k; logEv('slot <code>category=' + k + '</code>'); askDesc(); }]));
    }
    async function askDesc() {
      s.state = 'ask_desc';
      await botSay('Tell us anything else that would help, in your own words. Or tap Skip.', 'ask_description.v1');
      setQuick([['Skip', askLearned]]);
    }
    async function askLearned() {
      s.state = 'ask_learned';
      await botSay('When did you first notice the problem?', 'ask_learned_date.v1');
      const pick = (label, date) => [label, () => { s.learned = date; logEv('slot <code>learned_of_error_on=' + date + '</code>'); summary(); }];
      setQuick([pick('Today', '2026-10-28'), pick('Yesterday', '2026-10-27'), pick('Earlier this week', '2026-10-26'), pick('Last week or before', '2026-10-21')]);
    }
    const fmtDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    async function summary() {
      s.state = 'confirm';
      const card = '<div class="sum-card"><div><span>Charge</span><b>' + s.txn.m + ' · ' + money(s.txn.amt) + '</b></div><div><span>Date</span><b>' + s.txn.d + ', 2026</b></div><div><span>Problem</span><b>' + CATS[s.cat] + '</b></div>' + (s.desc ? '<div><span>Your words</span><b>' + esc(s.desc) + '</b></div>' : '') + '<div><span>First noticed</span><b>' + fmtDate(s.learned) + '</b></div></div>';
      await botSay('Here’s what we’ll submit. Is it right?', 'confirm_summary.v1', card);
      setQuick([['Submit dispute', submit], ['Change something', () => { s.txn = null; s.cat = null; s.desc = ''; s.catHint = null; startDispute(); }]]);
    }
    async function submit() {
      s.state = 'done'; s.submitted = true;
      logEv('chat.submitted → intake command · channel <code>chat</code> · notice_received_at ' + s.notice + ' ET', true);
      logEv('case <code>DSP-2026-000431</code> created · Reg E investigate-or-credit due Thu Nov 12 (10 BD, Veterans Day skipped)');
      await botSay('Your dispute is submitted. Your reference is <span class="ref">DSP-2026-000431</span>. We’ll write to you with an update by <b>Thu, Nov 12, 2026</b>. You can come back here any time to check on it.', 'submitted.v1');
      menu();
    }
    async function status() {
      logEv('intent <code>ask_status</code> · cases looked up for <code>cust:C-10982</code> only');
      if (s.submitted) await botSay('Dispute <span class="ref">DSP-2026-000431</span> (NORTHSIDE FITNESS, ' + money(49) + ') is <b>received and under review</b>. We’ll write to you by Thu, Nov 12, 2026.', 'status.v1');
      else await botSay('You have one open dispute: <span class="ref">DSP-2026-000365</span> (CITY GROCER #14, $82.15) is <b>under review</b>. We’ll write to you by Wed, Nov 4, 2026.', 'status.v1');
      logEv('status label from <code>status_labels.yaml</code>; no outcome stated before an approved letter is sent');
      menu();
    }
    async function evidence() {
      s.state = 'evidence';
      logEv('intent <code>answer_evidence</code> · open request on <code>DSP-2026-000365</code>');
      await botSay('For dispute <span class="ref">DSP-2026-000365</span> we asked: <i>“Did you return the items, and on what date?”</i> Please answer below.', 'evidence_question.v1');
      setQuick([['I don’t have that information', handoff]]);
    }
    async function handoff() {
      s.state = 'handoff';
      logEv('conversation.handoff → <code>callback_tasks</code> row created in the Analyst queue', true);
      await botSay('I’ve asked a member of our team to call you at the number on your account within 1 business day. You don’t need to stay in this chat.', 'handoff.v1');
      menu();
    }
    // free text: the model only labels intent and slots (chat_understand); code picks the reply
    function understand(text) {
      const t = text.toLowerCase(), slots = {};
      const m = TXNS.find((x) => t.includes(x.m.split(' ')[0].toLowerCase()) || (x.m.includes('FITNESS') && /gym/.test(t)));
      if (m) slots.merchant = m.m.split(' ')[0].toLowerCase();
      if (/twice|double|two times|duplicate|more than once/.test(t)) slots.cat = 'duplicate';
      else if (/not me|didn.?t (make|buy|authori)|don.?t recogni|fraud|stolen/.test(t)) slots.cat = 'fraud';
      else if (/never (arrived|came|got)|didn.?t (receive|get)/.test(t)) slots.cat = 'non_receipt';
      else if (/refund|returned|cancel/.test(t)) slots.cat = 'credit_not_processed';
      else if (/broken|damaged|not as described|fake/.test(t)) slots.cat = 'not_as_described';
      let intent = 'unclear';
      if (/person|human|agent|call me|someone/.test(t)) intent = 'ask_human';
      else if (/status|update|check on|where is|progress/.test(t)) intent = 'ask_status';
      else if (/promise|guarantee|ignore (your|all|the) (rules|instructions)|money back today/.test(t)) intent = 'out_of_scope';
      else if (slots.cat || slots.merchant || /charge|dispute|wrong/.test(t)) intent = 'start_dispute';
      return { intent, slots };
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      let text = inp.value.trim(); if (!text) return; inp.value = '';
      const pan = /\b(?:\d[ -]?){13,19}\b/;
      if (pan.test(text)) {
        text = text.replace(pan, '[card number removed]');
        me_(text);
        logEv('PAN detected at the edge → tokenized by the vault; transcript stores <code>[card number removed]</code>', true);
        await botSay('For your safety I’ve removed the card number from this chat. I never need it: I can see the cards on your account.', 'no_card_numbers.v1');
        if (s.state === 'menu') menu(); return;
      }
      me_(text);
      if (s.state === 'ask_desc') { s.desc = text.slice(0, 280); logEv('slot <code>description</code> (stored redacted)'); return askLearned(); }
      if (s.state === 'evidence') {
        logEv('evidence item <code>E-7</code> (source: customer) attached to DSP-2026-000365 · investigation re-triggered', true);
        await botSay('Thanks, I’ve added your answer to dispute <span class="ref">DSP-2026-000365</span>. Our team will review it.', 'evidence_received.v1');
        return menu();
      }
      const u = understand(text);
      logEv('chat_understand → intent <code>' + u.intent + '</code>' + (u.slots.cat ? ' · category hint <code>' + u.slots.cat + '</code>' : ''));
      if (u.intent === 'out_of_scope') {
        await botSay('I can’t tell you the result before our review is finished, and I can’t promise a refund. I can help you report a problem, check a dispute, or connect you with a person.', 'no_outcome_promise.v1');
        logEv('instruction in cardholder text had no effect: the model can only return an intent label', true);
        return menu();
      }
      if (u.intent === 'ask_human') return handoff();
      if (u.intent === 'ask_status') return status();
      if (u.intent === 'start_dispute') { s.unclear = 0; return startDispute(u.slots); }
      s.unclear++;
      if (s.unclear >= 2) { logEv('two unclear messages in a row'); return handoff(); }
      await botSay('Sorry, I didn’t catch that. You can pick one of the options below.', 'unclear.v1');
      if (s.state === 'menu') menu();
    });
    $('#chat-reset').addEventListener('click', reset);
    reset();
  }

  /* ================================================================ boot */
  document.addEventListener('DOMContentLoaded', () => {
    buildShell();
    applyRoleGates();
    $$('[data-theme-toggle]').forEach((b) => b.addEventListener('click', toggleTheme));
    document.addEventListener('keydown', globalKeys);
    const page = document.body.dataset.page;
    ({ signin: pageSignin, queue: pageQueue, case: pageCase, inbox: pageInbox, dashboard: pageDashboard, admin: pageAdmin, audit: pageAudit, intake: pageIntake, portal: pagePortal }[page] || (() => {}))();
  });
})();
