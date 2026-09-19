/* ════════════════════════════════════════════════════════════════
   Carga de datos (data.js / data-historia.js) desde Supabase Storage.

   Antes se cargaban con <script src=".../object/public/cadecom/...">, lo que
   exigía que el bucket fuera PÚBLICO (cualquiera con la URL bajaba todo el
   dataset sin login). Ahora se bajan autenticado con la sesión del usuario
   (sb.storage.download), de modo que el bucket puede ser privado y los datos
   sólo son accesibles para usuarios logueados.

   - Deployado + logueado  → download() usa el JWT del usuario (bucket privado OK).
   - Local / sin sesión    → download() con anon funciona sólo si el bucket sigue
                             público; si no, cae al fetch del endpoint público
                             como último recurso (útil durante la transición).

   El texto bajado se inyecta como <script> (NO eval) para preservar los
   `const ALL_MONTHS`, `RAW_DATA`, etc. como globales de script, igual que antes.
   ════════════════════════════════════════════════════════════════ */
(function () {
  const BUCKET = (window.CADECOM_BUCKET || 'cadecom');
  const PUBLIC_BASE = (window.CADECOM_STORAGE ||
    'https://cazdzwigtazmecixhuiw.supabase.co/storage/v1/object/public/cadecom/');

  async function fetchText(name) {
    // 1) Vía autenticada (funciona con bucket privado si hay sesión y policy de lectura)
    if (window.sb && window.sb.storage) {
      try {
        const { data, error } = await window.sb.storage.from(BUCKET).download(name);
        if (!error && data) return await data.text();
      } catch (e) { /* cae al fallback */ }
    }
    // 2) Fallback: endpoint público (sólo sirve si el bucket todavía es público)
    const r = await fetch(PUBLIC_BASE + name);
    if (!r.ok) throw new Error(name + ': HTTP ' + r.status);
    return await r.text();
  }

  function injectScript(text) {
    // Ejecuta sincrónicamente al hacer append: define los globals del archivo.
    const s = document.createElement('script');
    s.textContent = text;
    document.head.appendChild(s);
  }

  // Baja un binario del bucket (ej. BD_Geo.xlsx, BD_Motos.xlsx) como ArrayBuffer,
  // autenticado (bucket privado) con fallback público. `download()` siempre trae la
  // copia fresca vía API, así que no hace falta cache-buster (?t=...).
  window.cadecomFetchBuffer = async function (name) {
    if (window.sb && window.sb.storage) {
      try {
        const { data, error } = await window.sb.storage.from(BUCKET).download(name);
        if (!error && data) return await data.arrayBuffer();
      } catch (e) { /* cae al fallback */ }
    }
    const r = await fetch(PUBLIC_BASE + name);
    if (!r.ok) throw new Error(name + ': HTTP ' + r.status);
    return await r.arrayBuffer();
  };

  // Baja + inyecta data.js, llama onReady(), y (opcional) baja la historia en diferido.
  window.loadCadecomData = async function ({ onReady, withHistoria } = {}) {
    const t = await fetchText('data.js');   // define ALL_MONTHS, RAW_DATA, MODELO_INFO, ...
    injectScript(t);
    if (typeof onReady === 'function') onReady();
    if (withHistoria) {
      // La historia (2013-2023, ~23MB) se funde en RAW_DATA y al terminar llama
      // a onHistoriaLoaded() (definido por cada página). Va en segundo plano.
      fetchText('data-historia.js')
        .then(injectScript)
        .catch(e => console.warn('data-historia:', e.message));
    }
  };
})();
