// ════════════════════════════════════════════════════════════════
//  run-full.mjs — Corrida completa: descarga de CADECOM + subida a Supabase.
//  1) download-cadecom.mjs  (baja el Excel reutilizando la sesión guardada)
//  2) sync-cadecom.mjs      (reprocesa y sube a Supabase Storage)
//
//  Uso:  node run-full.mjs            (descarga headless)
//        node run-full.mjs --show      (muestra la ventana de la descarga)
// ════════════════════════════════════════════════════════════════
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const show = process.argv.includes('--show');

function run(script, args = []) {
  console.log(`\n─── ${script} ───`);
  const r = spawnSync(process.execPath, [path.join(__dirname, script), ...args], { stdio: 'inherit' });
  return r.status;
}

// 1) Descargar
let code = run('download-cadecom.mjs', show ? ['--show'] : []);
if (code !== 0) {
  console.error(`\n❌ La descarga falló (código ${code}). No se sube nada.`);
  if (code === 2) console.error('   → Tu sesión de CADECOM expiró. Corré:  node login-cadecom.mjs');
  process.exit(code);
}

// 2) Sincronizar a Supabase (toma el último Excel de Descargas)
code = run('sync-cadecom.mjs');
process.exit(code);
