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
      auth: { persistSession: true, autoRefreshToken: true }
    });
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

  async function loadRole() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    let role = 'lectura';
    try {
      const { data } = await sb.from('profiles').select('role').eq('id', user.id).single();
      if (data && data.role) role = data.role;
    } catch (e) { /* sin fila de perfil => lectura */ }
    return { email: user.email, role };
  }

  function adminChip(email) {
    const chip = document.createElement('div');
    chip.style.cssText = 'position:fixed;top:8px;right:10px;z-index:9000;display:flex;align-items:center;gap:8px;font-size:11px;color:#fff;background:rgba(0,0,0,.25);padding:4px 8px;border-radius:999px;font-family:Arial,sans-serif;';
    chip.innerHTML = '<span>' + (email || '') + '</span>' +
      '<span style="font-weight:700;background:#fee2e2;color:#b91c1c;padding:1px 7px;border-radius:999px;font-size:10px;">ADMIN</span>' +
      '<button id="chip-logout" style="background:none;border:1px solid rgba(255,255,255,.6);border-radius:6px;padding:2px 8px;cursor:pointer;color:#fff;font-size:11px;font-family:inherit;">Salir</button>';
    document.body.appendChild(chip);
    chip.querySelector('#chip-logout').addEventListener('click', logout);
  }

  async function enter() {
    const u = await loadRole();
    if (!u) { showForm('Ingresá con tu usuario'); return; }
    if (u.role !== 'admin') { denyView(u.email); return; }   // lectura → bloqueado
    gate.remove();
    if (document.body) adminChip(u.email);
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
    await enter();
  }

  async function logout() {
    try { await sb.auth.signOut(); } catch (e) {}
    location.reload();
  }
  window.cadecomLogout = logout;

  async function start() {
    if (!sb) { showForm('Falta configurar Supabase'); return; }
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session) { await enter(); return; }
    } catch (e) { /* sin sesión */ }
    showForm('Ingresá con tu usuario');
  }
  start();
})();
