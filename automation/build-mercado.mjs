/* ════════════════════════════════════════════════════════════════
   Genera `mercado-ciclofox.json`: un extracto COMPACTO del patentamiento
   de Cadecom, ya mapeado a los nombres de modelo de la Calculadora y
   restringido a las marcas que vende Ciclofox. Lo consume el Dashboard de
   la Calculadora para comparar sus ventas contra el mercado (MoM % y
   nominal, por modelo y total de marca, filtrable por zona).

   Estructura de salida:
   {
     generado, last_update,
     meses: ["MM-YYYY", ...],                 // meses presentes (recientes)
     zonas: { "AMBA": [loc...], "ZONA PACHECO":[...], "NOA":[...], ... },
     marcas: {
       "YAMAHA": {
         "FZ 4.0": { "SAN ISIDRO": { "09-2026": 3, ... }, ... },  // sparse: solo != 0
         ...
       }
     }
   }
   Se agrega por localidad (no por zona) para que el multiselect de zonas de
   la Calculadora una localidades sin doble contar (AMBA ⊃ Zona Pacheco).

   Uso:  node build-mercado.mjs <ruta data.js> [<salida.json>]
   Exporta buildMercado(dataJsText) para engancharlo en sync-cadecom.mjs.
   ════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import vm from 'vm';
import { MERCADO_MAPA, AMBA_LOCS, ZONA_PACHECO_LOCS, ZONA_PACHECO } from './mercado-mapa.mjs';

export function buildMercado(dataJsText) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(dataJsText + '\nthis.OUT={RAW_DATA,MODELO_INFO,ALL_MONTHS,ZONA_LOCALIDADES,LAST_UPDATE};', ctx);
  const { RAW_DATA, MODELO_INFO, ALL_MONTHS, ZONA_LOCALIDADES, LAST_UPDATE } = ctx.OUT;

  // Índice inverso: nombre-Cadecom → { marca, modeloCalc }
  const rev = {};
  for (const [marca, modelos] of Object.entries(MERCADO_MAPA)) {
    for (const [modeloCalc, nombresCadecom] of Object.entries(modelos)) {
      for (const n of nombresCadecom) rev[n] = { marca, modeloCalc };
    }
  }

  const monthRe = /^\d{2}-\d{4}$/;
  const marcas = {};
  const mesesSet = new Set();

  for (const r of RAW_DATA) {
    const hit = rev[r.o];
    if (!hit) continue;
    const { marca, modeloCalc } = hit;
    const loc = r.l;
    (marcas[marca] ??= {});
    (marcas[marca][modeloCalc] ??= {});
    const byMonth = (marcas[marca][modeloCalc][loc] ??= {});
    for (const k in r) {
      if (!monthRe.test(k)) continue;
      const u = r[k] || 0;
      if (!u) continue;
      byMonth[k] = (byMonth[k] || 0) + u;
      mesesSet.add(k);
    }
  }

  // Orden cronológico de meses según ALL_MONTHS
  const meses = ALL_MONTHS.filter(m => mesesSet.has(m));

  // Zonas seleccionables (igual criterio que shared.js de Cadecom):
  // AMBA curada + Zona Pacheco + el resto de ZONA_LOCALIDADES (menos el 'AMBA' crudo = toda Bs As)
  const zonas = { 'AMBA': AMBA_LOCS.slice(), [ZONA_PACHECO]: ZONA_PACHECO_LOCS.slice() };
  for (const [z, locs] of Object.entries(ZONA_LOCALIDADES || {})) {
    if (z === 'AMBA') continue;
    zonas[z] = locs;
  }

  return {
    generado: new Date().toISOString(),
    last_update: LAST_UPDATE || null,
    meses,
    zonas,
    marcas,
  };
}

// CLI
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('build-mercado.mjs')) {
  const inPath = process.argv[2];
  const outPath = process.argv[3] || 'mercado-ciclofox.json';
  if (!inPath) { console.error('uso: node build-mercado.mjs <data.js> [salida.json]'); process.exit(1); }
  const txt = fs.readFileSync(inPath, 'utf8');
  const out = buildMercado(txt);
  const json = JSON.stringify(out);
  fs.writeFileSync(outPath, json);
  const nModelos = Object.values(out.marcas).reduce((s, m) => s + Object.keys(m).length, 0);
  console.log(`OK → ${outPath}`);
  console.log(`  ${(json.length / 1024).toFixed(1)} KB | meses: ${out.meses.length} (${out.meses[0]}..${out.meses.at(-1)}) | zonas: ${Object.keys(out.zonas).length} | marcas: ${Object.keys(out.marcas).length} | modelos: ${nModelos}`);
}
