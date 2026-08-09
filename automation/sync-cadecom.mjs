// ════════════════════════════════════════════════════════════════
//  sync-cadecom.mjs — Replica el "Procesar y subir" de basedatos.html
//  SIN navegador. Toma el Excel de CADECOM, reprocesa con el MISMO
//  cadecom_build.js del proyecto y sube data.js / data-historia.js /
//  localidad-modelo/{año}.xlsx a Supabase Storage.
//
//  Uso:
//    node sync-cadecom.mjs                 → toma el último consulta_periodo_*.xlsx de Descargas
//    node sync-cadecom.mjs --file ruta.xlsx
//    node sync-cadecom.mjs --dry-run       → procesa y escribe ./out, NO sube (no requiere credenciales)
//
//  Credenciales para subir (poné en automation/.env):
//    CADECOM_ADMIN_EMAIL=...           (admin del tablero)
//    CADECOM_ADMIN_PASSWORD=...
//    — o bien —
//    CADECOM_SERVICE_KEY=...           (service_role, más potente; dejalo solo local)
// ════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..');       // Desktop/Pacheco/Cadecom
const OUT = path.join(__dirname, 'out');

const SUPABASE_URL = 'https://cazdzwigtazmecixhuiw.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhemR6d2lndGF6bWVjaXhodWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5ODQ3OTQsImV4cCI6MjA5NzU2MDc5NH0.gDpzVh5apPBpDujdRN8olJk93FxULHCrS49XOVxGwvU';
const STORAGE = SUPABASE_URL + '/storage/v1/object/public/cadecom/';
const BUCKET = 'cadecom';

// ── logging chiquito ──
const log = (...a) => console.log(...a);
const die = (m) => { console.error('\n❌ ' + m + '\n'); process.exit(1); };

// ── .env loader mínimo (sin dependencias) ──
function loadEnv() {
  const p = path.join(__dirname, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ── args ──
function parseArgs() {
  const a = process.argv.slice(2), o = { dry: false, file: null, marca: null, cil: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--dry-run' || a[i] === '--dry') o.dry = true;
    else if (a[i] === '--file') o.file = a[++i];
    else if (a[i] === '--marca') o.marca = a[++i];   // reporte Marca-Modelo explícito
    else if (a[i] === '--cil') o.cil = a[++i];       // reporte Cilindrada-Modelo explícito
  }
  return o;
}

// ── ubicar el Excel de CADECOM ──
function findYearFile(explicit) {
  if (explicit) {
    if (!fs.existsSync(explicit)) die('No existe el archivo: ' + explicit);
    return explicit;
  }
  const dl = path.join(os.homedir(), 'Downloads');
  if (!fs.existsSync(dl)) die('No encuentro la carpeta Descargas: ' + dl);
  const cands = fs.readdirSync(dl)
    .filter(f => /^consulta_periodo_.*\.xlsx$/i.test(f))
    .map(f => ({ f, full: path.join(dl, f), t: fs.statSync(path.join(dl, f)).mtimeMs }))
    .sort((x, y) => y.t - x.t);
  if (!cands.length) die('No hay ningún consulta_periodo_*.xlsx en Descargas. Descargá primero el reporte de CADECOM.');
  return cands[0].full;
}

// ── ubicar reportes auxiliares en Descargas (nombre fijo que pone el downloader,
//    con fallback al nombre "consulta_normal_*" por si se bajaron a mano) ──
function findAuxFile(explicit, fixedName, fallbackRe) {
  if (explicit) return fs.existsSync(explicit) ? explicit : null;
  const dl = path.join(os.homedir(), 'Downloads');
  if (!fs.existsSync(dl)) return null;
  const fixed = path.join(dl, fixedName);
  if (fs.existsSync(fixed)) return fixed;
  if (!fallbackRe) return null;
  const cands = fs.readdirSync(dl)
    .filter(f => fallbackRe.test(f))
    .map(f => ({ full: path.join(dl, f), t: fs.statSync(path.join(dl, f)).mtimeMs }))
    .sort((x, y) => y.t - x.t);
  return cands.length ? cands[0].full : null;
}
const findMarcaFile = (explicit) => findAuxFile(explicit, 'cadecom_marca_modelo.xlsx', /^consulta_normal_.*\.xlsx$/i);
const findCilFile   = (explicit) => findAuxFile(explicit, 'cadecom_cilindrada_modelo.xlsx', null);

// ── inferir cilindrada (categoría) desde el número del modelo, como build_data.py ──
function guessCC(modelo) {
  const nums = (String(modelo).match(/\d{2,4}/g) || []).map(Number).filter(n => n >= 50 && n <= 2500);
  return nums.length ? Math.max(...nums) : null;
}
function cilBucket(n) {
  if (n == null) return 'Sin categoría';
  if (n <= 110) return 'Hasta 110 cc';
  if (n <= 150) return '111-150 cc';
  if (n <= 250) return '151-250 cc';
  if (n <= 500) return '251-500 cc';
  return 'Más de 500 cc';
}
const VALID_CIL = new Set(['Hasta 110 cc', '111-150 cc', '151-250 cc', '251-500 cc', 'Más de 500 cc']);

// ── mapa norm(modelo) -> valor(columna) desde un reporte con hoja "Consulta" ──
function modeloMapFrom(buf, valueCol, norm) {
  if (!buf) return {};
  const ws = XLSX.read(buf, { type: 'buffer' }).Sheets['Consulta'];
  if (!ws) throw new Error('El reporte no tiene hoja "Consulta".');
  const map = {};
  for (const r of XLSX.utils.sheet_to_json(ws, { defval: '' })) {
    const modelo = String(r.Modelo ?? '').trim();
    const val = String(r[valueCol] ?? '').trim();
    const k = norm(modelo);
    if (!modelo || k === '' || k === 'TOTAL GENERAL' || k === 'NAN') continue;
    if (!(k in map)) map[k] = val;
  }
  return map;
}

// ── completar BD_Motos: marca (reporte Marca-Modelo) y cilindrada (reporte
//    Cilindrada-Modelo, con fallback a inferir del nombre). Agrega modelos nuevos
//    y además corrige la cilindrada de los que hayan quedado "Sin categoría".
//    Devuelve { buf, added, cilFixed }. ── */
function augmentMotos(motosBuf, marcaBuf, cilBuf, norm) {
  const wsM = XLSX.read(motosBuf, { type: 'buffer' }).Sheets['Consulta'];
  if (!wsM) throw new Error('BD_Motos.xlsx no tiene hoja "Consulta".');
  const rows = XLSX.utils.sheet_to_json(wsM, { defval: '' });
  const have = new Set(rows.map(r => norm(String(r.Modelo || ''))));

  const marcaByModelo = modeloMapFrom(marcaBuf, 'Marca', norm);
  const cilByModelo = modeloMapFrom(cilBuf, 'Cilindrada', norm);
  const cilFor = (modelo) => {
    const real = cilByModelo[norm(modelo)];
    if (real && VALID_CIL.has(real)) return real;
    return cilBucket(guessCC(modelo));
  };

  // 1) corregir cilindrada de modelos existentes que estén en "Sin categoría"
  let cilFixed = 0;
  for (const r of rows) {
    if (String(r.Cilindrada || '').trim() === 'Sin categoría') {
      const real = cilByModelo[norm(String(r.Modelo || ''))];
      if (real && VALID_CIL.has(real)) { r.Cilindrada = real; cilFixed++; }
    }
  }

  // 2) agregar modelos nuevos del reporte Marca-Modelo (con su nombre original)
  const added = [];
  if (marcaBuf) {
    const wsA = XLSX.read(marcaBuf, { type: 'buffer' }).Sheets['Consulta'];
    for (const r of XLSX.utils.sheet_to_json(wsA, { defval: '' })) {
      const modelo = String(r.Modelo ?? '').trim();
      const marca = String(r.Marca ?? '').trim();
      const k = norm(modelo);
      if (!modelo || k === '' || k === 'TOTAL GENERAL' || k === 'NAN') continue;
      if (have.has(k)) continue;
      have.add(k);
      const marcaFinal = (marca && marca.toUpperCase() !== 'NO INFORMADO' && marca.toLowerCase() !== 'nan') ? marca : 'SIN MARCA';
      const cil = cilFor(modelo);
      rows.push({ Marca: marcaFinal, Modelo: modelo, Cilindrada: cil });
      added.push({ modelo, marca: marcaFinal, cil });
    }
  }

  if (!added.length && !cilFixed) return { buf: motosBuf, added, cilFixed };

  const wsNew = XLSX.utils.json_to_sheet(rows, { header: ['Marca', 'Modelo', 'Cilindrada'] });
  const wbNew = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbNew, wsNew, 'Consulta');
  const buf = XLSX.write(wbNew, { type: 'buffer', bookType: 'xlsx' });
  return { buf, added, cilFixed };
}

// ── cargar el CadecomBuild del proyecto (reutiliza tu código tal cual) ──
function loadCadecomBuild() {
  const src = fs.readFileSync(path.join(PROJECT, 'cadecom_build.js'), 'utf8');
  // El archivo define `const CadecomBuild = (function(){...})();` sin export.
  // Lo envolvemos y devolvemos, inyectando XLSX como global del scope.
  const factory = new Function('XLSX', src + '\n;return CadecomBuild;');
  return factory(XLSX);
}

// ── reconstruir RAW_DATA + ALL_MONTHS desde los data.js públicos ──
function buildStateFromDataFiles(dataJsText, historiaJsText) {
  // Al correr ambos como un solo cuerpo de función, los `const` comparten scope
  // (igual que los <script> en la página) y podemos devolver los globals.
  const body = dataJsText + '\n' + historiaJsText +
    '\n;return { RAW_DATA: (typeof RAW_DATA!=="undefined"?RAW_DATA:[]), ' +
    'ALL_MONTHS: (typeof ALL_MONTHS!=="undefined"?ALL_MONTHS:[]) };';
  const fn = new Function(body);
  return fn();
}

// fetch con reintentos (la red a veces parpadea: "TypeError: fetch failed")
async function fetchRetry(url, tries = 3) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' al bajar ' + url);
      return r;
    } catch (e) {
      lastErr = e;
      if (i < tries) {
        log('   ⚠ intento ' + i + ' falló (' + (e.cause?.code || e.message) + '), reintentando en ' + (i * 2) + 's…');
        await new Promise(res => setTimeout(res, i * 2000));
      }
    }
  }
  throw lastErr;
}
// Huella del CONTENIDO de data-historia.js (no de sus bytes): así dos archivos
// con los mismos datos pero distinto orden de registros dan igual. Hace falta
// porque el archivo online lo generó el navegador, con otro orden que Node.
function historiaSig(jsText) {
  try {
    const PRE = 'const RAW_DATA_HIST = ';
    const i0 = jsText.indexOf(PRE);
    if (i0 < 0) return null;
    const i1 = jsText.indexOf(';\n(function()', i0);
    if (i1 < 0) return null;
    const arr = JSON.parse(jsText.slice(i0 + PRE.length, i1));
    const lines = arr.map(r => {
      const meses = Object.keys(r).filter(k => k !== 'o' && k !== 'l').sort();
      return r.o + '|' + r.l + '|' + meses.map(k => k + ':' + r[k]).join(',');
    }).sort();
    return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
  } catch { return null; }
}

async function fetchBuf(url) {
  const r = await fetchRetry(url);
  return new Uint8Array(await r.arrayBuffer());
}
async function fetchText(url) {
  const r = await fetchRetry(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now());
  return await r.text();
}

// ── auth Supabase (password grant) o service key ──
async function getAuth() {
  const svc = process.env.CADECOM_SERVICE_KEY;
  if (svc) return { apikey: svc, token: svc, mode: 'service_role' };
  const email = process.env.CADECOM_ADMIN_EMAIL, pass = process.env.CADECOM_ADMIN_PASSWORD;
  if (!email || !pass) return null;
  const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass })
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('Login Supabase falló: ' + (j.error_description || j.msg || r.status));
  return { apikey: SUPABASE_ANON, token: j.access_token, mode: 'admin (' + email + ')' };
}

async function uploadStorage(auth, objPath, bytes, contentType, cacheSeconds) {
  const url = SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + objPath;
  const headers = {
    apikey: auth.apikey,
    authorization: 'Bearer ' + auth.token,
    'x-upsert': 'true',
    'content-type': contentType,
  };
  if (cacheSeconds) headers['cache-control'] = 'max-age=' + cacheSeconds;
  const TRIES = 5;
  let lastErr;
  for (let i = 1; i <= TRIES; i++) {
    try {
      const r = await fetch(url, {
        method: 'POST', headers, body: bytes,
        // los archivos grandes (20 MB+) tardan; sin esto undici corta antes
        signal: AbortSignal.timeout(10 * 60 * 1000),
        duplex: 'half',
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error('Storage ' + objPath + ' → HTTP ' + r.status + ' ' + t);
      }
      return;
    } catch (e) {
      lastErr = e;
      const causa = e.cause?.code || e.cause?.message || e.name || e.message;
      if (i < TRIES) {
        const wait = i * 5;
        log('   ⚠ subida de ' + objPath + ' falló (intento ' + i + '/' + TRIES + ': ' + causa + '), reintentando en ' + wait + 's…');
        await new Promise(res => setTimeout(res, wait * 1000));
      } else {
        log('   ✗ subida de ' + objPath + ' falló definitivamente: ' + causa);
      }
    }
  }
  throw lastErr;
}

// ════════════════════════════════════════════════════════════════
async function main() {
  loadEnv();
  const args = parseArgs();

  log('═══ CADECOM sync ═══');
  const yearFile = findYearFile(args.file);
  log('📄 Archivo:  ' + yearFile);

  const CadecomBuild = loadCadecomBuild();

  log('⏬ Bajando BD_Geo, BD_Motos, data.js, data-historia.js …');
  const [geoBuf, motosBuf, dataJsText, historiaJsText] = await Promise.all([
    fetchBuf(STORAGE + 'BD_Geo.xlsx'),
    fetchBuf(STORAGE + 'BD_Motos.xlsx'),
    fetchText(STORAGE + 'data.js'),
    fetchText(STORAGE + 'data-historia.js'),
  ]);

  const state = buildStateFromDataFiles(dataJsText, historiaJsText);
  log('   estado actual: ' + state.RAW_DATA.length.toLocaleString('es-AR') + ' registros · ' +
      state.ALL_MONTHS.length + ' meses (' + state.ALL_MONTHS[0] + ' → ' + state.ALL_MONTHS[state.ALL_MONTHS.length - 1] + ')');

  // ── Auto-completar marca (reporte Marca-Modelo) y cilindrada (reporte Cilindrada-Modelo) ──
  let motosBufUse = motosBuf, motosAdded = [], cilFixed = 0;
  const marcaFile = findMarcaFile(args.marca);
  const cilFile = findCilFile(args.cil);
  log('🏷  Marca-Modelo:      ' + (marcaFile ? path.basename(marcaFile) : '(no encontrado)'));
  log('📏 Cilindrada-Modelo: ' + (cilFile ? path.basename(cilFile) : '(no encontrado)'));
  if (marcaFile || cilFile) {
    try {
      const marcaBytes = marcaFile ? new Uint8Array(fs.readFileSync(marcaFile)) : null;
      const cilBytes = cilFile ? new Uint8Array(fs.readFileSync(cilFile)) : null;
      const r = augmentMotos(motosBuf, marcaBytes, cilBytes, CadecomBuild.norm);
      motosBufUse = r.buf; motosAdded = r.added; cilFixed = r.cilFixed;
      if (motosAdded.length) {
        log('   ✓ ' + motosAdded.length + ' modelo(s) nuevo(s) al catálogo:');
        motosAdded.slice(0, 30).forEach(a => log('     · ' + a.modelo + '  →  ' + a.marca + ' / ' + a.cil));
        if (motosAdded.length > 30) log('     … y ' + (motosAdded.length - 30) + ' más');
      } else {
        log('   ✓ sin modelos nuevos (el catálogo ya los tenía)');
      }
      if (cilFixed) log('   ✓ ' + cilFixed + ' modelo(s) existentes pasaron de "Sin categoría" a su cilindrada real');
    } catch (e) {
      log('   ⚠ no pude procesar los reportes auxiliares (' + e.message + '); sigo con el catálogo actual');
    }
  } else {
    log('⚠  No encontré los reportes auxiliares (cadecom_marca_modelo.xlsx / cadecom_cilindrada_modelo.xlsx).');
    log('   Los modelos nuevos quedarán SIN MARCA / Sin categoría. Corré la descarga completa (run-full) para bajarlos.');
  }

  const yearBytes = new Uint8Array(fs.readFileSync(yearFile));

  log('⚙️  Reprocesando …');
  let res;
  try {
    res = CadecomBuild.processUpload({
      yearFileBuf: yearBytes, geoBuf, motosBuf: motosBufUse,
      RAW_DATA: state.RAW_DATA, ALL_MONTHS: state.ALL_MONTHS,
    });
  } catch (e) {
    die('Validación/proceso: ' + (e.userMessage || e.message));
  }

  if (res.warnings && res.warnings.length) {
    log('\n⚠️  Avisos:');
    res.warnings.forEach(w => log('   • ' + w));
  }

  const s = res.stats;
  log('\n✅ Procesado OK — año ' + res.year);
  log('   período:     ' + s.primerMes + ' → ' + s.ultimoMes + ' (' + s.meses + ' meses)');
  log('   recientes:   ' + s.recientes.toLocaleString('es-AR'));
  log('   historia:    ' + s.historia.toLocaleString('es-AR'));
  log('   modelos:     ' + s.modelos.toLocaleString('es-AR') + '  ·  localidades: ' + s.localidades.toLocaleString('es-AR'));

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'data.js'), res.dataJs);
  fs.writeFileSync(path.join(OUT, 'data-historia.js'), res.historiaJs);
  const motosChanged = motosAdded.length || cilFixed;
  if (motosChanged) fs.writeFileSync(path.join(OUT, 'BD_Motos.xlsx'), Buffer.from(motosBufUse));
  log('\n💾 Salida escrita en: ' + OUT + '  (data.js, data-historia.js' + (motosChanged ? ', BD_Motos.xlsx' : '') + ')');

  if (args.dry) {
    log('\n🅳🆁🆈: no se sube nada. Revisá ./out y cuando estés conforme corré sin --dry-run.');
    return;
  }

  const auth = await getAuth();
  if (!auth) die('Faltan credenciales para subir. Completá automation/.env (CADECOM_ADMIN_EMAIL/PASSWORD o CADECOM_SERVICE_KEY), o corré con --dry-run.');
  log('\n🔐 Autenticado: ' + auth.mode);

  log('⏫ Subiendo a Supabase Storage …');
  // Catálogo actualizado (modelos nuevos y/o cilindradas corregidas)
  if (motosChanged) {
    await uploadStorage(auth, 'BD_Motos.xlsx', motosBufUse,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null);
    log('   ✓ BD_Motos.xlsx (+' + motosAdded.length + ' modelos · ' + cilFixed + ' cilindradas corregidas)');
  }
  await uploadStorage(auth, 'localidad-modelo/' + res.year + '.xlsx', yearBytes,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null);
  log('   ✓ localidad-modelo/' + res.year + '.xlsx');

  await uploadStorage(auth, 'data.js', new TextEncoder().encode(res.dataJs), 'application/javascript', 60);
  log('   ✓ data.js');

  // data-historia.js solo tiene meses < 2024: al cargar un año reciente no cambia.
  // Es el archivo más pesado (~22 MB) y el que más falla al subir, así que lo
  // comparamos por contenido y lo salteamos si los datos son los mismos.
  const sigNueva = historiaSig(res.historiaJs), sigVieja = historiaSig(historiaJsText);
  if (sigNueva && sigVieja && sigNueva === sigVieja) {
    log('   ⏭ data-historia.js sin cambios (mismos datos históricos), no hace falta subirlo');
  } else {
    await uploadStorage(auth, 'data-historia.js', new TextEncoder().encode(res.historiaJs), 'application/javascript', 60);
    log('   ✓ data-historia.js');
  }

  log('\n🎉 Listo. El dashboard reflejará los cambios en ~1 min.');
}

main().catch(e => die(e.stack || e.message || String(e)));
