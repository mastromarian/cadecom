/* ════════════════════════════════════════════════════════════════
   Mapeo de modelos: catálogo de la Calculadora (Admin de ventas) →
   nombre(s) de modelo en el patentamiento de Cadecom (MODELO_INFO / RAW_DATA).

   La CLAVE debe coincidir EXACTO con motos.modelo de la Calculadora.
   El VALOR es la lista de nombres de modelo tal como aparecen en Cadecom
   (un modelo comercial puede figurar con 1+ nombres en el registro).

   Confirmado con Mariano (22/9/2026) para Yamaha. Al sumar marcas nuevas,
   agregar acá su bloque.
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
};

// Localidades curadas de las zonas virtuales (deben coincidir con shared.js de Cadecom).
export const AMBA_LOCS = ['ADROGUE', 'AVELLANEDA', 'BERAZATEGUI', 'BERISSO', 'BRANDSEN', 'CABA', 'CAMPANA', 'CANUELAS', 'CAPILLA DEL SENOR', 'ENSENADA', 'ESCOBAR', 'ESTEBAN ECHEVERRIA', 'EZEIZA', 'FLORENCIO VARELA', 'GENERAL RODRIGUEZ', 'JOSE C. PAZ', 'LA MATANZA', 'LA PLATA', 'LANUS', 'LOMAS DE ZAMORA', 'LUJAN', 'MALVINAS ARGENTINAS', 'MARCOS PAZ', 'MERLO', 'MORENO', 'MORON', 'OLIVOS', 'PILAR', 'QUILMES', 'SAN FERNANDO', 'SAN ISIDRO', 'SAN MARTIN', 'SAN MIGUEL', 'SAN VICENTE', 'TIGRE', 'TRES DE FEBRERO', 'ZARATE'];
export const ZONA_PACHECO_LOCS = ['SAN ISIDRO', 'SAN FERNANDO', 'TIGRE', 'ESCOBAR', 'PILAR', 'JOSE C. PAZ', 'MALVINAS ARGENTINAS', 'SAN MIGUEL', 'SAN MARTIN', 'OLIVOS', 'ZARATE', 'CAMPANA', 'CAPILLA DEL SENOR'];
export const ZONA_PACHECO = 'ZONA PACHECO';
