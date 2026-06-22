/* ════════════════════════════════════════════════════════════════
   CadecomBuild — reprocesamiento en el navegador (usa SheetJS / XLSX).

   Estrategia: ACTUALIZACIÓN INCREMENTAL. El encargado sube UN archivo de
   un año; solo se parsea ese archivo (+ BD_Geo/BD_Motos, que son chicos) y
   se reemplaza ese año dentro de la data ya cargada, regenerando en memoria.
   Así evitamos reparsear los 14 Excel (que tarda ~2 min).

   Requiere window.XLSX (SheetJS).
   ════════════════════════════════════════════════════════════════ */
const CadecomBuild = (function () {
  const JUNK = new Set(['TOTAL GENERAL', 'NAN', '']);
  const RECENT_FROM_YEAR = 2024;
  const MONTH_RE = /^\d{2}-\d{4}$/;
  const pad = n => String(n).padStart(2, '0');
  const err = m => { const e = new Error(m); e.userMessage = m; return e; };

  const _normCache = new Map();
  function norm(s) {
    if (typeof s !== 'string') s = String(s == null ? '' : s);
    const hit = _normCache.get(s);
    if (hit !== undefined) return hit;
    let v = s.replace(/[ÐðÑñ]/g, 'N').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
    _normCache.set(s, v);
    return v;
  }
  function readSheet(buf, sheetName) {
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[sheetName] || wb.Sheets[wb.SheetNames[0]];
    return ws ? XLSX.utils.sheet_to_json(ws, { defval: 0 }) : [];
  }
  function monthSort(a, b) {
    const [ma, ya] = a.split('-'), [mb, yb] = b.split('-');
    return ya === yb ? (+ma - +mb) : (+ya - +yb);
  }

  // ---- BD_Geo + BD_Motos (chicos) ----
  function loadGeoMotos(geoBuf, motosBuf) {
    const geoByLoc = {}, zonaLoc = {}, provLoc = {};
    readSheet(geoBuf, 'Geo').forEach(r => {
      const loc = String(r['Localidad'] ?? '').trim();
      const prov = String(r['Provincia'] ?? '').trim();
      const zona = String(r['Zona'] ?? '').trim().toUpperCase();
      if (!loc || JUNK.has(norm(loc))) return;
      geoByLoc[norm(loc)] = { localidad: loc, provincia: prov, zona: zona };
      if (zona) (zonaLoc[zona] = zonaLoc[zona] || new Set()).add(loc);
      if (prov) (provLoc[prov] = provLoc[prov] || new Set()).add(loc);
    });
    const sortSets = o => { const out = {}; Object.keys(o).forEach(k => out[k] = [...o[k]].sort((a, b) => a.localeCompare(b))); return out; };
    const zonaLocalidades = sortSets(zonaLoc); delete zonaLocalidades['RUNA'];
    const provinciaLocalidades = sortSets(provLoc);

    const motoByModelo = {};
    readSheet(motosBuf, 'Consulta').forEach(r => {
      const modelo = String(r['Modelo'] ?? '').trim();
      const marca = String(r['Marca'] ?? '').trim();
      const cil = String(r['Cilindrada'] ?? '').trim();
      if (!modelo || JUNK.has(norm(modelo))) return;
      const k = norm(modelo);
      if (!(k in motoByModelo)) motoByModelo[k] = {
        marca: (marca && marca !== 'nan') ? marca : 'SIN MARCA',
        cilindrada: (cil && cil !== 'nan') ? cil : 'Sin categoría'
      };
    });
    return { geoByLoc, motoByModelo, zonaLocalidades, provinciaLocalidades };
  }

  // ---- Validar el Excel subido (por contenido) y devolver {year, monthCols, warnings} ----
  function validateYearFile(buf, opts) {
    const existingMonths = (opts && opts.allMonths) || [];
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets['Consulta'];
    if (!ws) throw err('El Excel no tiene una hoja llamada "Consulta".');
    const rows = XLSX.utils.sheet_to_json(ws, { defval: 0 });
    if (!rows.length) throw err('La hoja "Consulta" está vacía.');
    const cols = Object.keys(rows[0]);
    if (!cols.includes('Localidad')) throw err('Falta la columna "Localidad".');
    if (!cols.includes('Modelo')) throw err('Falta la columna "Modelo".');
    const monthCols = cols.filter(c => typeof c === 'string' && MONTH_RE.test(c) && c !== 'Total');
    if (!monthCols.length) throw err('No se encontraron columnas de meses con formato MM-AAAA.');

    const years = [...new Set(monthCols.map(c => c.split('-')[1]))];
    if (years.length !== 1) throw err('Las columnas de meses mezclan más de un año (' + years.join(', ') + ').');
    const year = +years[0];
    const monthsNum = monthCols.map(c => +c.split('-')[0]).sort((a, b) => a - b);
    if (monthsNum[0] !== 1) throw err('El archivo tiene que empezar en enero (falta 01-' + year + ').');
    for (let i = 0; i < monthsNum.length; i++)
      if (monthsNum[i] !== i + 1) throw err('Faltan meses intermedios: deben ser consecutivos desde enero.');
    const lastMonth = monthsNum[monthsNum.length - 1];

    const now = new Date(), nowY = now.getFullYear(), nowM = now.getMonth() + 1;
    const warnings = [];
    if (year > nowY) throw err('No se permite cargar un año futuro (' + year + ').');
    if (year < nowY) {
      if (lastMonth !== 12) throw err('El año ' + year + ' es pasado: tiene que estar COMPLETO (enero a diciembre). Este archivo llega hasta ' + pad(lastMonth) + '-' + year + '.');
    } else {
      if (lastMonth > nowM) warnings.push('El archivo llega hasta ' + pad(lastMonth) + '-' + year + ', un mes que todavía no terminó.');
      const existingLast = existingMonths.filter(m => +m.split('-')[1] === year).map(m => +m.split('-')[0]).reduce((a, b) => Math.max(a, b), 0);
      if (existingLast && lastMonth < existingLast) warnings.push('Ya había datos de ' + year + ' hasta ' + pad(existingLast) + '-' + year + '; este archivo llega solo hasta ' + pad(lastMonth) + '-' + year + ' (se perderían esos meses).');
    }
    return { year, monthCols, rows, warnings };
  }

  // ---- Generar el texto de data.js / data-historia.js a partir de records ----
  // records: { 'modelo|loc': { modelo, localidad, _m:{mes:unid} } }
  function generate(records, maps) {
    const { geoByLoc, motoByModelo, zonaLocalidades, provinciaLocalidades } = maps;
    const allMonthsSet = new Set();
    Object.keys(records).forEach(k => { for (const m in records[k]._m) allMonthsSet.add(m); });
    const allMonths = [...allMonthsSet].sort(monthSort);
    const recentMonths = allMonths.filter(m => +m.split('-')[1] >= RECENT_FROM_YEAR);
    const histMonths = allMonths.filter(m => +m.split('-')[1] < RECENT_FROM_YEAR);

    const modeloInfo = {}, locInfo = {}, recent = [], hist = [];
    Object.keys(records).forEach(key => {
      const rec = records[key];
      let total = 0; for (const m in rec._m) total += rec._m[m];
      if (total <= 0) return;
      if (!(rec.modelo in modeloInfo)) {
        const mo = motoByModelo[norm(rec.modelo)];
        modeloInfo[rec.modelo] = mo ? [mo.marca, mo.cilindrada] : ['SIN MARCA', 'Sin categoría'];
      }
      if (!(rec.localidad in locInfo)) {
        const ge = geoByLoc[norm(rec.localidad)];
        locInfo[rec.localidad] = ge ? [ge.provincia, ge.zona] : ['', ''];
      }
      const rOut = { o: rec.modelo, l: rec.localidad }; let rTot = 0;
      recentMonths.forEach(m => { const v = rec._m[m] || 0; if (v > 0) { rOut[m] = v; rTot += v; } });
      if (rTot > 0) { rOut.t = rTot; recent.push(rOut); }
      const hOut = { o: rec.modelo, l: rec.localidad }; let hasH = false;
      histMonths.forEach(m => { const v = rec._m[m] || 0; if (v > 0) { hOut[m] = v; hasH = true; } });
      if (hasH) hist.push(hOut);
    });

    const now = new Date();
    const lastUpdate = pad(now.getDate()) + '/' + pad(now.getMonth() + 1) + '/' + now.getFullYear();
    const REH = 'function _rehydrate(r){var mi=MODELO_INFO[r.o]||["SIN MARCA","Sin categoría"];' +
      'var li=LOCALIDAD_INFO[r.l]||["",""];r.modelo=r.o;r.localidad=r.l;r.total=r.t||0;' +
      'r.marca=mi[0];r.cilindrada=mi[1];r.provincia=li[0];r.zona=li[1];return r;}\n';

    let dataJs = 'const LAST_UPDATE = "' + lastUpdate + '";\n';
    dataJs += 'const ALL_MONTHS = ' + JSON.stringify(allMonths) + ';\n';
    dataJs += 'const MODELO_INFO = ' + JSON.stringify(modeloInfo) + ';\n';
    dataJs += 'const LOCALIDAD_INFO = ' + JSON.stringify(locInfo) + ';\n';
    dataJs += 'const ZONA_LOCALIDADES = ' + JSON.stringify(zonaLocalidades) + ';\n';
    dataJs += 'const PROVINCIA_LOCALIDADES = ' + JSON.stringify(provinciaLocalidades) + ';\n';
    dataJs += 'const RAW_DATA = ' + JSON.stringify(recent) + ';\n' + REH + 'RAW_DATA.forEach(_rehydrate);\n';

    let historiaJs = 'const RAW_DATA_HIST = ' + JSON.stringify(hist) + ';\n';
    historiaJs += '(function(){var idx={};for(var i=0;i<RAW_DATA.length;i++){var r=RAW_DATA[i];idx[r.o+"|"+r.l]=r;}' +
      'RAW_DATA_HIST.forEach(function(h){var k=h.o+"|"+h.l,r=idx[k];if(!r){r={o:h.o,l:h.l};_rehydrate(r);RAW_DATA.push(r);idx[k]=r;}' +
      'for(var key in h){if(key!=="o"&&key!=="l"){r[key]=h[key];}}});' +
      'RAW_DATA.forEach(function(r){var t=0;for(var key in r){if(/^\\d{2}-\\d{4}$/.test(key))t+=r[key];}r.t=t;r.total=t;});' +
      'if(typeof onHistoriaLoaded==="function")onHistoriaLoaded();})();\n';

    return {
      dataJs, historiaJs,
      stats: { meses: allMonths.length, primerMes: allMonths[0], ultimoMes: allMonths[allMonths.length - 1],
        recientes: recent.length, historia: hist.length, modelos: Object.keys(modeloInfo).length, localidades: Object.keys(locInfo).length }
    };
  }

  // ---- Convierte RAW_DATA (ya rehidratado en la página) a records {key:{modelo,localidad,_m}} ----
  function recordsFromRawData(RAW_DATA) {
    const records = {};
    RAW_DATA.forEach(r => {
      const modelo = r.o ?? r.modelo, localidad = r.l ?? r.localidad;
      const key = modelo + '|' + localidad;
      let rec = records[key];
      if (!rec) rec = records[key] = { modelo, localidad, _m: {} };
      for (const k in r) if (MONTH_RE.test(k) && r[k] > 0) rec._m[k] = r[k];
    });
    return records;
  }

  /* PRODUCCIÓN: actualización incremental al subir un archivo de un año.
     opts = { yearFileBuf, geoBuf, motosBuf, RAW_DATA, ALL_MONTHS }
     - RAW_DATA: el array global ya cargado y rehidratado (recientes + historia)
     Devuelve { dataJs, historiaJs, year, warnings, stats } o lanza error de validación. */
  function processUpload(opts) {
    const v = validateYearFile(opts.yearFileBuf, { allMonths: opts.ALL_MONTHS || [] });
    const maps = loadGeoMotos(opts.geoBuf, opts.motosBuf);

    // records actuales (de toda la data ya cargada)
    const records = recordsFromRawData(opts.RAW_DATA);

    // borrar el año a reemplazar de todos los records
    const yearSuffix = '-' + v.year;
    Object.keys(records).forEach(k => { const m = records[k]._m; for (const mk in m) if (mk.endsWith(yearSuffix)) delete m[mk]; });

    // aplicar los valores del archivo subido
    v.rows.forEach(r => {
      const localidad = String(r['Localidad'] ?? '').trim();
      const modelo = String(r['Modelo'] ?? '').trim();
      const nLoc = norm(localidad), nMod = norm(modelo);
      if (JUNK.has(nLoc) || JUNK.has(nMod)) return;
      const geo = maps.geoByLoc[nLoc];
      const locCanon = geo ? geo.localidad : localidad;
      const key = modelo + '|' + locCanon;
      let rec = records[key];
      if (!rec) rec = records[key] = { modelo, localidad: locCanon, _m: {} };
      v.monthCols.forEach(m => {
        const x = r[m]; const n = typeof x === 'number' ? x : (x && !isNaN(+x) ? +x : 0);
        if (n > 0) rec._m[m] = (rec._m[m] || 0) + Math.round(n);
      });
    });

    const out = generate(records, maps);
    out.year = v.year;
    out.warnings = v.warnings;
    return out;
  }

  return { norm, validateYearFile, loadGeoMotos, generate, recordsFromRawData, processUpload };
})();
