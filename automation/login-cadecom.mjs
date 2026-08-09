// ════════════════════════════════════════════════════════════════
//  login-cadecom.mjs — Login UNA vez al portal de estadísticas CADECOM.
//  Abre un Chromium visible con un perfil propio y persistente; te
//  logueás vos a mano y la sesión queda guardada para las corridas
//  automáticas (download-cadecom.mjs la reutiliza).
//
//  Uso:  node login-cadecom.mjs
// ════════════════════════════════════════════════════════════════
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DIR = path.join(__dirname, '.chrome-cadecom');
const PORTAL = 'https://estadisticas.cadecom.org.ar/';

const isLoggedIn = async (page) => {
  const hasPass = await page.locator('input[type=password]').first().isVisible().catch(() => false);
  if (hasPass) return false;
  return await page.getByText('Consultas', { exact: false }).first().isVisible().catch(() => false);
};

const ctx = await chromium.launchPersistentContext(USER_DIR, {
  headless: false,
  acceptDownloads: true,
  viewport: { width: 1400, height: 900 },
});
const page = ctx.pages()[0] || await ctx.newPage();

console.log('Abriendo el portal de CADECOM…');
await page.goto(PORTAL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

if (await isLoggedIn(page)) {
  console.log('\n✅ Ya estabas logueado. La sesión está guardada, no hace falta nada más.');
  await ctx.close();
  process.exit(0);
}

console.log('\n👉 Logueate en la ventana que se abrió (email + contraseña + "Mantener la sesión iniciada").');
console.log('   Esperando a que entres… (hasta 5 minutos)\n');

try {
  await page.waitForFunction(() => {
    const pass = document.querySelector('input[type=password]');
    const passVisible = pass && pass.offsetParent !== null;
    const consultas = [...document.querySelectorAll('*')].some(
      el => el.children.length === 0 && /consultas/i.test(el.textContent || ''));
    return !passVisible && consultas;
  }, { timeout: 300000 });
  console.log('✅ Login detectado. Sesión guardada en el perfil local.');
  console.log('   Ya podés correr:  node download-cadecom.mjs   (o  node run-full.mjs)');
} catch {
  console.log('⚠️ No detecté el login en 5 minutos. Si entraste igual, la sesión probablemente quedó guardada.');
} finally {
  await ctx.close();
}
