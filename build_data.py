import pandas as pd
import glob
import os
import json
import unicodedata

def normalize_string(s):
    """Normalizar string: remover acentos y caracteres especiales"""
    if not isinstance(s, str):
        return str(s)
    nfd = unicodedata.normalize('NFD', s)
    return ''.join(c for c in nfd if unicodedata.category(c) != 'Mn').upper().strip()

FOLDER     = r'C:\Users\Mariano Mastronardi\Desktop\Pacheco\Cadecom\Fuentes\Marca - Modelo'
LOC_FOLDER = r'C:\Users\Mariano Mastronardi\Desktop\Pacheco\Cadecom\Fuentes\Localidad - Modelo'
CIL_FOLDER = r'C:\Users\Mariano Mastronardi\Desktop\Pacheco\Cadecom\Fuentes\Modelo - Cilindrada'
OUT_JS     = r'C:\Users\Mariano Mastronardi\Desktop\Pacheco\Cadecom\data.js'

# ===== 1. BUILD CILINDRADA MAP =====
# Acumular ventas por (modelo, cilindrada) y asignar a cada modelo la cilindrada
# con MAYOR volumen (evita errores de carga: ej. una fila espuria de 1 unidad
# mal clasificada que sobrescribía la correcta)
cil_volume = {}  # (modelo) -> {cilindrada: total_ventas}
cil_files = sorted(glob.glob(CIL_FOLDER + r'\*.xlsx'))
for cf in cil_files:
    df = pd.read_excel(cf, sheet_name='Consulta', header=0)
    total_col = 'Total' if 'Total' in df.columns else None
    for _, row in df.iterrows():
        modelo = str(row.iloc[0]).strip()
        cil = str(row.iloc[1]).strip()
        if modelo and modelo not in ('Modelo', 'nan') and pd.notna(row.iloc[1]) and cil != 'nan':
            total = 0
            if total_col is not None and pd.notna(row.get(total_col)):
                try:
                    total = int(row.get(total_col))
                except (ValueError, TypeError):
                    total = 0
            cil_volume.setdefault(modelo, {})
            cil_volume[modelo][cil] = cil_volume[modelo].get(cil, 0) + total

cil_map = {}
for modelo, cils in cil_volume.items():
    # Elegir la cilindrada con mayor volumen acumulado
    cil_map[modelo] = max(cils.items(), key=lambda x: x[1])[0]
print(f'Cilindrada map: {len(cil_map)} modelos')

# ===== 2. BUILD MODELO → MARCA MAPPING =====
modelo_marca = {}
marca_files = sorted(glob.glob(FOLDER + r'\consulta_periodo_*.xlsx'))
for mf in marca_files:
    try:
        df = pd.read_excel(mf, sheet_name='Consulta', header=0)
        for _, row in df.iterrows():
            marca = str(row.get('Marca', '')).strip()
            modelo = str(row.get('Modelo', '')).strip()
            if marca and modelo and marca not in ('Marca', 'nan') and modelo not in ('Modelo', 'nan'):
                if modelo not in modelo_marca:
                    modelo_marca[modelo] = marca
    except:
        pass
print(f'Modelo-Marca map: {len(modelo_marca)} modelos')

# ===== 3. BUILD GEOGRAPHIC MAPPINGS =====
ZONA_LOC_FILE = r'C:\Users\Mariano Mastronardi\Desktop\Pacheco\Cadecom\Fuentes\Zona - Provincia - Localidad\consulta_normal_2026-01-01_2026-05-31_20260601_091749.xlsx'
ZONA_PROV_FILE = r'C:\Users\Mariano Mastronardi\Desktop\Pacheco\Cadecom\Fuentes\Zona - Provincia - Localidad\consulta_normal_2026-01-01_2026-05-31_20260601_091743.xlsx'

localidad_provincia = {}
localidad_provincia_norm = {}  # normalized → original
try:
    df_loc_prov = pd.read_excel(ZONA_LOC_FILE, header=0)
    for _, row in df_loc_prov.iterrows():
        loc = str(row.get('Localidad', '')).strip() if pd.notna(row.get('Localidad')) else ''
        prov = str(row.get('Provincia', '')).strip() if pd.notna(row.get('Provincia')) else ''
        if loc and prov and loc != 'nan' and prov != 'nan':
            localidad_provincia[loc] = prov
            # Also store normalized version for fuzzy matching
            localidad_provincia_norm[normalize_string(loc)] = loc
except:
    pass
print(f'Localidad-Provincia map: {len(localidad_provincia)} localidades')

provincia_zona = {}
try:
    df_prov_zona = pd.read_excel(ZONA_PROV_FILE, header=0)
    for _, row in df_prov_zona.iterrows():
        prov = str(row.get('Provincia', '')).strip() if pd.notna(row.get('Provincia')) else ''
        zona = str(row.get('Zona', '')).strip() if pd.notna(row.get('Zona')) else ''
        if prov and zona and prov != 'nan' and zona != 'nan':
            provincia_zona[prov] = zona.upper()
except:
    pass
print(f'Provincia-Zona map: {len(provincia_zona)} provincias')

# Build reverse mappings
zona_localidades = {}
provincia_localidades = {}

for localidad, provincia in localidad_provincia.items():
    zona = provincia_zona.get(provincia, '').upper()

    if provincia not in provincia_localidades:
        provincia_localidades[provincia] = set()
    provincia_localidades[provincia].add(localidad)

    if zona:
        if zona not in zona_localidades:
            zona_localidades[zona] = set()
        zona_localidades[zona].add(localidad)

zona_localidades = {z: sorted(list(locs)) for z, locs in zona_localidades.items()}
provincia_localidades = {p: sorted(list(locs)) for p, locs in provincia_localidades.items()}

# Remover RUNA (zona que no existe)
zona_localidades.pop('RUNA', None)

print(f'Zona-Localidades: {len(zona_localidades)} zonas')
print(f'Provincia-Localidades: {len(provincia_localidades)} provincias')

# ===== 4. READ LOCALIDAD-MODELO SALES DATA =====
# Leer TODOS los archivos .xlsx (tanto consulta_periodo_ como consulta_normal_)
loc_files = sorted(glob.glob(LOC_FOLDER + r'\*.xlsx'))

print(f'\nLeyendo {len(loc_files)} archivos Localidad-Modelo...')

# Collect all months and build records
all_months_set = set()
records_dict = {}  # (marca, modelo, localidad) → {month: sales}

for lf in loc_files:
    df = pd.read_excel(lf, sheet_name='Consulta', header=0)
    month_cols = [c for c in df.columns if isinstance(c, str) and '-' in c and c != 'Total']
    all_months_set.update(month_cols)

    for _, row in df.iterrows():
        localidad = str(row.get('Localidad', '')).strip()
        modelo = str(row.get('Modelo', '')).strip()

        if not localidad or localidad in ('Localidad', 'nan') or not modelo or modelo == 'nan':
            continue

        # Try exact match first, then normalized match
        provincia = localidad_provincia.get(localidad)
        if not provincia:
            # Try normalized matching
            loc_norm = normalize_string(localidad)
            if loc_norm in localidad_provincia_norm:
                original_loc = localidad_provincia_norm[loc_norm]
                provincia = localidad_provincia.get(original_loc, '')

        marca = modelo_marca.get(modelo, 'UNKNOWN')
        zona = provincia_zona.get(provincia, '').upper() if provincia else ''
        cil = cil_map.get(modelo, 'Sin categoría')

        key = (marca, modelo, localidad)
        if key not in records_dict:
            records_dict[key] = {
                'marca': marca,
                'modelo': modelo,
                'cilindrada': cil,
                'localidad': localidad,
                'provincia': provincia,
                'zona': zona
            }

        for m in month_cols:
            val = row.get(m, 0)
            if pd.notna(val) and val > 0:
                # ACUMULAR ventas si ya existen (para manejar duplicados de múltiples archivos)
                records_dict[key][m] = records_dict[key].get(m, 0) + int(val)

# Sort months
all_months = sorted(all_months_set, key=lambda m: (int(m.split('-')[1]), int(m.split('-')[0])))

# Build final records with total (solo guardar meses con ventas > 0)
records = []
for rec in records_dict.values():
    total = 0
    # Eliminar meses con 0 ventas para reducir tamaño
    months_to_remove = [m for m in all_months if m in rec and rec[m] == 0]
    for m in months_to_remove:
        del rec[m]

    # Recalcular total solo con meses que existen
    for m in all_months:
        if m in rec:
            total += rec[m]

    if total > 0:
        rec['total'] = total
        records.append(rec)

print(f'Built {len(records)} records (Localidad-Modelo-Marca)')

# ===== 5. WRITE DATA.JS =====
import datetime
all_source_files = sorted(glob.glob(LOC_FOLDER + r'\*.xlsx'))
last_update = max(os.path.getmtime(f) for f in all_source_files) if all_source_files else None
last_update_str = datetime.datetime.fromtimestamp(last_update).strftime('%d/%m/%Y') if last_update else ''

js = f'const LAST_UPDATE = "{last_update_str}";\n'
js += 'const RAW_DATA = ' + json.dumps(records, ensure_ascii=False) + ';\n'
js += 'const ZONA_LOCALIDADES = ' + json.dumps(zona_localidades, ensure_ascii=False) + ';\n'
js += 'const PROVINCIA_LOCALIDADES = ' + json.dumps(provincia_localidades, ensure_ascii=False) + ';\n'

with open(OUT_JS, 'w', encoding='utf-8') as fh:
    fh.write(js)

print(f'\nOK: {len(records)} registros, {len(all_months)} meses')
print(f'Primer mes: {all_months[0]}  |  Último mes: {all_months[-1]}')
print(f'Archivo: {OUT_JS}')
