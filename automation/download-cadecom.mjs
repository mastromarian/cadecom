// ════════════════════════════════════════════════════════════════
//  download-cadecom.mjs — Descarga automática del Excel de CADECOM.
//  Reutiliza la sesión guardada por login-cadecom.mjs, va a Consultas,
//  completa el formulario (desde 01/01/año, Localidad, Modelo, Período)
//  y exporta el Excel a la carpeta Descargas.
//
//  Uso:  node download-cadecom.mjs           (headless)
//        node download-cadecom.mjs --show     (con ventana visible)
//  Salida: imprime  DOWNLOADED:<ruta>  y termina con código 0.
//  Si la sesión expiró, termina con código 2 (hay que correr login).
// ════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DIR = path.join(__dirname, '.chrome-cadecom');
const PORTAL = 'https://estadisticas.cadecom.org.ar/';
const SHOW = process.argv.includes('--show');
const YEAR = new Date().getFullYear();

const fail = (msg, code = 1) => { console.error('❌ ' + msg); process.exitCode = code; };

if (!fs.existsSync(USER_DIR)) {
  fail('No hay sesión guardada. Corré primero:  node login-cadecom.mjs', 2);
  process.exit();
}

const ctx = await chromium.launchPersistentContext(USER_DIR, {
  headless: !SHOW,
  acceptDownloads: true,
  viewport: { width: 1400, height: 900 },
});

try {
  const page = ctx.pages()[0] || await ctx.newPage();
  console.log('▶ Abriendo portal…');
  // La red a veces parpadea (ERR_CONNECTION_TIMED_OUT): hasta 4 intentos.
  let lastErr = null;
  for (let i = 1; i <= 4; i++) {
    try {
      await page.goto(PORTAL, { waitUntil: 'domcontentloaded', timeout: 45000 });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      console.log('   ⚠ intento ' + i + ' falló (' + (e.message || '').split('\n')[0] + '), reintentando en ' + (i * 3) + 's…');
      await page.waitForTimeout(i * 3000);
    }
  }
  if (lastErr) throw lastErr;
  await page.waitForTimeout(2500);

  // ¿Sesión viva?
  const loggedOut = await page.locator('input[type=password]').first().isVisible().catch(() => false);
  if (loggedOut) {
    fail('La sesión expiró. Corré:  node login-cadecom.mjs  y volvé a intentar.', 2);
    await ctx.close();
    process.exit();
  }

  // Ir a Consultas
  console.log('▶ Entrando a Consultas…');
  await page.getByText('Consultas', { exact: true }).first().click();
  await page.waitForSelector('input[type=date]', { timeout: 20000 });
  await page.waitForTimeout(500);

  // Fecha desde = 01/01/<año actual> (fecha hasta se deja como viene)
  console.log('▶ Completando el formulario…');
  await page.locator('input[type=date]').first().fill(`${YEAR}-01-01`);

  // Setea un <select> por value; si no existe, cae al texto de opción que arranca igual.
  async function setSel(sel, wanted) {
    const values = await sel.evaluate(el => Array.from(el.options).map(o => o.value));
    if (values.includes(wanted)) { await sel.selectOption(wanted); return true; }
    const idx = await sel.evaluate((el, w) =>
      Array.from(el.options).findIndex(o => (o.textContent || '').trim().toLowerCase().startsWith(w)), wanted);
    if (idx >= 0) { await sel.selectOption({ index: idx }); return true; }
    return false;
  }

  // Configura los 3 selects (formato / principal / adicional) y exporta el Excel.
  async function configureAndExport({ formato, principal, adicional, tag, saveName }) {
    const selects = await page.locator('select').all();
    for (const sel of selects) {
      const values = await sel.evaluate(el => Array.from(el.options).map(o => o.value));
      const texts = await sel.evaluate(el => Array.from(el.options).map(o => (o.textContent || '').trim().toLowerCase()));
      if (values.includes('periodo') && values.includes('normal')) {
        await setSel(sel, formato);                                    // FORMATO
      } else if (values.includes('localidad') && values.includes('modelo')) {
        if (texts.some(t => t === 'ninguno')) await setSel(sel, adicional);   // AGRUPADOR ADICIONAL
        else await setSel(sel, principal);                                    // AGRUPADOR PRINCIPAL
      }
      // el select de "filas por página" se deja en su valor por defecto
    }
    await page.waitForTimeout(400);
    console.log(`▶ Exportando Excel (${tag})…`);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }),
      page.getByRole('button', { name: /Exportar Excel/i }).click(),
    ]);
    // Los reportes "normal" (marca y cilindrada) tienen el MISMO nombre sugerido
    // (consulta_normal_*), así que a esos les forzamos un nombre fijo distinto.
    const fname = saveName || download.suggestedFilename() || `consulta_${tag}_${YEAR}.xlsx`;
    const dest = path.join(os.homedir(), 'Downloads', fname);
    await download.saveAs(dest);
    const size = fs.statSync(dest).size;
    console.log(`✅ ${tag}: ${fname} (${(size / 1024 / 1024).toFixed(2)} MB)`);
    return dest;
  }

  // 1) Reporte de siempre: Localidad–Modelo, formato Período (para los datos del tablero)
  const destPeriodo = await configureAndExport({ formato: 'periodo', principal: 'localidad', adicional: 'modelo', tag: 'periodo' });
  console.log('DOWNLOADED:' + destPeriodo);

  // 2) Reporte Marca–Modelo, formato Normal (autocompleta la MARCA de modelos nuevos).
  try {
    const destMarca = await configureAndExport({ formato: 'normal', principal: 'marca', adicional: 'modelo', tag: 'marca-modelo', saveName: 'cadecom_marca_modelo.xlsx' });
    console.log('DOWNLOADED_MARCA:' + destMarca);
  } catch (e) {
    console.error('⚠ No pude bajar el reporte Marca–Modelo (' + String(e.message || e).split('\n')[0] + '). Los modelos nuevos podrían quedar SIN MARCA.');
  }

  // 3) Reporte Cilindrada–Modelo, formato Normal (autocompleta la CILINDRADA de modelos nuevos).
  try {
    const destCil = await configureAndExport({ formato: 'normal', principal: 'cilindrada', adicional: 'modelo', tag: 'cilindrada-modelo', saveName: 'cadecom_cilindrada_modelo.xlsx' });
    console.log('DOWNLOADED_CIL:' + destCil);
  } catch (e) {
    console.error('⚠ No pude bajar el reporte Cilindrada–Modelo (' + String(e.message || e).split('\n')[0] + '). Los modelos nuevos podrían quedar sin cilindrada.');
  }
} catch (e) {
  fail('Falló la descarga: ' + (e.message || e));
} finally {
  await ctx.close();
}
