/* ════════════════════════════════════════════════════════════════
   Gate de acceso (Supabase) — SOLO ADMIN puede entrar.
   Reutiliza el mismo proyecto/usuarios que la Calculadora Financiera.
   El perfil "lectura" queda bloqueado (no puede ver el dashboard).
   ════════════════════════════════════════════════════════════════ */
(function () {
  const SUPABASE_URL  = 'https://cazdzwigtazmecixhuiw.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhemR6d2lndGF6bWVjaXhodWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5ODQ3OTQsImV4cCI6MjA5NzU2MDc5NH0.gDpzVh5apPBpDujdRN8olJk93FxULHCrS49XOVxGwvU';

  let sb = null;
  try {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Desactiva el "Web Locks" de supabase-js que a veces se traba entre
        // recargas y deja la app colgada en "Verificando sesión…".
        lock: async (name, acquireTimeout, fn) => await fn()
      }
    });
    window.sb = sb;                 // expuesto para otras páginas (ej. Base de datos)
    window.CADECOM_BUCKET = 'cadecom';
    window.CADECOM_STORAGE = SUPABASE_URL + '/storage/v1/object/public/cadecom/';
  } catch (e) { console.warn('Supabase no disponible:', e && e.message); }

  // ── Overlay de login (se inyecta de inmediato para que se vea al instante) ──
  const gate = document.createElement('div');
  gate.id = 'auth-gate';
  gate.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0a0a0a;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Arial,sans-serif;';
  gate.innerHTML =
    '<div style="background:#fff;padding:30px 28px;border-radius:14px;width:340px;max-width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5);border-top:4px solid #2E5FA3;">' +
      '<div style="font-weight:800;font-size:17px;margin-bottom:4px;color:#0f172a;">CADECOM — Iniciar sesión</div>' +
      '<div id="auth-sub" style="font-size:13px;color:#64748b;margin-bottom:18px;">Verificando sesión…</div>' +
      '<div id="auth-form" style="display:none;">' +
        '<input id="auth-email" type="email" placeholder="Email" autocomplete="username" ' +
          'style="width:100%;margin-bottom:8px;padding:11px 14px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:15px;outline:none;font-family:inherit;">' +
        '<input id="auth-pass" type="password" placeholder="Contraseña" autocomplete="current-password" ' +
          'style="width:100%;padding:11px 14px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:15px;outline:none;font-family:inherit;">' +
        '<div id="auth-err" style="color:#e3000f;font-size:12px;font-weight:600;min-height:16px;margin-top:8px;"></div>' +
        '<button id="auth-btn" style="width:100%;margin-top:10px;padding:11px;background:#2E5FA3;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">Entrar</button>' +
      '</div>' +
    '</div>';
  (document.body || document.documentElement).appendChild(gate);

  function $(id) { return document.getElementById(id); }
  function ensureInBody() {
    if (document.body && gate.parentNode !== document.body) document.body.appendChild(gate);
  }
  document.addEventListener('DOMContentLoaded', () => {
    if (window.__cadecomBypass) return;
    ensureInBody();
    const btn = $('auth-btn'), pass = $('auth-pass');
    if (btn) btn.addEventListener('click', doLogin);
    if (pass) pass.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    const email = $('auth-email');
    if (email) email.addEventListener('keydown', e => { if (e.key === 'Enter') $('auth-pass').focus(); });
  });

  function showForm(msg) {
    ensureInBody();
    const sub = $('auth-sub'), form = $('auth-form');
    if (sub) sub.textContent = msg || 'Ingresá con tu usuario';
    if (form) form.style.display = 'block';
    const email = $('auth-email'); if (email) email.focus();
  }

  // Pantalla de "sin permiso" para perfiles que no son admin
  function denyView(email) {
    ensureInBody();
    gate.innerHTML =
      '<div style="background:#fff;padding:30px 28px;border-radius:14px;width:360px;max-width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5);border-top:4px solid #e3000f;">' +
        '<div style="font-weight:800;font-size:17px;margin-bottom:8px;color:#0f172a;">Acceso restringido</div>' +
        '<div style="font-size:13px;color:#475569;line-height:1.5;margin-bottom:18px;">Tu usuario <b>' + (email || '') + '</b> es de solo lectura.<br>Este tablero es exclusivo para administradores.</div>' +
        '<button id="auth-logout" style="width:100%;padding:11px;background:#2E5FA3;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">Salir</button>' +
      '</div>';
    const lo = $('auth-logout'); if (lo) lo.addEventListener('click', logout);
  }

  // Lee la sesión guardada directo de localStorage (instantáneo, sin el "lock"
  // de getSession que a veces se cuelga entre recargas).
  const STORAGE_KEY = 'sb-' + SUPABASE_URL.replace('https://', '').split('.')[0] + '-auth-token';
  function getStoredSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      const s = o.currentSession || o;
      if (s && s.access_token && s.user) return s;
    } catch (e) {}
    return null;
  }

  async function loadRole(sess) {
    let user = sess && sess.user;
    if (!user) { try { user = (await sb.auth.getUser()).data.user; } catch (e) {} }
    if (!user) return null;
    const cached = localStorage.getItem('cadecom_role');
    let role = cached || 'lectura', ok = !!cached;
    try {
      // timeout duro: si la consulta no responde en 4s, usamos el rol cacheado
      const { data, error } = await Promise.race([
        sb.from('profiles').select('role').eq('id', user.id).single(),
        new Promise(r => setTimeout(() => r({ data: null, error: { _timeout: true } }), 4000))
      ]);
      if (!error) { ok = true; role = (data && data.role) || 'lectura'; localStorage.setItem('cadecom_role', role); }
    } catch (e) { /* sin red / sesión vencida → queda el cache si había */ }
    return { email: user.email, role, ok };
  }

  function adminChip(email) {
    const slot = document.getElementById('header-user');  // contenedor en el header
    const chip = document.createElement('div');
    if (slot) {
      // Dentro del header (misma fila que el banner de actualización)
      chip.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:11px;color:#fff;font-family:Arial,sans-serif;';
    } else {
      // Fallback: pill flotante arriba a la derecha
      chip.style.cssText = 'position:fixed;top:8px;right:10px;z-index:9000;display:flex;align-items:center;gap:8px;font-size:11px;color:#fff;background:rgba(0,0,0,.25);padding:4px 8px;border-radius:999px;font-family:Arial,sans-serif;';
    }
    chip.innerHTML = '<span>' + (email || '') + '</span>' +
      '<span style="font-weight:700;background:#fee2e2;color:#b91c1c;padding:1px 7px;border-radius:999px;font-size:10px;">ADMIN</span>' +
      '<button id="chip-logout" style="background:none;border:1px solid rgba(255,255,255,.6);border-radius:6px;padding:2px 8px;cursor:pointer;color:#fff;font-size:11px;font-family:inherit;">Salir</button>';
    (slot || document.body).appendChild(chip);
    chip.querySelector('#chip-logout').addEventListener('click', logout);
  }

  function grantAccess(email) { gate.remove(); if (document.body) adminChip(email); }
  function blockNonAdmin(email) {
    const slot = document.getElementById('header-user'); if (slot) slot.innerHTML = '';
    (document.body || document.documentElement).appendChild(gate);
    denyView(email);
  }

  async function enter(sess) {
    const u = await loadRole(sess);
    if (!u) { showForm('Ingresá con tu usuario'); return; }
    if (u.role === 'admin') { grantAccess(u.email); return; }
    if (!u.ok) { showForm('Tu sesión expiró. Ingresá de nuevo.'); return; }  // consulta falló → re-login
    denyView(u.email);                                                       // lectura genuino → bloqueado
  }

  async function doLogin() {
    const email = $('auth-email').value.trim();
    const pass  = $('auth-pass').value;
    const errEl = $('auth-err'), btn = $('auth-btn');
    errEl.textContent = '';
    if (!email || !pass) { errEl.textContent = 'Completá email y contraseña'; return; }
    btn.disabled = true; btn.textContent = 'Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    btn.disabled = false; btn.textContent = 'Entrar';
    if (error) { errEl.textContent = 'Email o contraseña incorrectos'; $('auth-pass').select(); return; }
    await enter(getStoredSession());
  }

  async function logout() {
    try { localStorage.removeItem('cadecom_role'); } catch (e) {}
    try { await sb.auth.signOut(); } catch (e) {}
    location.reload();
  }
  window.cadecomLogout = logout;

  async function start() {
    // Modo local (archivo o localhost): entra sin login para agilizar.
    // En la web real, login obligatorio.
    const isLocal = location.protocol === 'file:' ||
      ['localhost', '127.0.0.1', '::1', ''].includes(location.hostname);
    if (isLocal) {
      window.__cadecomBypass = true;
      gate.remove();
      const setChip = () => { const slot = document.getElementById('header-user'); if (slot) slot.innerHTML = '<span style="font-size:11px;color:#fff;opacity:.65">modo local</span>'; };
      if (document.body) setChip(); else document.addEventListener('DOMContentLoaded', setChip);
      return;
    }
    if (!sb) { showForm('Falta configurar Supabase'); return; }
    // Lectura directa (instantánea) de la sesión guardada, SIN tocar la red.
    // Si hay sesión → entramos YA y validamos el rol en segundo plano.
    // (Esperar la red era la causa del cuelgue, porque los 30MB de datos la saturan.)
    const sess = getStoredSession();
    if (!sess) { showForm('Ingresá con tu usuario'); return; }
    grantAccess(sess.user.email);
    loadRole(sess).then(u => {
      if (u && u.ok && u.role !== 'admin') {  // confirmado NO admin → bloquear
        localStorage.removeItem('cadecom_role');
        blockNonAdmin(u.email);
      }
    });
  }
  start();
})();
