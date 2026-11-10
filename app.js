'use strict';
const APP_V = '202611101514';
/* Glanx Flow — clientes → proyectos → entregables (tablero) → versiones → comentarios con timecode.
   Supabase compartido con Glanx Guiones (tablas flow_*). Vídeos en Google Drive, reproducidos con la API de Drive. */
const SB_URL = 'https://egjzkvlcqqwqxcugsfed.supabase.co', SB_KEY = 'sb_publishable_4LS7xS-Tzm39nRtrFptIFQ_L3FahX4Q';
const GKEY = 'AIzaSyA74refU4Q1B8SUuypff5ngozlw_rJ86Y4';
const driveSrc = id => `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true&key=${GKEY}`;
const driveMeta = id => `https://www.googleapis.com/drive/v3/files/${id}?fields=name,mimeType,size,videoMediaMetadata&supportsAllDrives=true&key=${GKEY}`;

/* ================= utilidades ================= */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const fmtD = d => d ? new Date(d + 'T12:00').toLocaleDateString('es', { day: 'numeric', month: 'short' }) : '';
const fmtDT = ts => ts ? new Date(ts).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const ago = ts => { const s = (Date.now() - new Date(ts)) / 1e3; return s < 60 ? 'ahora' : s < 3600 ? `hace ${Math.floor(s / 60)} min` : s < 86400 ? `hace ${Math.floor(s / 3600)} h` : fmtDT(ts); };
const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const driveId = u => { u = (u || '').trim(); const m = u.match(/\/d\/([\w-]{20,})/) || u.match(/[?&]id=([\w-]{20,})/) || u.match(/^([\w-]{20,})$/); return m && m[1]; };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const ST = [
  ['pendiente', 'Pendiente', '#64748B'], ['por_iniciar', 'Por iniciar', '#8B9BB4'], ['produccion', 'En producción', '#3B82F6'],
  ['edicion', 'En edición', '#6366F1'], ['revision_interna', 'Revisión interna', '#A855F7'], ['revision_cliente', 'Revisión del cliente', '#FF6B1A'],
  ['correcciones', 'Correcciones', '#EF4444'], ['aprobado', 'Aprobado', '#22C55E'], ['entregado', 'Entregado', '#14B8A6']];
const stOf = k => ST.find(s => s[0] === k) || ST[0];
const DONE = ['aprobado', 'entregado'];
const PRI = { baja: ['Baja', '#64748B'], media: ['Media', '#3B82F6'], alta: ['Alta', '#F5B942'], urgente: ['Urgente', '#EF4444'] };
// lo que ve el cliente (sin la cocina interna)
const CST = { pendiente: ['Por empezar', '#8A97AB'], por_iniciar: ['Por empezar', '#8A97AB'], produccion: ['En proceso', '#3B82F6'], edicion: ['En proceso', '#3B82F6'],
  revision_interna: ['En proceso', '#3B82F6'], revision_cliente: ['Para revisar', '#FF6B1A'], correcciones: ['Corrigiendo', '#A855F7'], aprobado: ['Aprobado', '#22C55E'], entregado: ['Entregado', '#14B8A6'] };
const stChip = k => { const s = stOf(k); return `<span class="chip"><span class="dot" style="background:${s[2]}"></span>${s[1]}</span>`; };
const cChip = k => { const s = CST[k] || CST.pendiente; return `<span class="chip"><span class="dot" style="background:${s[1]}"></span>${s[0]}</span>`; };
const late = d => d && d.due_date && d.due_date < today() && !DONE.includes(d.status);

const AVC = ['#FF6B1A', '#3B82F6', '#A855F7', '#22C55E', '#EC4899', '#14B8A6', '#F59E0B', '#6366F1'];
const hash = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const teamName = email => { const t = A.team.find(x => x.email === email); return t ? (t.name || t.email.split('@')[0]) : (email ? email.split('@')[0] : ''); };
const av = (email, lg) => email ? `<span class="av${lg ? ' lg' : ''}" style="background:${AVC[hash(email) % AVC.length]}" title="${esc(teamName(email))}">${esc(initials(teamName(email)))}</span>` : '';

function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = bad ? 'bad' : ''; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, bad ? 5000 : 2600);
}
function dlg(html) {
  const d = $('#dialog'); d.innerHTML = `<div class="dlg">${html}</div>`; d.hidden = false;
  d.onclick = e => { if (e.target === d || e.target.closest('[data-x]')) d.hidden = true; };
  setTimeout(() => $('input,textarea,select', d)?.focus(), 30);
  return d;
}
const closeDlg = () => $('#dialog').hidden = true;
function ask(msg, ok = 'Sí', cls = 'pri') {
  return new Promise(res => {
    const d = dlg(`<p style="margin:0 0 4px">${msg}</p><div class="row end"><button class="btn" data-no>Cancelar</button><button class="btn ${cls}" data-ok>${ok}</button></div>`);
    d.onclick = e => {
      if (e.target.closest('[data-ok]')) { d.hidden = true; res(true); }
      else if (e.target === d || e.target.closest('[data-no]')) { d.hidden = true; res(false); }
    };
  });
}
async function q(p) { const r = await p; if (r.error) { toast('Error: ' + r.error.message, true); throw r.error; } return r.data; }

/* ================= estado y arranque ================= */
const A = { sb: null, user: null, me: null, team: [], clients: [], projects: [], chans: [], timers: [], player: null, cleanup: [] };
const myName = () => A.me?.name || A.user?.user_metadata?.name || A.user?.email?.split('@')[0] || 'Alguien';
const isAdmin = () => A.me?.role === 'admin';

async function init() {
  if (!window.supabase) { $('#app').innerHTML = '<div class="boot">No se pudo cargar (revisa internet) y recarga.</div>'; return; }
  A.sb = supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, storageKey: 'glanx.auth' } });
  const { data } = await A.sb.auth.getSession();
  A.user = data.session?.user || null;
  A.sb.auth.onAuthStateChange((ev, s) => {
    const before = A.user?.id; A.user = s?.user || null;
    if (before !== A.user?.id) { A.me = null; if (!location.hash.startsWith('#/c/')) route(); }
  });
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', keys);
  route();
}

function unmount() {
  A.chans.forEach(c => A.sb.removeChannel(c)); A.chans = [];
  A.timers.forEach(clearInterval); A.timers = [];
  A.cleanup.forEach(f => { try { f(); } catch {} }); A.cleanup = [];
  A.player = null;
}

async function loadBase() {
  const em = (A.user?.email || '').toLowerCase();
  const [t, c, p] = await Promise.all([
    A.sb.from('flow_team').select('*').order('name'),
    A.sb.from('flow_clients').select('*').order('name'),
    A.sb.from('flow_projects').select('*').order('created_at', { ascending: false })]);
  A.team = t.data || []; A.clients = c.data || []; A.projects = p.data || [];
  A.me = A.team.find(x => x.email === em) || null;
}

async function route() {
  unmount();
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'c' && parts[1]) return portal(parts[1], parts[2] === 'e' ? parts[3] : null, parts[4]);
  document.body.classList.remove('portal');
  if (!A.user) return loginView();
  if (!A.me) { await loadBase(); if (!A.me) return noAccessView(); }
  const v = shell(parts[0] || '');
  try {
    switch (parts[0]) {
      case 'proyectos': return await projectsView(v);
      case 'clientes': return parts[1] ? await clientView(v, parts[1]) : await clientsView(v);
      case 'equipo': return await teamView(v);
      case 'p': return await projectView(v, parts[1], parts[2] || 'tablero');
      case 'e': return await delivView(v, parts[1], parts[2]);
      default: return await dashView(v);
    }
  } catch (e) { console.error(e); if (v.isConnected && !v.innerHTML) v.innerHTML = `<div class="empty">Algo falló: ${esc(e.message || e)}</div>`; }
}

/* ================= login y acceso ================= */
const AUTH_ERR = m => /invalid login/i.test(m) ? 'Correo o contraseña incorrectos.' : /already registered|already exists/i.test(m) ? 'Ese correo ya tiene cuenta: entra con tu contraseña.'
  : /at least 6|password should/i.test(m) ? 'La contraseña debe tener al menos 6 caracteres.' : /not confirmed/i.test(m) ? 'Falta confirmar el correo (revisa tu bandeja).'
  : /rate limit|too many/i.test(m) ? 'Demasiados intentos: espera un momento.' : /valid email|invalid email/i.test(m) ? 'Ese correo no es válido.' : m;
const BRAND = `<span class="logo">G</span><b>Glanx <em>Flow</em></b>`;

function loginView() {
  let signup = false;
  $('#app').innerHTML = `<div class="auth"><div class="card">
    <div class="brand">${BRAND}</div>
    <h2 id="lT">Entrar</h2><p class="muted small" style="margin:4px 0 6px">Usa la misma cuenta que en Glanx Guiones.</p>
    <div id="lNw" hidden><label class="lb">Tu nombre</label><input class="inp" id="lN" autocomplete="name"></div>
    <label class="lb">Correo</label><input class="inp" id="lE" type="email" autocomplete="email">
    <label class="lb">Contraseña</label><input class="inp" id="lP" type="password" autocomplete="current-password">
    <p id="lErr" class="small" style="color:var(--bad);min-height:1.3em;margin:8px 0"></p>
    <button class="btn pri" id="lOk" style="width:100%;justify-content:center">Entrar</button>
    <button class="btn ghost" id="lM" style="width:100%;justify-content:center;margin-top:8px">¿No tienes cuenta? Crear una</button>
  </div></div>`;
  $('#lE').focus();
  const go = async () => {
    const email = $('#lE').value.trim().toLowerCase(), password = $('#lP').value, name = $('#lN').value.trim();
    if (!email || !password) return $('#lErr').textContent = 'Escribe tu correo y contraseña.';
    if (signup && !name) return $('#lErr').textContent = 'Escribe tu nombre.';
    $('#lOk').disabled = true; $('#lErr').textContent = '';
    const r = signup ? await A.sb.auth.signUp({ email, password, options: { data: { name } } }) : await A.sb.auth.signInWithPassword({ email, password });
    $('#lOk').disabled = false;
    if (r.error) return $('#lErr').textContent = AUTH_ERR(r.error.message);
    if (signup && !r.data.session) { $('#lErr').style.color = 'var(--ok)'; $('#lErr').textContent = 'Cuenta creada. Confirma el correo y entra.'; }
  };
  $('#lOk').onclick = go;
  $$('.auth input').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') go(); });
  $('#lM').onclick = () => {
    signup = !signup; $('#lNw').hidden = !signup; $('#lT').textContent = signup ? 'Crear cuenta' : 'Entrar';
    $('#lOk').textContent = signup ? 'Crear cuenta' : 'Entrar'; $('#lM').textContent = signup ? 'Ya tengo cuenta' : '¿No tienes cuenta? Crear una';
    $('#lP').autocomplete = signup ? 'new-password' : 'current-password'; (signup ? $('#lN') : $('#lE')).focus();
  };
}

function noAccessView() {
  $('#app').innerHTML = `<div class="auth"><div class="card">
    <div class="brand">${BRAND}</div>
    <h2>Hola, ${esc(myName())}</h2>
    <p class="muted">Tu correo <b>${esc(A.user.email)}</b> todavía no está en el equipo de Glanx Flow. Pide a un admin que te añada en <b>Equipo</b>.</p>
    <p class="muted small">¿Eres la primera persona en entrar? Puedes quedar como admin.</p>
    <div class="row" style="margin-top:14px"><button class="btn pri" id="claim">Soy el primero: hacerme admin</button><span class="spacer"></span><button class="btn ghost" id="out">Salir</button></div>
  </div></div>`;
  $('#out').onclick = () => A.sb.auth.signOut();
  $('#claim').onclick = async () => {
    const r = await q(A.sb.rpc('flow_claim_admin', { nm: myName() }));
    if (r === 'ok') { toast('Listo: eres admin de Glanx Flow'); A.me = null; route(); }
    else toast(r === 'ya hay admin' ? 'Ya hay un admin: pídele que te añada.' : r, true);
  };
}

function shell(sec) {
  if (!$('#shell')) {
    $('#app').innerHTML = `<div id="shell"><aside class="side">
      <a class="brand" href="#/">${BRAND}</a>
      <a class="nav" data-s="" href="#/"><span class="ico">◧</span><span class="lbl">Inicio</span></a>
      <a class="nav" data-s="proyectos" href="#/proyectos"><span class="ico">▦</span><span class="lbl">Proyectos</span></a>
      <a class="nav" data-s="clientes" href="#/clientes"><span class="ico">◉</span><span class="lbl">Clientes</span></a>
      <a class="nav" data-s="equipo" href="#/equipo"><span class="ico">☰</span><span class="lbl">Equipo</span></a>
      <div class="me">${av(A.me.email, 1)}<div class="nm">${esc(myName())}<small>${A.me.role === 'admin' ? 'Admin' : 'Equipo'}</small></div><button class="btn ghost sm" id="out" title="Salir">Salir</button></div>
    </aside><main id="main"></main></div>`;
    $('#out').onclick = () => A.sb.auth.signOut();
  }
  const s = { p: 'proyectos', e: 'proyectos' }[sec] ?? sec;
  $$('.nav').forEach(n => n.classList.toggle('on', n.dataset.s === s));
  const v = document.createElement('div'); v.className = 'view'; $('#main').replaceChildren(v);
  window.scrollTo(0, 0);
  return v;
}

/* ================= inicio ================= */
const ACT = {
  version_nueva: d => `subió la V${d.n}`, enviada_al_cliente: d => `envió la V${d.n} al cliente`, aprobada: d => `✓ aprobó la V${d.n}`,
  estado: d => `movió a «${stOf(d.a)[1]}»`, responsable: d => d.a ? `asignó a ${teamName(d.a)}` : 'quitó el responsable'
};
const actText = (a, titles) => `<b>${esc(a.action === 'aprobada' ? a.detail.por || a.actor : a.actor)}</b> ${esc((ACT[a.action] || (() => a.action))(a.detail || {}))}${titles && a.deliverable_id && titles[a.deliverable_id] ? ` · <a href="#/e/${a.deliverable_id}">${esc(titles[a.deliverable_id])}</a>` : ''}`;

async function dashView(v) {
  const [D, ACTS] = await Promise.all([
    q(A.sb.from('flow_deliverables').select('id,project_id,title,status,assignee,due_date,priority,updated_at')),
    q(A.sb.from('flow_activity').select('*').order('created_at', { ascending: false }).limit(25))]);
  const P = Object.fromEntries(A.projects.map(p => [p.id, p])), titles = Object.fromEntries(D.map(d => [d.id, d.title]));
  const active = A.projects.filter(p => p.status === 'activo');
  const open = D.filter(d => !DONE.includes(d.status) && P[d.project_id]?.status !== 'terminado');
  const mine = open.filter(d => d.assignee === A.me.email).sort((a, b) => (a.due_date || '9') < (b.due_date || '9') ? -1 : 1);
  const intRev = open.filter(d => d.status === 'revision_interna'), cli = open.filter(d => d.status === 'revision_cliente'),
    corr = open.filter(d => d.status === 'correcciones'), lt = open.filter(late);
  const row = d => `<a class="li" href="#/e/${d.id}">${stChip(d.status)}<span class="grow">${esc(d.title)} <span class="dim">· ${esc(P[d.project_id]?.name || '')}</span></span>${d.due_date ? `<span class="small ${late(d) ? 'late' : 'muted'}">${fmtD(d.due_date)}</span>` : ''}${av(d.assignee)}</a>`;
  const attention = [...new Map([...corr, ...intRev, ...lt].map(d => [d.id, d])).values()];
  const load = A.team.map(t => ({ t, n: open.filter(d => d.assignee === t.email).length, l: open.filter(d => d.assignee === t.email && late(d)).length }))
    .sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...load.map(x => x.n));
  v.innerHTML = `<div class="head"><div class="t"><div class="crumb">${new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1>Hola, ${esc(myName().split(' ')[0])}</h1></div>
      <button class="btn pri" id="np">+ Nuevo proyecto</button></div>
    <div class="grid g-tiles" style="margin-bottom:16px">
      <div class="tile"><div class="n">${active.length}</div><div class="l">Proyectos activos</div></div>
      <div class="tile hot"><div class="n">${intRev.length}</div><div class="l">Para revisión interna</div></div>
      <div class="tile"><div class="n">${cli.length}</div><div class="l">Esperando al cliente</div></div>
      <div class="tile"><div class="n">${corr.length}</div><div class="l">Con correcciones</div></div>
      <div class="tile ${lt.length ? 'bad' : ''}"><div class="n">${lt.length}</div><div class="l">Atrasados</div></div>
    </div>
    <div class="grid g-dash">
      <div class="stack">
        <div class="card"><h3>Mis tareas</h3><div class="list">${mine.map(row).join('') || '<div class="empty">No tienes nada asignado.</div>'}</div></div>
        <div class="card"><h3>Necesita atención</h3><div class="list">${attention.map(row).join('') || '<div class="empty">Todo en orden.</div>'}</div></div>
      </div>
      <div class="stack">
        <div class="card"><h3>Carga del equipo</h3><div class="list">${load.map(x => `<div class="li">${av(x.t.email)}<span class="grow">${esc(x.t.name || x.t.email)}${x.t.specialty ? ` <span class="dim small">· ${esc(x.t.specialty)}</span>` : ''}
          <div class="prog" style="margin-top:5px"><i style="width:${x.n / max * 100}%"></i></div></span><span class="small">${x.n}${x.l ? ` · <span class="late">${x.l} tarde</span>` : ''}</span></div>`).join('') || '<div class="empty">Añade a tu equipo en «Equipo».</div>'}</div></div>
        <div class="card"><h3>Actividad reciente</h3><div class="list">${ACTS.map(a => `<div class="li small"><span class="grow" style="white-space:normal">${actText(a, titles)}</span><span class="dim">${ago(a.created_at)}</span></div>`).join('') || '<div class="empty">Sin actividad todavía.</div>'}</div></div>
      </div>
    </div>`;
  $('#np').onclick = () => projectDlg();
}

/* ================= proyectos ================= */
async function projectsView(v) {
  const D = await q(A.sb.from('flow_deliverables').select('project_id,status,due_date'));
  let filter = lsGet('gf.pf', 'activo');
  const C = Object.fromEntries(A.clients.map(c => [c.id, c]));
  const draw = () => {
    const ps = A.projects.filter(p => filter === 'todos' || p.status === filter);
    v.innerHTML = `<div class="head"><div class="t"><h1>Proyectos</h1></div>
      <div class="row"><select class="inp" id="pf" style="width:auto"><option value="activo">Activos</option><option value="pausado">Pausados</option><option value="terminado">Terminados</option><option value="todos">Todos</option></select>
      <button class="btn pri" id="np">+ Nuevo proyecto</button></div></div>
      <div class="grid g-proj">${ps.map(p => {
        const ds = D.filter(d => d.project_id === p.id), done = ds.filter(d => DONE.includes(d.status)).length,
          rev = ds.filter(d => d.status === 'revision_interna' || d.status === 'correcciones').length, lt = ds.filter(late).length;
        return `<a class="pcard" href="#/p/${p.id}"><div class="cl">${esc(C[p.client_id]?.name || 'Interno / personal')}${p.kind ? ' · ' + esc(p.kind) : ''}</div>
          <h3>${esc(p.name)}</h3><div class="prog"><i style="width:${ds.length ? done / ds.length * 100 : 0}%"></i></div>
          <div class="row small muted" style="margin-top:8px"><span>${done}/${ds.length} listos</span>${rev ? `<span style="color:var(--acc)">· ${rev} por revisar</span>` : ''}${lt ? `<span class="late">· ${lt} atrasados</span>` : ''}<span class="spacer"></span>${p.due_date ? `<span>${fmtD(p.due_date)}</span>` : ''}${p.status !== 'activo' ? `<span class="tag">${esc(p.status)}</span>` : ''}</div></a>`;
      }).join('') || '<div class="empty">No hay proyectos aquí.</div>'}</div>`;
    $('#pf').value = filter; $('#pf').onchange = e => { filter = e.target.value; lsSet('gf.pf', filter); draw(); };
    $('#np').onclick = () => projectDlg();
  };
  draw();
}

function projectDlg(p, clientId) {
  const isNew = !p; p = p || { client_id: clientId || null, status: 'activo' };
  const d = dlg(`<h3>${isNew ? 'Nuevo proyecto' : 'Editar proyecto'}</h3>
    <label class="lb">Nombre</label><input class="inp" id="fN" value="${esc(p.name)}" placeholder="Ej.: Reels noviembre">
    <div class="two"><div><label class="lb">Cliente</label><select class="inp" id="fC"><option value="">— Interno / personal —</option>${A.clients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}<option value="__new">+ Cliente nuevo…</option></select></div>
    <div><label class="lb">Tipo</label><input class="inp" id="fK" value="${esc(p.kind)}" placeholder="Reels, videoclip, publicidad…" list="kinds"><datalist id="kinds"><option>Reels</option><option>Redes sociales</option><option>Videoclip</option><option>Publicidad</option><option>Corto</option><option>Diseño</option></datalist></div></div>
    <div class="two"><div><label class="lb">Inicio</label><input class="inp" type="date" id="fS" value="${p.start_date || ''}"></div><div><label class="lb">Entrega</label><input class="inp" type="date" id="fD" value="${p.due_date || ''}"></div></div>
    <label class="lb">Carpeta de Google Drive (enlace)</label><input class="inp" id="fU" value="${esc(p.drive_url)}" placeholder="https://drive.google.com/drive/folders/…">
    ${isNew ? `<div class="two"><div><label class="lb">Crear entregables</label><input class="inp" type="number" min="0" max="60" id="fNn" value="0"></div><div><label class="lb">Nombre base</label><input class="inp" id="fNb" value="Reel"></div></div>
      <p class="small dim" style="margin:6px 0 0">Ej.: 10 y «Reel» crea Reel 01 … Reel 10 en «Pendiente».</p>`
      : `<label class="lb">Estado</label><select class="inp" id="fSt"><option value="activo">Activo</option><option value="pausado">Pausado</option><option value="terminado">Terminado</option></select>`}
    <div class="row end">${!isNew && isAdmin() ? '<button class="btn danger" id="fDel">Borrar</button><span class="spacer"></span>' : ''}<button class="btn" data-x>Cancelar</button><button class="btn pri" id="fOk">${isNew ? 'Crear' : 'Guardar'}</button></div>`);
  $('#fC', d).value = p.client_id || '';
  if (!isNew) $('#fSt', d).value = p.status;
  $('#fC', d).onchange = async e => {
    if (e.target.value !== '__new') return;
    const nm = prompt('Nombre del cliente'); // diálogo nativo: estamos dentro de otro diálogo
    if (!nm) { e.target.value = ''; return; }
    const c = await q(A.sb.from('flow_clients').insert({ name: nm.trim() }).select().single());
    A.clients.push(c); A.clients.sort((a, b) => a.name.localeCompare(b.name));
    e.target.insertAdjacentHTML('beforeend', ''); const o = new Option(c.name, c.id); e.target.add(o, e.target.options.length - 1); e.target.value = c.id;
  };
  $('#fOk', d).onclick = async () => {
    const row = { name: $('#fN', d).value.trim(), client_id: $('#fC', d).value || null, kind: $('#fK', d).value.trim() || null,
      start_date: $('#fS', d).value || null, due_date: $('#fD', d).value || null, drive_url: $('#fU', d).value.trim() || null };
    if (!row.name) return toast('Ponle un nombre', true);
    if (row.client_id === '__new') row.client_id = null;
    $('#fOk', d).disabled = true;
    try {
      if (isNew) {
        const np = await q(A.sb.from('flow_projects').insert(row).select().single());
        const n = Math.min(60, +$('#fNn', d).value || 0), base = $('#fNb', d).value.trim() || 'Entregable';
        if (n) await q(A.sb.from('flow_deliverables').insert(Array.from({ length: n }, (_, i) => ({ project_id: np.id, title: `${base} ${String(i + 1).padStart(2, '0')}`, position: i + 1 }))));
        A.projects.unshift(np); closeDlg(); location.hash = '#/p/' + np.id;
      } else {
        row.status = $('#fSt', d).value;
        const up = await q(A.sb.from('flow_projects').update(row).eq('id', p.id).select().single());
        Object.assign(p, up); closeDlg(); route();
      }
    } finally { $('#fOk', d).disabled = false; }
  };
  $('#fDel', d)?.addEventListener('click', async () => {
    closeDlg();
    if (!(await ask(`¿Borrar el proyecto <b>${esc(p.name)}</b> con todos sus entregables, versiones y comentarios? Los archivos de Drive no se tocan.`, 'Borrar', 'danger'))) return;
    await q(A.sb.from('flow_projects').delete().eq('id', p.id));
    A.projects = A.projects.filter(x => x.id !== p.id); location.hash = '#/proyectos';
  });
}

// proyecto en memoria o, si se creó en otra pestaña / por otra persona, recién pedido
async function getProject(pid) {
  let p = A.projects.find(x => x.id === pid);
  if (!p) { p = await q(A.sb.from('flow_projects').select('*').eq('id', pid).maybeSingle()); if (p) { A.projects.unshift(p); await loadBase(); p = A.projects.find(x => x.id === pid); } }
  return p;
}
async function projectView(v, pid, tab) {
  const p = await getProject(pid);
  if (!p) { v.innerHTML = '<div class="empty">Proyecto no encontrado.</div>'; return; }
  const c = A.clients.find(x => x.id === p.client_id);
  v.classList.add('wide');
  v.innerHTML = `<div class="head"><div class="t"><div class="crumb"><a href="#/proyectos">Proyectos</a> · ${c ? `<a href="#/clientes/${c.id}">${esc(c.name)}</a>` : 'Interno / personal'}</div>
      <h1>${esc(p.name)}</h1></div>
      <div class="row">${p.drive_url ? `<a class="btn" href="${esc(p.drive_url)}" target="_blank" rel="noopener">📁 Drive</a>` : ''}
      ${c ? '<button class="btn" id="share">🔗 Enlace del cliente</button>' : ''}<button class="btn" id="edit">Editar</button></div></div>
    <div class="tabs">${[['tablero', 'Tablero'], ['docs', 'Documentos'], ['actividad', 'Actividad']].map(([k, l]) => `<a href="#/p/${pid}/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</div>
    <div id="pbody"></div>`;
  $('#edit').onclick = () => projectDlg(p);
  $('#share')?.addEventListener('click', () => shareDlg(p));
  const b = $('#pbody');
  if (tab === 'docs') return docsView(b, p);
  if (tab === 'actividad') return activityView(b, p);
  return boardView(b, p);
}

function portalUrl(p) { return location.origin + location.pathname + '#/c/' + p.share_token; }
function shareDlg(p) {
  const u = portalUrl(p);
  const d = dlg(`<h3>Enlace del cliente</h3><p class="muted small">Con este enlace el cliente ve sus piezas, revisa las versiones que le envíes, comenta y aprueba. No necesita cuenta. No lo publiques: quien lo tenga entra.</p>
    <input class="inp tc" readonly value="${esc(u)}" id="su"><div class="row end"><a class="btn" href="${esc(u)}" target="_blank">Abrir como cliente</a><button class="btn pri" id="cp">Copiar</button></div>`);
  $('#su', d).select();
  $('#cp', d).onclick = async () => { try { await navigator.clipboard.writeText(u); toast('Enlace copiado'); } catch { $('#su', d).select(); document.execCommand('copy'); toast('Enlace copiado'); } };
}

/* ---------- tablero ---------- */
async function boardView(el, p) {
  let D = [], V = [];
  const load = async () => {
    [D, V] = await Promise.all([
      q(A.sb.from('flow_deliverables').select('*').eq('project_id', p.id).order('position')),
      q(A.sb.from('flow_versions').select('deliverable_id,n,approved_at,shared_with_client').eq('project_id', p.id))]);
  };
  await load();
  const draw = () => {
    if (!el.isConnected) return;
    el.innerHTML = `<div class="board">${ST.map(([k, l, col]) => {
      const cards = D.filter(d => d.status === k).sort((a, b) => a.position - b.position);
      return `<div class="col" data-st="${k}"><div class="col-h"><span class="dot" style="background:${col}"></span>${l}<span class="n">${cards.length}</span></div>
        <div class="col-b">${cards.map(card).join('')}<div class="add-card" data-add="${k}">+ Añadir</div></div></div>`;
    }).join('')}</div>`;
  };
  const card = d => {
    const vs = V.filter(x => x.deliverable_id === d.id), vn = vs.length ? Math.max(...vs.map(x => x.n)) : 0;
    return `<div class="kc" draggable="true" data-id="${d.id}"><div class="tt">${esc(d.title)}</div><div class="mt">
      ${d.priority !== 'media' ? `<span class="dot" style="background:${PRI[d.priority][1]}" title="Prioridad ${PRI[d.priority][0]}"></span>` : ''}
      ${vn ? `<span class="tag">V${vn}</span>` : ''}${d.checklist?.length ? `<span>☑ ${d.checklist.filter(x => x.done).length}/${d.checklist.length}</span>` : ''}
      ${d.due_date ? `<span class="${late(d) ? 'late' : ''}">${fmtD(d.due_date)}</span>` : ''}${av(d.assignee)}</div></div>`;
  };
  draw();
  let dragId = null;
  el.addEventListener('click', async e => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const st = add.dataset.add; add.outerHTML = `<input class="inp" data-new="${st}" placeholder="Nombre y Enter">`;
      const inp = $(`[data-new="${st}"]`, el); inp.focus();
      const done = async save => {
        const t = inp.value.trim(); inp.onblur = null;
        if (save && t) {
          const pos = Math.max(0, ...D.map(x => x.position)) + 1;
          const nd = await q(A.sb.from('flow_deliverables').insert({ project_id: p.id, title: t, status: st, position: pos }).select().single());
          D.push(nd);
        }
        draw();
        if (save && t) $(`[data-add="${st}"]`, el)?.click();
      };
      inp.onkeydown = ev => { if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); };
      inp.onblur = () => done(true);
      return;
    }
    const kc = e.target.closest('.kc'); if (kc) location.hash = '#/e/' + kc.dataset.id;
  });
  el.addEventListener('dragstart', e => { const kc = e.target.closest('.kc'); if (!kc) return; dragId = kc.dataset.id; kc.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); });
  el.addEventListener('dragend', () => { dragId = null; $$('.kc.drag,.col.over', el).forEach(x => x.classList.remove('drag', 'over')); $$('.kph', el).forEach(x => x.remove()); });
  el.addEventListener('dragover', e => {
    const col = e.target.closest('.col'); if (!col || !dragId) return; e.preventDefault();
    $$('.col.over', el).forEach(x => x !== col && x.classList.remove('over')); col.classList.add('over');
    $$('.kph', el).forEach(x => x.remove());
    const before = [...$$('.kc', col)].find(k => k.dataset.id !== dragId && e.clientY < k.getBoundingClientRect().top + k.offsetHeight / 2);
    const ph = document.createElement('div'); ph.className = 'kph';
    before ? before.before(ph) : $('.add-card', col)?.before(ph);
  });
  el.addEventListener('drop', async e => {
    const col = e.target.closest('.col'); if (!col || !dragId) return; e.preventDefault();
    const st = col.dataset.st, d = D.find(x => x.id === dragId); if (!d) return;
    const ph = $('.kph', col), next = ph?.nextElementSibling?.classList.contains('kc') ? D.find(x => x.id === ph.nextElementSibling.dataset.id) : null;
    const colCards = D.filter(x => x.status === st && x.id !== d.id).sort((a, b) => a.position - b.position);
    let pos;
    if (next) { const i = colCards.indexOf(next); const prev = colCards[i - 1]; pos = prev ? (prev.position + next.position) / 2 : next.position - 1; }
    else pos = colCards.length ? colCards[colCards.length - 1].position + 1 : 1;
    const changed = d.status !== st; d.status = st; d.position = pos; draw();
    await q(A.sb.from('flow_deliverables').update({ status: st, position: pos, updated_at: new Date().toISOString() }).eq('id', d.id));
    if (changed && st === 'revision_cliente' && !V.some(x => x.deliverable_id === d.id && x.shared_with_client)) toast('Ojo: el cliente aún no tiene ninguna versión de esta pieza para revisar.');
  });
  const refresh = debounce(async () => { if (dragId) return; await load(); draw(); }, 400);
  A.chans.push(A.sb.channel('b-' + p.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'flow_deliverables', filter: `project_id=eq.${p.id}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'flow_versions', filter: `project_id=eq.${p.id}` }, refresh).subscribe());
}

/* ---------- documentos ---------- */
const TPL = {
  brief: ['Brief', '# Brief\n\n## Objetivo\n\n## Público\n\n## Mensaje principal\n\n## Entregables y formatos\n- \n\n## Tono y estilo\n\n## Referencias\n- \n\n## Fechas clave\n\n## Lo que el cliente NO quiere\n'],
  referencias: ['Referencias', '# Referencias visuales\n\nPega enlaces (Instagram, TikTok, YouTube, Pinterest) y qué nos gusta de cada uno.\n\n- \n'],
  reunion: ['Reunión', () => `# Reunión ${new Date().toLocaleDateString('es')}\n\n**Asistentes:** \n\n## Temas\n- \n\n## Decisiones del cliente\n- \n\n## Pendientes\n- [ ] \n`],
  guion: ['Guion', '# Guion\n\nEl guion completo está en Glanx Guiones: https://virtualtut.github.io/glanx-guiones/\n\n## Resumen\n'],
  tecnica: ['Info técnica', '# Información técnica\n\n- Formato: 9:16\n- Duración: \n- Resolución de entrega: 1080×1920\n- Tipografías: \n- Colores: \n- Música: \n'],
  notas: ['Notas internas', '# Notas internas\n\n'], blank: ['Página en blanco', '']
};
function md(src) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  let out = '', inList = false;
  for (const line of String(src || '').split('\n')) {
    const li = line.match(/^\s*[-*]\s+(.*)/);
    if (li && !inList) { out += '<ul>'; inList = true; } if (!li && inList) { out += '</ul>'; inList = false; }
    if (li) { const b = li[1].match(/^\[( |x)\]\s?(.*)/i); out += `<li>${b ? `<span class="box${b[1].toLowerCase() === 'x' ? ' x' : ''}"></span>${inline(b[2])}` : inline(li[1])}</li>`; continue; }
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) out += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; else if (line.trim()) out += `<p>${inline(line)}</p>`;
  }
  return out + (inList ? '</ul>' : '');
}
async function docsView(el, p) {
  let pages = await q(A.sb.from('flow_pages').select('*').eq('project_id', p.id).order('position'));
  let cur = pages.find(x => x.id === lsGet('gf.pg.' + p.id)) || pages[0] || null, editing = false;
  const save = debounce(async () => {
    if (!cur) return; $('#dsv') && ($('#dsv').textContent = 'Guardando…');
    await q(A.sb.from('flow_pages').update({ title: cur.title, kind: cur.kind, content: cur.content, updated_at: new Date().toISOString(), updated_by: myName() }).eq('id', cur.id));
    $('#dsv') && ($('#dsv').textContent = 'Guardado');
  }, 700);
  const draw = () => {
    el.innerHTML = `<div class="docs"><div class="card" style="padding:8px">${pages.map(x => `<div class="pg ${x === cur ? 'on' : ''}" data-pg="${x.id}">${esc(x.title)}</div>`).join('')}
        <div class="pg" id="newpg" style="color:var(--acc)">+ Nueva página</div></div>
      <div class="card">${cur ? `<div class="row" style="margin-bottom:10px"><input class="title-inp" id="dT" value="${esc(cur.title)}" style="flex:1;font-size:19px">
          <span class="small dim" id="dsv">${cur.updated_by ? `${esc(cur.updated_by)} · ${ago(cur.updated_at)}` : ''}</span>
          <button class="btn sm ${editing ? 'on' : ''}" id="dE">${editing ? 'Ver' : 'Editar'}</button><button class="btn sm ghost" id="dDel">Borrar</button></div>
          ${editing ? `<div class="doc-ed"><textarea class="inp" id="dC">${esc(cur.content?.text || '')}</textarea><p class="small dim">Formato: # Título · ## Sección · - lista · - [ ] tarea · **negrita**. Los enlaces se abren solos.</p></div>`
            : `<div class="md">${md(cur.content?.text) || '<p class="dim">Página vacía. Pulsa «Editar».</p>'}</div>`}`
        : '<div class="empty">Aún no hay documentos. Empieza por el brief.</div>'}</div></div>`;
    if (!cur) return;
    $('#dT').oninput = e => { cur.title = e.target.value; save(); $(`[data-pg="${cur.id}"]`).textContent = cur.title; };
    $('#dE').onclick = () => { editing = !editing; draw(); if (editing) $('#dC').focus(); };
    if (editing) $('#dC').oninput = e => { cur.content = { ...(cur.content || {}), text: e.target.value }; save(); };
    $('#dDel').onclick = async () => {
      if (!(await ask(`¿Borrar la página «${esc(cur.title)}»?`, 'Borrar', 'danger'))) return;
      await q(A.sb.from('flow_pages').delete().eq('id', cur.id)); pages = pages.filter(x => x !== cur); cur = pages[0] || null; draw();
    };
  };
  el.addEventListener('click', e => {
    const pg = e.target.closest('[data-pg]');
    if (pg) { cur = pages.find(x => x.id === pg.dataset.pg); lsSet('gf.pg.' + p.id, cur.id); editing = false; draw(); return; }
    if (e.target.closest('#newpg')) {
      const d = dlg(`<h3>Nueva página</h3><div class="list">${Object.entries(TPL).map(([k, [l]]) => `<a class="li" href="javascript:void 0" data-t="${k}"><span class="grow">${l}</span></a>`).join('')}</div><div class="row end"><button class="btn" data-x>Cancelar</button></div>`);
      d.onclick = async ev => {
        if (ev.target === d || ev.target.closest('[data-x]')) return closeDlg();
        const t = ev.target.closest('[data-t]'); if (!t) return;
        closeDlg(); const [l, body] = TPL[t.dataset.t];
        const np = await q(A.sb.from('flow_pages').insert({ project_id: p.id, title: l, kind: t.dataset.t, content: { text: typeof body === 'function' ? body() : body }, position: pages.length + 1, updated_by: myName() }).select().single());
        pages.push(np); cur = np; lsSet('gf.pg.' + p.id, np.id); editing = true; draw(); $('#dC')?.focus();
      };
    }
  });
  draw();
}

async function activityView(el, p) {
  const [acts, D] = await Promise.all([q(A.sb.from('flow_activity').select('*').eq('project_id', p.id).order('created_at', { ascending: false }).limit(200)),
    q(A.sb.from('flow_deliverables').select('id,title').eq('project_id', p.id))]);
  const titles = Object.fromEntries(D.map(d => [d.id, d.title]));
  el.innerHTML = `<div class="card" style="max-width:900px"><div class="list">${acts.map(a => `<div class="li small"><span class="grow" style="white-space:normal">${actText(a, titles)}</span><span class="dim">${fmtDT(a.created_at)}</span></div>`).join('') || '<div class="empty">Sin actividad todavía.</div>'}</div></div>`;
}

/* ================= reproductor (equipo y cliente) ================= */
function makePlayer(host, fileId, opts = {}) {
  host.innerHTML = `<div class="stage"><video playsinline preload="auto"></video><canvas hidden></canvas><div class="pl-msg" hidden></div></div>
    <div class="bar"><div class="track"></div><div class="buf"></div><div class="pr"></div><div class="mks"></div></div>
    <div class="pl-ctl"><button class="btn sm" data-a="play">▶</button><button class="btn sm" data-a="b" title="Fotograma anterior (,)">◀ 1f</button><button class="btn sm" data-a="f" title="Fotograma siguiente (.)">1f ▶</button>
      <span class="tc small" data-tc>00:00:00 / 00:00:00</span><span class="spacer"></span>
      ${opts.noTools ? '' : `<label class="small muted">fps <select data-fps>${[24, 25, 30, 60].map(f => `<option>${f}</option>`).join('')}</select></label>
      <button class="btn sm" data-a="mute" title="Sonido">🔊</button><button class="btn sm" data-a="pen" title="Dibujar sobre el fotograma">✎ Dibujar</button><button class="btn sm ghost" data-a="clr" hidden>Borrar dibujo</button>`}
      <button class="btn sm" data-a="fs" title="Pantalla completa">⛶</button></div>`;
  const v = $('video', host), cv = $('canvas', host), ctx = cv.getContext('2d'), stage = $('.stage', host), msg = $('.pl-msg', host);
  const P = { v, pen: false, ink: false, marks: [], onMark: null };
  let fps = +lsGet('gf.fps', 30);
  const fsel = $('[data-fps]', host); if (fsel) { fsel.value = fps; fsel.onchange = () => { fps = +fsel.value; lsSet('gf.fps', fps); tick(); }; }
  P.tc = t => { if (!isFinite(t)) t = 0; const f = Math.floor((t % 1) * fps + 1e-6), s = Math.floor(t) % 60, m = Math.floor(t / 60); return [m, s, f].map(n => String(n).padStart(2, '0')).join(':'); };
  v.src = driveSrc(fileId);
  v.addEventListener('error', () => { msg.hidden = false; msg.textContent = 'No se pudo reproducir este vídeo. Comprueba en Drive que esté compartido como «Cualquier persona con el enlace» y que sea mp4.'; });
  v.addEventListener('loadedmetadata', () => { fit(); drawMarks(); tick(); });
  v.addEventListener('waiting', () => { msg.hidden = false; msg.textContent = 'Cargando…'; });
  v.addEventListener('playing', () => msg.hidden = true); v.addEventListener('seeked', () => { if (v.readyState >= 3) msg.hidden = true; });
  v.addEventListener('canplay', () => msg.hidden = true);
  v.addEventListener('play', () => { $('[data-a=play]', host).textContent = '❚❚'; if (!P.pen) clearInk(); });
  v.addEventListener('pause', () => $('[data-a=play]', host).textContent = '▶');
  const tick = () => {
    const d = v.duration || 1; $('.pr', host).style.width = (v.currentTime / d * 100) + '%';
    if (v.buffered.length) $('.buf', host).style.width = (v.buffered.end(v.buffered.length - 1) / d * 100) + '%';
    $('[data-tc]', host).textContent = P.tc(v.currentTime) + ' / ' + P.tc(v.duration);
    opts.onTime?.(v.currentTime);
  };
  v.addEventListener('timeupdate', tick); v.addEventListener('progress', tick); v.addEventListener('seeked', tick);
  function fit() {
    const r = v.getBoundingClientRect(), sr = stage.getBoundingClientRect(); if (!r.width) return;
    const keep = P.ink ? cv.toDataURL() : null;
    Object.assign(cv.style, { left: (r.left - sr.left) + 'px', top: (r.top - sr.top) + 'px', width: r.width + 'px', height: r.height + 'px' });
    cv.width = r.width; cv.height = r.height; ctx.lineWidth = Math.max(3, r.width / 180); ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = '#FF3B30';
    if (keep) { const i = new Image(); i.onload = () => ctx.drawImage(i, 0, 0, cv.width, cv.height); i.src = keep; }
  }
  const ro = new ResizeObserver(fit); ro.observe(stage);
  function clearInk() { ctx.clearRect(0, 0, cv.width, cv.height); P.ink = false; cv.hidden = !P.pen; const c = $('[data-a=clr]', host); if (c) c.hidden = true; }
  P.clearInk = clearInk;
  P.showInk = url => { fit(); ctx.clearRect(0, 0, cv.width, cv.height); P.ink = false; cv.hidden = !url && !P.pen; if (url) { const i = new Image(); i.onload = () => ctx.drawImage(i, 0, 0, cv.width, cv.height); i.src = url; } };
  P.takeInk = () => { if (!P.ink) return null; const o = document.createElement('canvas'), k = Math.min(1, 540 / cv.width); o.width = cv.width * k; o.height = cv.height * k; o.getContext('2d').drawImage(cv, 0, 0, o.width, o.height); return o.toDataURL('image/png'); };
  P.setPen = on => { P.pen = on; const b = $('[data-a=pen]', host); b?.classList.toggle('on', on); cv.hidden = !on && !P.ink; cv.style.cursor = on ? 'crosshair' : ''; if (on) { v.pause(); fit(); } };
  let drawing = false;
  cv.onpointerdown = e => { if (!P.pen) return; drawing = true; cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); };
  cv.onpointermove = e => { if (!drawing) return; ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); P.ink = true; const c = $('[data-a=clr]', host); if (c) c.hidden = false; };
  cv.onpointerup = () => drawing = false;
  P.step = n => { v.pause(); v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + n / fps + 1e-4)); };
  P.seek = t => { v.pause(); v.currentTime = t; };
  P.toggle = () => v.paused ? v.play() : v.pause();
  P.setMarks = (list, onClick) => { P.marks = list; P.onMark = onClick; drawMarks(); };
  function drawMarks() {
    const box = $('.mks', host); box.innerHTML = ''; if (!v.duration) return;
    P.marks.forEach(m => { const e = document.createElement('div'); e.className = 'mk ' + (m.cls || ''); e.style.left = (m.t / v.duration * 100) + '%'; e.title = P.tc(m.t) + ' · ' + m.label; e.onclick = ev => { ev.stopPropagation(); P.onMark?.(m); }; box.appendChild(e); });
  }
  $('.bar', host).onclick = e => { const r = e.currentTarget.getBoundingClientRect(); v.currentTime = (e.clientX - r.left) / r.width * (v.duration || 0); };
  $('.pl-ctl', host).onclick = e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'play') P.toggle(); if (a === 'b') P.step(-1); if (a === 'f') P.step(1);
    if (a === 'pen') P.setPen(!P.pen); if (a === 'clr') clearInk();
    if (a === 'mute') { v.muted = !v.muted; e.target.textContent = v.muted ? '🔇' : '🔊'; }
    if (a === 'fs') (stage.requestFullscreen || stage.webkitRequestFullscreen)?.call(stage);
  };
  P.destroy = () => { ro.disconnect(); v.pause(); v.removeAttribute('src'); v.load(); };
  A.cleanup.push(P.destroy);
  return P;
}
function keys(e) {
  const P = A.player; if (!P || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || !$('#dialog').hidden) return;
  if (e.code === 'Space') { e.preventDefault(); P.toggle(); }
  else if (e.key === ',') P.step(-1); else if (e.key === '.') P.step(1);
  else if (e.key === 'ArrowLeft') { P.v.currentTime = Math.max(0, P.v.currentTime - 2); } else if (e.key === 'ArrowRight') { P.v.currentTime += 2; }
  else if (e.key.toLowerCase() === 'c') { e.preventDefault(); P.v.pause(); $('#cTxt')?.focus(); }
}

/* ---------- lista de comentarios (compartida por equipo y portal) ---------- */
const pend = list => { const n = list.filter(c => !c.parent_id && !c.resolved).length; return n ? `${n} pendiente${n > 1 ? 's' : ''}` : 'todo resuelto'; };
function commentsHtml(list, P, { client, showRes, sel }) {
  const vis = list.filter(c => !c.parent_id && (showRes || !c.resolved)).sort((a, b) => (a.t ?? 1e9) - (b.t ?? 1e9) || new Date(a.created_at) - new Date(b.created_at));
  if (!vis.length) return `<div class="empty small">${list.length ? 'Todo resuelto.' : client ? 'Pausa el vídeo donde quieras y escribe tu corrección.' : 'Sin comentarios en esta versión.'}</div>`;
  return vis.map(c => {
    const replies = list.filter(r => r.parent_id === c.id);
    return `<div class="cm ${c.resolved ? 'done' : ''} ${c.internal ? 'int' : ''} ${sel === c.id ? 'sel' : ''}" data-c="${c.id}">
      <div class="h">${c.t != null ? `<span class="tc">${P ? P.tc(c.t) : ''}</span>` : ''}<b style="color:var(--tx)">${esc(c.author_name || '')}</b>
        ${c.from_client ? '<span class="tag cli">Cliente</span>' : client ? '<span class="tag">Glanx</span>' : ''}${c.internal ? '<span class="tag int">Interna</span>' : ''}${c.ink ? '<span title="Tiene dibujo">✎</span>' : ''}
        <span class="spacer"></span>${c.resolved ? '<span style="color:var(--ok)">✓ Resuelto</span>' : ''}</div>
      <div class="b">${esc(c.body)}</div>
      ${replies.map(r => `<div class="small" style="margin-top:6px;padding-left:10px;border-left:2px solid var(--line2)"><b>${esc(r.author_name)}</b> ${r.from_client ? '<span class="tag cli">Cliente</span>' : ''} ${esc(r.body)}</div>`).join('')}
      ${client ? '' : `<div class="acts"><button class="btn sm" data-ca="res">${c.resolved ? 'Reabrir' : '✓ Resolver'}</button><button class="btn sm ghost" data-ca="rep">Responder</button>${c.author_email === A.me?.email || isAdmin() ? '<button class="btn sm ghost" data-ca="del">Borrar</button>' : ''}</div>`}
    </div>`;
  }).join('');
}

/* ================= entregable + revisión (equipo) ================= */
async function delivView(v, did, vid) {
  v.classList.add('wide');
  let d = await q(A.sb.from('flow_deliverables').select('*').eq('id', did).maybeSingle());
  if (!d) { v.innerHTML = '<div class="empty">Entregable no encontrado.</div>'; return; }
  const p = (await getProject(d.project_id)) || {};
  let V = [], C = [], acts = [], cur = null, showRes = false, cmp = false, P = null, P2 = null, selC = null, replyTo = null;
  const loadV = async () => { V = await q(A.sb.from('flow_versions').select('*').eq('deliverable_id', did).order('n')); };
  const loadC = async () => { C = V.length ? await q(A.sb.from('flow_comments').select('*').in('version_id', V.map(x => x.id)).order('created_at')) : []; };
  const loadA = async () => { acts = await q(A.sb.from('flow_activity').select('*').eq('deliverable_id', did).order('created_at', { ascending: false }).limit(30)); };
  await loadV(); await Promise.all([loadC(), loadA()]);
  cur = V.find(x => x.id === vid) || V[V.length - 1] || null;
  if (!v.isConnected) return;

  v.innerHTML = `<div class="crumb"><a href="#/proyectos">Proyectos</a> · <a href="#/p/${p.id}">${esc(p.name || '')}</a></div>
    <input class="title-inp" id="eT" value="${esc(d.title)}">
    <div class="props">
      <label>Estado<select class="inp" id="eS">${ST.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label>Responsable<select class="inp" id="eA"><option value="">— Sin asignar —</option>${A.team.map(t => `<option value="${esc(t.email)}">${esc(t.name || t.email)}${t.specialty ? ' · ' + esc(t.specialty) : ''}</option>`).join('')}</select></label>
      <label>Entrega<input class="inp" type="date" id="eD" value="${d.due_date || ''}"></label>
      <label>Prioridad<select class="inp" id="eP">${Object.entries(PRI).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
    </div>
    <div class="rv"><div class="stack">
        <div class="vbar" id="vbar"></div><div id="vban"></div><div class="player" id="pl"></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
          <div class="card"><h3>Descripción</h3><textarea class="inp" id="eDesc" placeholder="Qué hay que hacer, enlaces al material, referencias…">${esc(d.description || '')}</textarea></div>
          <div class="card"><h3>Checklist</h3><div id="ck"></div><input class="inp" id="ckNew" placeholder="+ Añadir paso y Enter" style="margin-top:6px"></div>
        </div>
        <div class="card"><h3>Historial</h3><div class="list" id="eAct"></div></div>
      </div>
      <div class="cpanel"><div class="row"><h3 style="margin:0">Comentarios</h3><span class="small muted" id="cCount"></span><span class="spacer"></span><label class="chk"><input type="checkbox" id="cRes"> Resueltos</label></div>
        <div class="clist" id="cl"></div>
        <div class="composer" id="comp"></div></div>
    </div>`;
  $('#eS').value = d.status; $('#eA').value = d.assignee || ''; $('#eP').value = d.priority;
  const upd = async patch => { Object.assign(d, patch); await q(A.sb.from('flow_deliverables').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', did)); };
  $('#eT').onchange = e => e.target.value.trim() && upd({ title: e.target.value.trim() });
  $('#eS').onchange = e => upd({ status: e.target.value }).then(() => setTimeout(() => loadA().then(drawAct), 400));
  $('#eA').onchange = e => upd({ assignee: e.target.value || null }).then(() => setTimeout(() => loadA().then(drawAct), 400));
  $('#eD').onchange = e => upd({ due_date: e.target.value || null });
  $('#eP').onchange = e => upd({ priority: e.target.value });
  $('#eDesc').oninput = debounce(e => upd({ description: e.target.value }), 700);

  const drawCk = () => {
    const ck = d.checklist || [];
    $('#ck').innerHTML = ck.map((x, i) => `<label class="ck ${x.done ? 'done' : ''}"><input type="checkbox" data-i="${i}" ${x.done ? 'checked' : ''}><span>${esc(x.t)}</span><span class="x" data-del="${i}">✕</span></label>`).join('') || '<div class="small dim">Sin pasos.</div>';
  };
  $('#ck').onclick = e => {
    const del = e.target.closest('[data-del]'); if (del) { e.preventDefault(); d.checklist.splice(+del.dataset.del, 1); upd({ checklist: d.checklist }); drawCk(); return; }
    const cb = e.target.closest('input[data-i]'); if (cb) { d.checklist[+cb.dataset.i].done = cb.checked; upd({ checklist: d.checklist }); drawCk(); }
  };
  $('#ckNew').onkeydown = e => { if (e.key !== 'Enter' || !e.target.value.trim()) return; d.checklist = [...(d.checklist || []), { t: e.target.value.trim(), done: false }]; e.target.value = ''; upd({ checklist: d.checklist }); drawCk(); };
  const drawAct = () => { $('#eAct').innerHTML = acts.map(a => `<div class="li small"><span class="grow" style="white-space:normal">${actText(a)}</span><span class="dim">${fmtDT(a.created_at)}</span></div>`).join('') || '<div class="empty small">Sin movimientos.</div>'; };

  const drawVbar = () => {
    $('#vbar').innerHTML = V.map(x => `<span class="vchip ${x === cur ? 'on' : ''}" data-v="${x.id}"><span class="dot" style="background:${x.approved_at ? 'var(--ok)' : x.shared_with_client ? 'var(--acc)' : 'var(--dim)'}"></span>V${x.n}</span>`).join('')
      + `<button class="btn sm pri" id="nv">+ Nueva versión</button>${V.length > 1 ? `<button class="btn sm ${cmp ? 'on' : ''}" id="cmpB">⇆ Comparar</button>` : ''}<span class="spacer"></span>${cur ? `<a class="btn sm ghost" href="https://drive.google.com/file/d/${cur.drive_file_id}/view" target="_blank" rel="noopener">Abrir en Drive</a>` : ''}`;
    const x = cur;
    $('#vban').innerHTML = !x ? '' : x.approved_at ? `<div class="banner ok">✓ <b>Aprobada por ${esc(x.approved_by_name)}</b> el ${fmtDT(x.approved_at)}. Esta versión ya no se puede cambiar.</div>`
      : x.shared_with_client ? `<div class="banner acc">El cliente ya puede ver la <b>V${x.n}</b>${x.internal_ok_by ? ` (la envió ${esc(x.internal_ok_by)})` : ''}.<span class="spacer"></span>${p.share_token ? `<a class="btn sm" href="${esc(portalUrl(p))}/e/${did}" target="_blank">Ver como cliente</a>` : ''}</div>`
      : `<div class="banner"><span>Solo la ve el equipo. Subida por ${esc(x.uploaded_by || '')} · ${ago(x.created_at)}${x.notes ? ` · «${esc(x.notes)}»` : ''}</span><span class="spacer"></span><button class="btn sm pri" id="okInt">✓ Dar por buena y enviar al cliente</button></div>`;
  };
  const drawPlayer = () => {
    const host = $('#pl');
    if (!cur) { host.innerHTML = `<div class="empty">Aún no hay versiones. Sube el vídeo a Drive (mp4 ligero para revisión), compártelo como «Cualquier persona con el enlace» y pulsa <b>+ Nueva versión</b>.</div>`; A.player = P = null; return; }
    A.cleanup.forEach(f => f()); A.cleanup = [];
    if (cmp && V.length > 1) {
      const i = V.indexOf(cur), other = i > 0 ? V[i - 1] : V[1];
      host.innerHTML = `<div class="cmp"><div><div class="lbl">V${other.n}</div><div id="plB"></div></div><div><div class="lbl" style="color:var(--acc)">V${cur.n}</div><div id="plA"></div></div></div>`;
      P2 = makePlayer($('#plB'), other.drive_file_id, { noTools: true });
      P = makePlayer($('#plA'), cur.drive_file_id, { onTime: t => $('#cAt') && ($('#cAt').textContent = P.tc(t)) });
      P.v.addEventListener('play', () => P2.v.play()); P.v.addEventListener('pause', () => P2.v.pause());
      P.v.addEventListener('seeked', () => { if (Math.abs(P2.v.currentTime - P.v.currentTime) > .04) P2.v.currentTime = P.v.currentTime; });
      P2.v.muted = true;
    } else { host.innerHTML = '<div id="plA"></div>'; P = makePlayer($('#plA'), cur.drive_file_id, { onTime: t => $('#cAt') && ($('#cAt').textContent = P.tc(t)) }); }
    A.player = P;
  };
  const curC = () => cur ? C.filter(c => c.version_id === cur.id) : [];
  const drawC = () => {
    const list = curC();
    $('#cCount').textContent = list.length ? pend(list) : '';
    $('#cl').innerHTML = cur ? commentsHtml(list, P, { showRes, sel: selC }) : '';
    P?.setMarks(list.filter(c => !c.parent_id && c.t != null && (showRes || !c.resolved)).map(c => ({ t: c.t, label: c.body, cls: c.resolved ? 'done' : c.from_client ? 'cl' : '', c })), m => jump(m.c));
  };
  const drawComp = () => {
    $('#comp').innerHTML = !cur ? '' : `${replyTo ? `<div class="at">Respondiendo a ${esc(replyTo.author_name)} · <a href="javascript:void 0" id="cRx">cancelar</a></div>` : `<div class="at">En <span class="tc" id="cAt">${P ? P.tc(P.v.currentTime) : '00:00:00'}</span> · <kbd>C</kbd> para comentar</div>`}
      <textarea class="inp" id="cTxt" placeholder="${replyTo ? 'Tu respuesta…' : 'Escribe una corrección o nota…'}"></textarea>
      <div class="row" style="margin-top:8px"><label class="chk"><input type="checkbox" id="cInt"> Nota interna (el cliente no la ve)</label><span class="spacer"></span><button class="btn pri" id="cSend">Comentar</button></div>`;
    if (!cur) return;
    $('#cTxt').onfocus = () => P?.v.pause();
    $('#cTxt').onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('#cSend').click(); };
    $('#cRx')?.addEventListener('click', () => { replyTo = null; drawComp(); });
    $('#cSend').onclick = async () => {
      const body = $('#cTxt').value.trim(); if (!body) return;
      $('#cSend').disabled = true;
      try {
        const row = { version_id: cur.id, body, author_name: myName(), internal: $('#cInt').checked };
        if (replyTo) row.parent_id = replyTo.id; else { row.t = P ? P.v.currentTime : null; row.ink = P?.takeInk() || null; }
        const nc = await q(A.sb.from('flow_comments').insert(row).select().single());
        C.push(nc); replyTo = null; P?.setPen(false); P?.clearInk(); drawC(); drawComp();
      } finally { $('#cSend') && ($('#cSend').disabled = false); }
    };
  };
  const jump = c => { selC = c.id; if (P && c.t != null) { P.seek(c.t); P.showInk(c.ink); } drawC(); };
  const drawAll = () => { drawVbar(); drawPlayer(); drawC(); drawComp(); };
  drawCk(); drawAct(); drawAll();

  $('#cRes').onchange = e => { showRes = e.target.checked; drawC(); };
  $('#cl').onclick = async e => {
    const el = e.target.closest('[data-c]'); if (!el) return; const c = C.find(x => x.id === el.dataset.c);
    const a = e.target.closest('[data-ca]')?.dataset.ca;
    if (a === 'res') { c.resolved = !c.resolved; drawC(); await q(A.sb.from('flow_comments').update({ resolved: c.resolved, resolved_by: c.resolved ? myName() : null }).eq('id', c.id)); return; }
    if (a === 'del') { if (!(await ask('¿Borrar este comentario?', 'Borrar', 'danger'))) return; await q(A.sb.from('flow_comments').delete().eq('id', c.id)); C = C.filter(x => x.id !== c.id && x.parent_id !== c.id); drawC(); return; }
    if (a === 'rep') { replyTo = c; drawComp(); $('#cTxt').focus(); return; }
    jump(c);
  };
  v.addEventListener('click', async e => {
    const vc = e.target.closest('[data-v]');
    if (vc) { cur = V.find(x => x.id === vc.dataset.v); selC = null; history.replaceState(null, '', `#/e/${did}/${cur.id}`); drawAll(); return; }
    if (e.target.closest('#cmpB')) { cmp = !cmp; drawAll(); return; }
    if (e.target.closest('#nv')) return newVersionDlg(d, async nvId => { await loadV(); cur = V.find(x => x.id === nvId) || cur; d.status = 'revision_interna'; $('#eS').value = d.status; await loadA(); drawAct(); drawAll(); });
    if (e.target.closest('#okInt')) {
      if (!(await ask(`¿Enviar la <b>V${cur.n}</b> al cliente? La verá en su enlace y la pieza pasará a «Revisión del cliente».`, 'Enviar al cliente'))) return;
      await q(A.sb.from('flow_versions').update({ internal_ok: true }).eq('id', cur.id));
      await loadV(); cur = V.find(x => x.id === cur.id); d.status = 'revision_cliente'; $('#eS').value = d.status; await loadA(); drawAct(); drawVbar();
      toast('Enviada. Pásale el enlace del cliente si aún no lo tiene.');
    }
  });
  const refreshC = debounce(async () => { await loadC(); drawC(); }, 300);
  const refreshD = debounce(async () => {
    const nd = await q(A.sb.from('flow_deliverables').select('*').eq('id', did).maybeSingle()); if (!nd) return;
    if (nd.status !== d.status) { d.status = nd.status; $('#eS').value = d.status; }
    const keep = cur?.id; await loadV(); cur = V.find(x => x.id === keep) || cur; await loadA(); drawAct(); drawVbar();
  }, 400);
  A.chans.push(A.sb.channel('e-' + did)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'flow_comments', filter: `project_id=eq.${d.project_id}` }, refreshC)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'flow_deliverables', filter: `id=eq.${did}` }, refreshD)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'flow_versions', filter: `deliverable_id=eq.${did}` }, refreshD).subscribe());
}

function newVersionDlg(d, done) {
  const dd = dlg(`<h3>Nueva versión</h3>
    <p class="muted small">1. Sube a Drive el vídeo de revisión (mp4, 720p o 1080p, ligero).<br>2. Compártelo: <b>Cualquier persona con el enlace → Lector</b>.<br>3. Pega aquí el enlace.</p>
    <label class="lb">Enlace del vídeo en Drive</label><input class="inp" id="nvU" placeholder="https://drive.google.com/file/d/…/view">
    <label class="lb">Nota para el equipo (opcional)</label><input class="inp" id="nvN" placeholder="Qué cambió en esta versión">
    <p class="small" id="nvE" style="min-height:1.3em;margin:8px 0 0"></p>
    <div class="row end"><button class="btn" data-x>Cancelar</button><button class="btn pri" id="nvOk">Añadir versión</button></div>`);
  $('#nvOk', dd).onclick = async () => {
    const id = driveId($('#nvU', dd).value), err = $('#nvE', dd);
    if (!id) { err.style.color = 'var(--bad)'; err.textContent = 'No encuentro el archivo en ese enlace.'; return; }
    err.style.color = 'var(--mut)'; err.textContent = 'Comprobando en Drive…'; $('#nvOk', dd).disabled = true;
    try {
      const r = await fetch(driveMeta(id)), j = await r.json();
      if (!r.ok) { err.style.color = 'var(--bad)'; err.textContent = r.status === 404 ? 'Drive no deja verlo: compártelo como «Cualquier persona con el enlace».' : 'Drive respondió: ' + (j.error?.message || r.status); return; }
      if (!/^video\//.test(j.mimeType)) { err.style.color = 'var(--bad)'; err.textContent = `Eso no es un vídeo (${j.mimeType}).`; return; }
      const nv = await q(A.sb.from('flow_versions').insert({ deliverable_id: d.id, drive_file_id: id, file_name: j.name, notes: $('#nvN', dd).value.trim() || null, uploaded_by: myName() }).select().single());
      closeDlg(); toast(`V${nv.n} añadida: ${j.name}`); done(nv.id);
    } catch (e) { err.style.color = 'var(--bad)'; err.textContent = e.message || String(e); }
    finally { $('#nvOk', dd) && ($('#nvOk', dd).disabled = false); }
  };
}

/* ================= clientes ================= */
async function clientsView(v) {
  const D = await q(A.sb.from('flow_projects').select('client_id,status'));
  v.innerHTML = `<div class="head"><div class="t"><h1>Clientes</h1></div><button class="btn pri" id="nc">+ Nuevo cliente</button></div>
    <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Cliente</th><th>Contacto</th><th>Correo / teléfono</th><th>Proyectos activos</th></tr></thead><tbody>
    ${A.clients.map(c => `<tr style="cursor:pointer" data-c="${c.id}"><td><b>${esc(c.name)}</b></td><td>${esc(c.contact_name || '')}</td><td class="muted">${esc([c.email, c.phone].filter(Boolean).join(' · '))}</td><td>${D.filter(p => p.client_id === c.id && p.status === 'activo').length}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Aún no hay clientes.</td></tr>'}
    </tbody></table></div>`;
  $('#nc').onclick = () => clientDlg();
  v.onclick = e => { const r = e.target.closest('[data-c]'); if (r) location.hash = '#/clientes/' + r.dataset.c; };
}
function clientDlg(c) {
  const isNew = !c; c = c || {};
  const d = dlg(`<h3>${isNew ? 'Nuevo cliente' : 'Editar cliente'}</h3>
    <label class="lb">Nombre / marca</label><input class="inp" id="cN" value="${esc(c.name)}">
    <div class="two"><div><label class="lb">Persona de contacto</label><input class="inp" id="cP" value="${esc(c.contact_name)}"></div><div><label class="lb">Teléfono / WhatsApp</label><input class="inp" id="cT" value="${esc(c.phone)}"></div></div>
    <label class="lb">Correo</label><input class="inp" id="cE" type="email" value="${esc(c.email)}">
    <label class="lb">Notas</label><textarea class="inp" id="cNo">${esc(c.notes || '')}</textarea>
    <div class="row end">${!isNew && isAdmin() ? '<button class="btn danger" id="cDel">Borrar</button><span class="spacer"></span>' : ''}<button class="btn" data-x>Cancelar</button><button class="btn pri" id="cOk">${isNew ? 'Crear' : 'Guardar'}</button></div>`);
  $('#cOk', d).onclick = async () => {
    const row = { name: $('#cN', d).value.trim(), contact_name: $('#cP', d).value.trim() || null, phone: $('#cT', d).value.trim() || null, email: $('#cE', d).value.trim() || null, notes: $('#cNo', d).value.trim() || null };
    if (!row.name) return toast('Ponle un nombre', true);
    const r = isNew ? await q(A.sb.from('flow_clients').insert(row).select().single()) : await q(A.sb.from('flow_clients').update(row).eq('id', c.id).select().single());
    if (isNew) A.clients.push(r); else Object.assign(c, r);
    A.clients.sort((a, b) => a.name.localeCompare(b.name)); closeDlg();
    location.hash = '#/clientes/' + r.id; if (!isNew) route();
  };
  $('#cDel', d)?.addEventListener('click', async () => {
    closeDlg();
    if (!(await ask(`¿Borrar el cliente <b>${esc(c.name)}</b>? Sus proyectos quedan como internos.`, 'Borrar', 'danger'))) return;
    await q(A.sb.from('flow_clients').delete().eq('id', c.id)); A.clients = A.clients.filter(x => x.id !== c.id); await loadBase(); location.hash = '#/clientes';
  });
}
async function clientView(v, cid) {
  const c = A.clients.find(x => x.id === cid); if (!c) { v.innerHTML = '<div class="empty">Cliente no encontrado.</div>'; return; }
  const ps = A.projects.filter(p => p.client_id === cid);
  v.innerHTML = `<div class="head"><div class="t"><div class="crumb"><a href="#/clientes">Clientes</a></div><h1>${esc(c.name)}</h1></div>
      <button class="btn" id="ec">Editar</button><button class="btn pri" id="np">+ Proyecto</button></div>
    <div class="grid g-dash"><div class="card"><h3>Proyectos</h3><div class="list">${ps.map(p => `<a class="li" href="#/p/${p.id}"><span class="grow">${esc(p.name)}</span><span class="tag">${esc(p.status)}</span>${p.due_date ? `<span class="small muted">${fmtD(p.due_date)}</span>` : ''}</a>`).join('') || '<div class="empty">Sin proyectos.</div>'}</div></div>
      <div class="card"><h3>Contacto</h3><div class="stack small">${c.contact_name ? `<div><span class="muted">Contacto:</span> ${esc(c.contact_name)}</div>` : ''}${c.phone ? `<div><span class="muted">Teléfono:</span> ${esc(c.phone)}</div>` : ''}${c.email ? `<div><span class="muted">Correo:</span> ${esc(c.email)}</div>` : ''}${c.notes ? `<div style="white-space:pre-wrap">${esc(c.notes)}</div>` : ''}${!c.contact_name && !c.phone && !c.email && !c.notes ? '<div class="dim">Sin datos.</div>' : ''}</div></div></div>`;
  $('#ec').onclick = () => clientDlg(c);
  $('#np').onclick = () => projectDlg(null, cid);
}

/* ================= equipo ================= */
async function teamView(v) {
  await loadBase();
  const adm = isAdmin();
  v.innerHTML = `<div class="head"><div class="t"><h1>Equipo</h1><p class="muted" style="margin:4px 0 0">Quien esté aquí ve y edita todos los proyectos. Cada persona entra con su correo (la misma cuenta que en Glanx Guiones).</p></div>${adm ? '<button class="btn pri" id="nt">+ Añadir persona</button>' : ''}</div>
    <div class="card tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Nombre</th><th>Correo</th><th>Especialidad</th><th>Rol</th>${adm ? '<th></th>' : ''}</tr></thead><tbody>
    ${A.team.map(t => `<tr><td>${av(t.email)}</td><td><b>${esc(t.name || '')}</b></td><td class="muted">${esc(t.email)}</td><td>${esc(t.specialty || '')}</td><td>${t.role === 'admin' ? 'Admin' : 'Equipo'}</td>
      ${adm ? `<td style="text-align:right"><button class="btn sm" data-ed="${esc(t.email)}">Editar</button>${t.email !== A.me.email ? ` <button class="btn sm ghost" data-rm="${esc(t.email)}">Quitar</button>` : ''}</td>` : ''}</tr>`).join('')}
    </tbody></table></div>`;
  const edit = t => {
    const isNew = !t; t = t || { role: 'equipo' };
    const d = dlg(`<h3>${isNew ? 'Añadir persona' : 'Editar'}</h3>
      <label class="lb">Correo (con el que entra)</label><input class="inp" id="tE" type="email" value="${esc(t.email)}" ${isNew ? '' : 'disabled'}>
      <div class="two"><div><label class="lb">Nombre</label><input class="inp" id="tN" value="${esc(t.name)}"></div>
      <div><label class="lb">Especialidad</label><input class="inp" id="tS" value="${esc(t.specialty)}" list="specs"><datalist id="specs"><option>Edición</option><option>Diseño</option><option>Guion</option><option>Motion graphics</option><option>VFX / CGI</option><option>Color</option><option>Sonido</option><option>Producción</option><option>Dirección</option></datalist></div></div>
      <label class="lb">Rol</label><select class="inp" id="tR"><option value="equipo">Equipo</option><option value="admin">Admin (gestiona equipo, borra proyectos)</option></select>
      <div class="row end"><button class="btn" data-x>Cancelar</button><button class="btn pri" id="tOk">Guardar</button></div>`);
    $('#tR', d).value = t.role;
    $('#tOk', d).onclick = async () => {
      const row = { email: $('#tE', d).value.trim().toLowerCase(), name: $('#tN', d).value.trim() || null, specialty: $('#tS', d).value.trim() || null, role: $('#tR', d).value };
      if (!/\S+@\S+\.\S+/.test(row.email)) return toast('Correo no válido', true);
      await q(A.sb.from('flow_team').upsert(row)); closeDlg(); toast(isNew ? 'Añadido. Ya puede entrar con ese correo.' : 'Guardado'); route();
    };
  };
  $('#nt')?.addEventListener('click', () => edit());
  v.onclick = async e => {
    const ed = e.target.closest('[data-ed]'); if (ed) return edit(A.team.find(t => t.email === ed.dataset.ed));
    const rm = e.target.closest('[data-rm]'); if (!rm) return;
    if (!(await ask(`¿Quitar a <b>${esc(rm.dataset.rm)}</b> del equipo? Dejará de ver los proyectos.`, 'Quitar', 'danger'))) return;
    await q(A.sb.from('flow_team').delete().eq('email', rm.dataset.rm)); route();
  };
}

/* ================= portal del cliente ================= */
async function portal(tok, did, vid) {
  document.body.classList.add('portal');
  $('#app').innerHTML = `<div class="ptop"><a class="brand" href="#/c/${esc(tok)}">${BRAND}</a><div class="pn" id="ptn"></div></div><div class="pwrap" id="pw"><div class="empty">Cargando…</div></div>`;
  const load = async () => { const r = await A.sb.rpc('flow_portal', { tok }); if (r.error) throw r.error; return r.data; };
  let data;
  try { data = await load(); } catch (e) { $('#pw').innerHTML = `<div class="empty">No se pudo cargar: ${esc(e.message)}</div>`; return; }
  if (!data) { $('#pw').innerHTML = '<div class="phero"><h2>Este enlace no es válido</h2><p class="muted">Pide a Glanx que te lo envíe de nuevo.</p></div>'; return; }
  $('#ptn').innerHTML = `<b style="color:#fff">${esc(data.project.name)}</b><br>${esc(data.project.client || '')}`;
  document.title = data.project.name + ' · Glanx Flow';
  const pw = $('#pw');
  if (!did) return portalHome(pw, tok, data);
  return portalReview(pw, tok, data, did, vid, load);
}
function portalHome(pw, tok, data) {
  const D = data.deliverables, Vs = data.versions;
  const hasV = id => Vs.some(v => v.deliverable_id === id);
  const need = D.filter(d => d.status === 'revision_cliente' && hasV(d.id)), done = D.filter(d => DONE.includes(d.status)).length;
  const card = d => {
    const vs = Vs.filter(v => v.deliverable_id === d.id), last = vs[vs.length - 1];
    const inner = `<div class="row">${cChip(d.status)}<span class="spacer"></span>${last ? `<span class="tag">V${last.n}</span>` : ''}</div><h3>${esc(d.title)}</h3>
      <div class="small muted">${last ? (last.approved_at ? `Aprobado por ${esc(last.approved_by_name)} · ${fmtD(last.approved_at.slice(0, 10))}` : d.status === 'revision_cliente' ? 'Listo para que lo revises' : `Última versión ${fmtD(last.created_at.slice(0, 10))}`) : d.due_date ? `Entrega prevista ${fmtD(d.due_date)}` : 'En preparación'}</div>`;
    return last ? `<a class="pc ${d.status === 'revision_cliente' ? 'need' : ''}" href="#/c/${tok}/e/${d.id}">${inner}</a>` : `<div class="pc">${inner}</div>`;
  };
  pw.innerHTML = `<div class="phero"><div class="small muted" style="text-transform:uppercase;letter-spacing:.06em;font-weight:600">${esc(data.project.client || '')}</div>
      <h1 style="margin:4px 0 12px">${esc(data.project.name)}</h1>
      <div class="prog" style="max-width:420px"><i style="width:${D.length ? done / D.length * 100 : 0}%"></i></div>
      <p class="muted" style="margin:8px 0 0">${done} de ${D.length} piezas aprobadas${data.project.due_date ? ` · entrega final ${fmtD(data.project.due_date)}` : ''}</p></div>
    ${need.length ? `<h2 style="margin:0 0 10px">Para revisar (${need.length})</h2><div class="grid g-proj" style="margin-bottom:24px">${need.map(card).join('')}</div>` : ''}
    <h2 style="margin:0 0 10px">Todas las piezas</h2><div class="grid g-proj">${D.map(card).join('') || '<div class="empty">Aún no hay piezas.</div>'}</div>
    <p class="small dim" style="margin-top:30px;text-align:center">¿Dudas? Escríbenos por WhatsApp como siempre. Las correcciones déjalas aquí, sobre el vídeo.</p>`;
}
async function portalReview(pw, tok, data, did, vid, load) {
  let d = data.deliverables.find(x => x.id === did);
  if (!d) { pw.innerHTML = '<div class="empty">Pieza no encontrada.</div>'; return; }
  let Vs = data.versions.filter(v => v.deliverable_id === did), C = data.comments, cur = Vs.find(v => v.id === vid) || Vs[Vs.length - 1], P = null, sel = null;
  if (!cur) { pw.innerHTML = `<p><a href="#/c/${tok}">← Volver</a></p><div class="phero"><h2>${esc(d.title)}</h2><p class="muted">Aún no hay una versión para revisar.</p></div>`; return; }
  let who = lsGet('gf.who', '');
  pw.innerHTML = `<p style="margin:0 0 10px"><a href="#/c/${tok}">← Todas las piezas</a></p>
    <div class="row" style="margin-bottom:12px"><h1 style="margin-right:6px">${esc(d.title)}</h1><span id="pst"></span></div>
    <div class="rv"><div class="stack"><div class="vbar" id="pvb"></div><div id="pban"></div><div class="player" id="ppl"></div></div>
      <div class="cpanel"><div class="row"><h3 style="margin:0">Tus correcciones</h3><span class="small muted" id="pcc"></span></div>
        <div class="clist" id="pcl"></div>
        <div class="composer" id="pcomp"></div>
        <div id="pact" style="border-top:1px solid var(--line);padding-top:10px;margin-top:10px"></div></div></div>`;
  const mineC = () => C.filter(c => c.version_id === cur.id);
  const drawTop = () => {
    $('#pst').innerHTML = cChip(d.status);
    $('#pvb').innerHTML = Vs.map(v => `<span class="vchip ${v === cur ? 'on' : ''}" data-v="${v.id}"><span class="dot" style="background:${v.approved_at ? 'var(--ok)' : 'var(--acc)'}"></span>Versión ${v.n}</span>`).join('');
    $('#pban').innerHTML = cur.approved_at ? `<div class="banner ok">✓ <b>Aprobaste la versión ${cur.n}</b> (${esc(cur.approved_by_name)}, ${fmtDT(cur.approved_at)}).</div>`
      : cur !== Vs[Vs.length - 1] ? `<div class="banner">Estás viendo una versión anterior. La más reciente es la ${Vs[Vs.length - 1].n}.</div>` : '';
  };
  const drawPl = () => { A.cleanup.forEach(f => f()); A.cleanup = []; P = makePlayer($('#ppl'), cur.drive_file_id, { onTime: t => $('#cAt') && ($('#cAt').textContent = P.tc(t)) }); A.player = P; };
  const drawC = () => {
    const list = mineC();
    $('#pcc').textContent = list.filter(c => !c.parent_id && !c.resolved).length ? pend(list) : '';
    $('#pcl').innerHTML = commentsHtml(list, P, { client: true, showRes: true, sel });
    P?.setMarks(list.filter(c => !c.parent_id && c.t != null).map(c => ({ t: c.t, label: c.body, cls: c.resolved ? 'done' : 'cl', c })), m => jump(m.c));
  };
  const jump = c => { sel = c.id; if (c.t != null) { P.seek(c.t); P.showInk(c.ink); } drawC(); };
  const isLast = () => cur === Vs[Vs.length - 1];
  const drawComp = () => {
    const can = isLast() && !cur.approved_at;
    $('#pcomp').innerHTML = !can ? '' : `<div class="at">En <span class="tc" id="cAt">${P.tc(P.v.currentTime)}</span> · pausa donde quieras corregir. Puedes dibujar sobre la imagen con ✎.</div>
      <textarea class="inp" id="cTxt" placeholder="Ej.: el texto un poco más abajo"></textarea>
      <div class="row" style="margin-top:8px"><input class="inp" id="pWho" placeholder="Tu nombre" value="${esc(who)}" style="flex:1;min-width:120px"><button class="btn pri" id="cSend">Añadir corrección</button></div>`;
    const mine = mineC().filter(c => c.from_client && !c.parent_id).length;
    $('#pact').innerHTML = !can ? '' : `<div class="stack" style="gap:8px">
      ${d.status === 'revision_cliente' ? `<button class="btn" id="pChg" ${mine ? '' : 'disabled'} style="justify-content:center">Enviar correcciones al equipo${mine ? ` (${mine})` : ''}</button>` : d.status === 'correcciones' ? '<div class="small muted" style="text-align:center">El equipo está trabajando en tus correcciones.</div>' : ''}
      <button class="btn ok" id="pApp" style="justify-content:center">✓ Aprobar la versión ${cur.n}</button></div>`;
    if (!can) return;
    $('#cTxt').onfocus = () => P.v.pause();
    $('#pWho').onchange = e => { who = e.target.value.trim(); lsSet('gf.who', who); };
    $('#cSend').onclick = async () => {
      const body = $('#cTxt').value.trim(); if (!body) return;
      who = $('#pWho').value.trim(); if (!who) { toast('Escribe tu nombre para que sepamos quién corrige', true); $('#pWho').focus(); return; }
      lsSet('gf.who', who); $('#cSend').disabled = true;
      try {
        const r = await A.sb.rpc('flow_portal_comment', { tok, vid: cur.id, sec: P.v.currentTime, txt: body, nm: who, drawing: P.takeInk(), parent: null });
        if (r.error) throw r.error;
        P.setPen(false); P.clearInk(); await refresh(); toast('Corrección guardada');
      } catch (e) { toast('No se pudo guardar: ' + e.message, true); } finally { $('#cSend') && ($('#cSend').disabled = false); }
    };
    $('#pChg')?.addEventListener('click', async () => {
      if (!(await ask('¿Enviar tus correcciones al equipo? Las verán ordenadas por segundo y prepararán una nueva versión.', 'Enviar'))) return;
      const r = await A.sb.rpc('flow_portal_request_changes', { tok, did, nm: who || 'Cliente' }); if (r.error) return toast(r.error.message, true);
      await refresh(); toast('Enviado. Te avisaremos con la nueva versión.');
    });
    $('#pApp').onclick = async () => {
      who = ($('#pWho')?.value || who).trim();
      if (!who) { toast('Escribe tu nombre antes de aprobar', true); $('#pWho')?.focus(); return; }
      if (!(await ask(`¿Aprobar la <b>versión ${cur.n}</b> de «${esc(d.title)}»?<br><span class="small muted">Quedará registrado con tu nombre (${esc(who)}), la fecha y esta versión exacta.</span>`, 'Sí, apruebo', 'ok'))) return;
      lsSet('gf.who', who);
      const r = await A.sb.rpc('flow_portal_approve', { tok, vid: cur.id, nm: who }); if (r.error) return toast(r.error.message, true);
      await refresh(); toast('¡Aprobado! Gracias.');
    };
  };
  async function refresh() {
    const nd = await load(); if (!nd || !pw.isConnected) return;
    d = nd.deliverables.find(x => x.id === did) || d; C = nd.comments;
    const keep = cur.id; Vs = nd.versions.filter(v => v.deliverable_id === did); cur = Vs.find(v => v.id === keep) || Vs[Vs.length - 1];
    drawTop(); drawC(); const typing = document.activeElement?.id === 'cTxt' || document.activeElement?.id === 'pWho'; if (!typing) drawComp();
  }
  drawTop(); drawPl(); drawC(); drawComp();
  $('#pvb').onclick = e => { const c = e.target.closest('[data-v]'); if (!c) return; cur = Vs.find(v => v.id === c.dataset.v); sel = null; history.replaceState(null, '', `#/c/${tok}/e/${did}/${cur.id}`); drawTop(); drawPl(); drawC(); drawComp(); };
  $('#pcl').onclick = e => { const el = e.target.closest('[data-c]'); if (el) jump(C.find(x => x.id === el.dataset.c)); };
  A.timers.push(setInterval(() => { if (!document.hidden) refresh(); }, 20000));
}

/* ---- aviso de versión nueva ---- */
async function checkVersion() {
  try {
    const h = await (await fetch('index.html?_=' + Date.now(), { cache: 'no-store' })).text();
    const v = /app\.js\?v=(\w+)/.exec(h)?.[1];
    if (v && v !== APP_V && !$('#newver')) {
      const b = document.createElement('div'); b.id = 'newver'; b.className = 'newver';
      b.innerHTML = 'Hay una versión nueva. <button class="btn sm pri">Actualizar</button>';
      b.querySelector('button').onclick = () => location.reload();
      document.body.appendChild(b);
    }
  } catch {}
}
setInterval(checkVersion, 5 * 60e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });

init();
