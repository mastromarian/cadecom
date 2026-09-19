/* ════════════════════════════════════════════════════════════════
   Código compartido entre Variaciones (index) y Evolutivo (evolutivo).
   Antes estaba duplicado casi verbatim en ambos HTML y ya había empezado
   a divergir (fuente de bugs, ej. la curación de AMBA). Acá viven las
   PRIMITIVAS idénticas: constantes geográficas, estado del multiselect,
   helpers de DOM del multiselect, matchZona, getFiltered (memoizado) y las
   listas dependientes (provincias/localidades).

   Cada página conserva su "cableado" propio (onMsChange, selectAllMs,
   clearMs, updateMsTrigger, refreshDependents, initFilters), porque
   difieren en qué recalculan (updateInsights vs update) y en el reset de
   paginación. Esas funciones page-specific usan las primitivas de acá.

   Requiere que data.js ya esté cargado al momento de LLAMAR (no al parsear):
   RAW_DATA, ALL_MONTHS, ZONA_LOCALIDADES, ZONA_PROVINCIAS, PROVINCIA_LOCALIDADES.
   ════════════════════════════════════════════════════════════════ */

// ── Marcas / cilindradas fijas ──
const PINNED_MARCAS = ['YAMAHA', 'SUZUKI', 'VOGE', 'HERO', 'MOTOMEL', 'SIAM', 'TVS', 'GAF'];
const CIL_ORDER = ['Hasta 110 cc', '111-150 cc', '151-250 cc', '251-500 cc', 'Más de 500 cc'];

// ── Zonas virtuales (curadas): matchean por localidad, no por r.zona ──
// Zona Pacheco: subconjunto de Buenos Aires por localidad cabecera de partido.
const ZONA_PACHECO = 'ZONA PACHECO';
const ZONA_PACHECO_LOCS = ['SAN ISIDRO', 'SAN FERNANDO', 'TIGRE', 'ESCOBAR', 'PILAR', 'JOSE C. PAZ', 'MALVINAS ARGENTINAS', 'SAN MIGUEL', 'SAN MARTIN', 'OLIVOS', 'ZARATE', 'CAMPANA', 'CAPILLA DEL SENOR'];
const ZP_SET = new Set(ZONA_PACHECO_LOCS);
// AMBA real (curada): en la base "AMBA" abarca TODA la provincia de Bs As; la acotamos
// al conurbano / AMBA-40. El interior de Bs As sigue accesible vía provincia = Buenos Aires.
const AMBA_LOCS = ['ADROGUE', 'AVELLANEDA', 'BERAZATEGUI', 'BERISSO', 'BRANDSEN', 'CABA', 'CAMPANA', 'CANUELAS', 'CAPILLA DEL SENOR', 'ENSENADA', 'ESCOBAR', 'ESTEBAN ECHEVERRIA', 'EZEIZA', 'FLORENCIO VARELA', 'GENERAL RODRIGUEZ', 'JOSE C. PAZ', 'LA MATANZA', 'LA PLATA', 'LANUS', 'LOMAS DE ZAMORA', 'LUJAN', 'MALVINAS ARGENTINAS', 'MARCOS PAZ', 'MERLO', 'MORENO', 'MORON', 'OLIVOS', 'PILAR', 'QUILMES', 'SAN FERNANDO', 'SAN ISIDRO', 'SAN MARTIN', 'SAN MIGUEL', 'SAN VICENTE', 'TIGRE', 'TRES DE FEBRERO', 'ZARATE'];
const AMBA_SET = new Set(AMBA_LOCS);
const VIRTUAL_ZONAS = { 'AMBA': AMBA_SET, [ZONA_PACHECO]: ZP_SET };

// ── Estado del multiselect ──
const MS_SEP = '__sep__';   // ítem separador (divisor visual, no seleccionable)
const MS_LABELS = { marca: 'marcas', modelo: 'modelos', cil: 'cilindradas', zona: 'zonas', provincia: 'provincias', localidad: 'localidades' };
const msState = { marca: new Set(), modelo: new Set(), cil: new Set(), zona: new Set(), provincia: new Set(), localidad: new Set() };
const msAllItems = { marca: [], modelo: [], cil: [], zona: [], provincia: [], localidad: [] };

// ── Helpers de DOM del multiselect ──
const msItemHtml = key => v =>
  v === MS_SEP ? '<div class="ms-sep"></div>' :
  `<label class="ms-item"><input type="checkbox" value="${v}" onchange="onMsChange('${key}',this.value,this.checked)" ${msState[key].has(v) ? 'checked' : ''}><span>${v}</span></label>`;

function buildMsList(key, items) {
  msAllItems[key] = items;
  const list = document.getElementById(`ms-${key}-list`);
  if (!list) return;
  list.innerHTML = items.map(msItemHtml(key)).join('');
}

function filterMsList(key, q) {
  const items = msAllItems[key].filter(v => v !== MS_SEP && v.toLowerCase().includes(q.toLowerCase()));
  document.getElementById(`ms-${key}-list`).innerHTML = items.map(msItemHtml(key)).join('');
}

function toggleMs(key, event) {
  event && event.stopPropagation();
  const drop = document.getElementById(`ms-${key}-drop`);
  const trigger = document.getElementById(`ms-${key}-trigger`);
  const isOpen = drop.classList.contains('open');
  document.querySelectorAll('.ms-dropdown.open').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.ms-trigger.open').forEach(t => t.classList.remove('open'));
  if (!isOpen) {
    const rect = trigger.getBoundingClientRect();
    drop.style.top  = (rect.bottom + 4) + 'px';
    drop.style.left = rect.left + 'px';
    drop.classList.add('open');
    trigger.classList.add('open');
  }
}
// Cerrar dropdowns al clickear afuera
document.addEventListener('click', e => {
  if (!e.target.closest('.ms-wrap')) {
    document.querySelectorAll('.ms-dropdown.open').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.ms-trigger.open').forEach(t => t.classList.remove('open'));
  }
});

// ── Ítems de los filtros Marca y Cilindrada ──
// Marca en 3 tramos: fijadas · top 20 por volumen del último mes (alfabético) · resto.
function marcaItems() {
  const all = [...new Map(RAW_DATA.map(r => [r.marca.toUpperCase(), r.marca])).values()];
  const pinnedSet = new Set(PINNED_MARCAS);
  const pinned = PINNED_MARCAS.filter(m => all.includes(m));
  const lastMonth = (typeof ALL_MONTHS !== 'undefined' && ALL_MONTHS.length) ? ALL_MONTHS[ALL_MONTHS.length - 1] : null;
  const vol = {};
  RAW_DATA.forEach(r => { vol[r.marca] = (vol[r.marca] || 0) + (lastMonth ? (r[lastMonth] || 0) : (r.total || 0)); });
  const nonPinned = all.filter(m => !pinnedSet.has(m));
  const top20 = [...nonPinned].sort((a, b) => (vol[b] || 0) - (vol[a] || 0)).slice(0, 20).sort((a, b) => a.localeCompare(b));
  const top20Set = new Set(top20);
  const rest = nonPinned.filter(m => !top20Set.has(m)).sort((a, b) => a.localeCompare(b));
  const out = [];
  if (pinned.length) out.push(...pinned, MS_SEP);
  out.push(...top20);
  if (rest.length) out.push(MS_SEP, ...rest);
  return out;
}
// Cilindrada: orden fijo + separador + Sin categoría al final.
function cilItems() {
  const present = new Set(RAW_DATA.map(r => r.cilindrada));
  const cats = CIL_ORDER.filter(c => present.has(c));
  if (present.has('Sin categoría')) cats.push(MS_SEP, 'Sin categoría');
  return cats;
}

// ── Zona: virtuales matchean por localidad; macro-regiones por r.zona ──
function matchZona(r) {
  if (msState.zona.size === 0) return true;
  for (const z of msState.zona) {
    if (VIRTUAL_ZONAS[z]) { if (VIRTUAL_ZONAS[z].has(r.localidad)) return true; }
    else if (z === r.zona) return true;
  }
  return false;
}

// ── getFiltered() memoizado por firma de filtros ──
function filtersSignature() {
  return ['marca', 'modelo', 'cil', 'zona', 'provincia', 'localidad']
    .map(k => k + ':' + [...msState[k]].sort().join(',')).join('|');
}
let _gfSig = null, _gfCache = null;
function invalidateFiltered() { _gfSig = null; _gfCache = null; }  // llamar si cambia RAW_DATA (historia)
function getFiltered() {
  const sig = filtersSignature();
  if (sig === _gfSig && _gfCache) return _gfCache;
  _gfSig = sig;
  _gfCache = RAW_DATA.filter(r =>
    (msState.marca.size === 0     || msState.marca.has(r.marca)) &&
    (msState.modelo.size === 0    || msState.modelo.has(r.modelo)) &&
    (msState.cil.size === 0       || msState.cil.has(r.cilindrada)) &&
    matchZona(r) &&
    (msState.provincia.size === 0 || msState.provincia.has(r.provincia)) &&
    (msState.localidad.size === 0 || msState.localidad.has(r.localidad))
  );
  return _gfCache;
}

// ── Listas dependientes (cascada) ──
// Provincias disponibles según las zonas seleccionadas (relación real zona→provincia).
function populateProvincias() {
  const zonas = [...msState.zona];
  let provs;
  if (zonas.length === 0) {
    provs = Object.keys(PROVINCIA_LOCALIDADES).sort();
  } else {
    const set = new Set();
    zonas.forEach(z => {
      if (z === ZONA_PACHECO) set.add('BUENOS AIRES');
      else if (z === 'AMBA') { set.add('BUENOS AIRES'); set.add('CABA'); }
      else (ZONA_PROVINCIAS[z] || []).forEach(p => set.add(p));
    });
    provs = [...set].sort();
  }
  const provsSet = new Set(provs);
  msState.provincia.forEach(p => { if (!provsSet.has(p)) msState.provincia.delete(p); });
  buildMsList('provincia', provs);
  updateMsTrigger('provincia');
}

// Localidades disponibles: intersección de las zonas Y las provincias seleccionadas.
// Así, AMBA + Buenos Aires muestra solo las localidades de AMBA (no toda la provincia).
function populateLocalidades() {
  const zonas = [...msState.zona];
  const provs = [...msState.provincia];

  let byZona = null;
  if (zonas.length > 0) {
    byZona = new Set();
    zonas.forEach(z => {
      if (z === ZONA_PACHECO) ZONA_PACHECO_LOCS.forEach(l => byZona.add(l));
      else if (z === 'AMBA') AMBA_LOCS.forEach(l => byZona.add(l));
      else (ZONA_LOCALIDADES[z] || []).forEach(l => byZona.add(l));
    });
  }
  let byProv = null;
  if (provs.length > 0) {
    byProv = new Set();
    provs.forEach(p => (PROVINCIA_LOCALIDADES[p] || []).forEach(l => byProv.add(l)));
  }

  let locs;
  if (byZona && byProv)      locs = [...byZona].filter(l => byProv.has(l));
  else if (byZona)           locs = [...byZona];
  else if (byProv)           locs = [...byProv];
  else                       locs = Object.values(PROVINCIA_LOCALIDADES).flat();

  locs = [...new Set(locs)].sort();
  const locsSet = new Set(locs);
  msState.localidad.forEach(l => { if (!locsSet.has(l)) msState.localidad.delete(l); });
  buildMsList('localidad', locs);
  updateMsTrigger('localidad');
}
