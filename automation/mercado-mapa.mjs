/* ════════════════════════════════════════════════════════════════
   Mapeo de modelos: catálogo de la Calculadora (Admin de ventas) →
   nombre(s) de modelo en el patentamiento de Cadecom (MODELO_INFO / RAW_DATA).

   La CLAVE debe coincidir EXACTO con motos.modelo de la Calculadora.
   El VALOR es la lista de nombres de modelo tal como aparecen en Cadecom
   (varios trims de la Calculadora pueden compartir un mismo nombre de Cadecom;
   el builder deduplica por nombre de Cadecom para que el total de marca no
   cuente doble). Lista vacía [] = modelo sin patentamiento en Cadecom → el
   Dashboard lo muestra "sin mapear".

   Confirmado con Mariano (22/9/2026). Al sumar/ajustar modelos, editar acá y
   regenerar (lo hace solo el sync-cadecom.mjs).
   ════════════════════════════════════════════════════════════════ */
export const MERCADO_MAPA = {
  YAMAHA: {
    'FZ 4.0':       ['FZ-S FI V4.0 ABS'],   // solo V4.0 (no V3.0 ni FZ-S FI viejas)
    'NMAX':         ['NMAX CONNECTED'],
    'Fascino':      ['FASCINO 125FI'],
    'XMAX 300':     ['XMAX'],
    'FZ25 ABS':     ['FZ25 ABS'],           // FZ25 (sin ABS) queda como SKU aparte
    'XTZ 125':      ['XTZ125E'],
    'R7 Nuevo':     ['YZF R7'],
    'Ray ZR 125':   ['RAY ZR 125 FI'],
    'MT 09':        ['MT 09'],
    'MT 03':        ['MT03 ABS'],
    'Raptor 700':   ['YFM700 R'],
    'XTZ 250 ABS':  ['XTZ250 ABS'],
    'Tenere 700':   ['TENERE 700'],
    'MT 07':        ['MT07'],
    'FZ X':         ['FZ-X'],
  },
  MOTOMEL: {
    'CG S2':                  ['S2'],        // CG S2 y CG S2 Full comparten "S2" (dedup en el total)
    'CG S2 Full':             ['S2'],
    'Skua 250':               ['SKUA 250'],
    'Skua 150':               [],            // es otra moto: no matchea con las Skua del registro
    'Blitz One Full':         ['B 110'],     // las Blitz se unifican en "B 110"
    'Blitz One Start (Base)': ['B 110'],
  },
  VOGE: {
    '300 Rally':            ['VOGE 300 RALLY'],
    'DS 300':              ['VOGE 300DS'],
    'DS 500':              ['VOGE 500DS'],
    'DS525X BLACK NIGHT':  ['VOGE DS525X'],
    'SR3':                 ['VOGE SR3'],
  },
  SIAM: {
    'Nomad 150 End': ['NOMAD 150'],
    'QU 110 Full':   ['QU 110'],
    'Trender 150cc': ['TRENDER 150'],
  },
  HERO: {
    'Hunk 125':      ['HUNK 125R'],
    'Hunk 150':      ['HUNK 150'],
    'Hunk 150 Xtec': ['HUNK150 XTEC'],
    'Xpulse 200':    ['XPULSE 200'],
  },
  SUZUKI: {
    'AX100': ['AX 100'],
    'GX150': ['GSX150'],
  },
  GAF: {
    'GX 140': ['GX 140'],
    'GX 70':  ['GX 70'],
  },
  TVS: {
    'Raider 125': ['RAIDER'],
  },
  SYM: {
    'JOYRIDE 300': ['JOYRIDE 300'],
  },
  MORBIDELLI: {
    'N300': [],   // sin patentamiento reciente en Cadecom
  },
  IKA: {
    'Durban End.': [],
  },
};

// Localidades curadas de las zonas virtuales (deben coincidir con shared.js de Cadecom).
export const AMBA_LOCS = ['ADROGUE', 'AVELLANEDA', 'BERAZATEGUI', 'BERISSO', 'BRANDSEN', 'CABA', 'CAMPANA', 'CANUELAS', 'CAPILLA DEL SENOR', 'ENSENADA', 'ESCOBAR', 'ESTEBAN ECHEVERRIA', 'EZEIZA', 'FLORENCIO VARELA', 'GENERAL RODRIGUEZ', 'JOSE C. PAZ', 'LA MATANZA', 'LA PLATA', 'LANUS', 'LOMAS DE ZAMORA', 'LUJAN', 'MALVINAS ARGENTINAS', 'MARCOS PAZ', 'MERLO', 'MORENO', 'MORON', 'OLIVOS', 'PILAR', 'QUILMES', 'SAN FERNANDO', 'SAN ISIDRO', 'SAN MARTIN', 'SAN MIGUEL', 'SAN VICENTE', 'TIGRE', 'TRES DE FEBRERO', 'ZARATE'];
export const ZONA_PACHECO_LOCS = ['SAN ISIDRO', 'SAN FERNANDO', 'TIGRE', 'ESCOBAR', 'PILAR', 'JOSE C. PAZ', 'MALVINAS ARGENTINAS', 'SAN MIGUEL', 'SAN MARTIN', 'OLIVOS', 'ZARATE', 'CAMPANA', 'CAPILLA DEL SENOR'];
export const ZONA_PACHECO = 'ZONA PACHECO';
