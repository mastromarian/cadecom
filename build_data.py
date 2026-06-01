import pandas as pd
import glob
import os
import json

FOLDER     = r'C:\Users\Mariano Mastronardi\Desktop\Pacheco\Cadecom\Fuentes\Marca - Modelo'
CIL_FOLDER = r'C:\Users\Mariano Mastronardi\Desktop\Pacheco\Cadecom\Fuentes\Modelo - Cilindrada'
OUT_JS     = r'C:\Users\Mariano Mastronardi\Desktop\Pacheco\Cadecom\data.js'

# Build modelo → cilindrada map from all files in Modelo-Cilindrada folder
cil_map = {}
cil_files = sorted(glob.glob(CIL_FOLDER + r'\*.xlsx'))
for cf in cil_files:
    df = pd.read_excel(cf, sheet_name='Consulta', header=0)
    for _, row in df.iterrows():
        modelo = str(row.iloc[0]).strip()
        cil    = str(row.iloc[1]).strip()
        if modelo and modelo not in ('Modelo', 'nan') and pd.notna(row.iloc[1]) and cil != 'nan':
            cil_map[modelo] = cil  # last file wins (most recent = most accurate)
print(f'Cilindrada map: {len(cil_map)} modelos')

# Build localidad map: (marca, modelo) → set of localidades
LOC_FOLDER = r'C:\Users\Mariano Mastronardi\Desktop\Pacheco\Cadecom\Fuentes\Localidad - Modelo'
loc_map = {}  # (marca, modelo) → set de localidades
loc_files = sorted(glob.glob(LOC_FOLDER + r'\*.xlsx'))
for lf in loc_files:
    try:
        df = pd.read_excel(lf, sheet_name='Consulta', header=0)
        for _, row in df.iterrows():
            modelo = str(row.get('Modelo', '')).strip()
            localidad = str(row.get('Localidad', '')).strip()
            if modelo and modelo not in ('Modelo', 'nan') and localidad and localidad != 'nan':
                # Necesito extraer marca del modelo si está ahí, o usar genérico
                # Por ahora solo voy a acumular localidades por modelo
                if modelo not in loc_map:
                    loc_map[modelo] = set()
                loc_map[modelo].add(localidad)
    except:
        pass
print(f'Localidad map: {len(loc_map)} modelos con localidades')

# Build provincia and zona maps
ZONA_FILE1 = r'C:\Users\Mariano Mastronardi\Desktop\Pacheco\Cadecom\Fuentes\Zona - Provincia - Localidad\consulta_periodo_2026-01-01_2026-12-31_20260531_234456.xlsx'
ZONA_FILE2 = r'C:\Users\Mariano Mastronardi\Desktop\Pacheco\Cadecom\Fuentes\Zona - Provincia - Localidad\consulta_periodo_2026-01-01_2026-12-31_20260531_234504.xlsx'

prov_map = {}  # localidad → provincia
zona_map = {}  # provincia → zona

# File 1: localidad → provincia
try:
    df_zona = pd.read_excel(ZONA_FILE1, sheet_name='Consulta', header=0)
    for _, row in df_zona.iterrows():
        localidad = str(row.get('Localidad', '')).strip()
        provincia = str(row.get('Provincia', '')).strip()
        if localidad and localidad != 'nan' and provincia and provincia != 'nan':
            prov_map[localidad] = provincia
except:
    pass

# File 2: provincia → zona
try:
    df_zona2 = pd.read_excel(ZONA_FILE2, sheet_name='Consulta', header=0)
    for _, row in df_zona2.iterrows():
        provincia = str(row.get('Provincia', '')).strip()
        zona = str(row.get('Zona', '')).strip()
        if provincia and provincia != 'nan' and zona and zona != 'nan':
            zona_map[provincia] = zona
except:
    pass

print(f'Provincia map: {len(prov_map)} localidades')
print(f'Zona map: {len(zona_map)} provincias')

# Also merge the cilindrada file that lives in Marca-Modelo folder
CIL_FILE_LEGACY = os.path.join(FOLDER, 'consulta_periodo_2026-01-01_2026-05-31_20260529_233621.xlsx')
if os.path.exists(CIL_FILE_LEGACY):
    df = pd.read_excel(CIL_FILE_LEGACY, sheet_name='Consulta', header=0)
    for _, row in df.iterrows():
        modelo = str(row.iloc[0]).strip()
        cil    = str(row.iloc[1]).strip()
        if modelo and modelo not in ('Modelo', 'nan') and pd.notna(row.iloc[1]) and cil != 'nan':
            if modelo not in cil_map:
                cil_map[modelo] = cil

# Data files: all except the cilindrada file
all_files = sorted(glob.glob(FOLDER + r'\consulta_periodo_*.xlsx'))
data_files = [f for f in all_files if os.path.basename(f) != os.path.basename(CIL_FILE_LEGACY)]

# Get month columns for each file
def get_month_cols(f):
    df = pd.read_excel(f, sheet_name='Consulta', header=0, nrows=0)
    return [c for c in df.columns if isinstance(c, str) and '-' in c and c != 'Total']

file_months = {f: get_month_cols(f) for f in data_files}

# Deduplicate: prefer files covering more months; skip files whose months are already covered
data_files_sorted = sorted(data_files, key=lambda f: -len(file_months[f]))
selected = []
covered = set()
for f in data_files_sorted:
    months = set(file_months[f])
    if not months.issubset(covered):
        selected.append(f)
        covered.update(months)

print(f'Selected {len(selected)} files covering {len(covered)} months')
for f in selected:
    print(f'  {os.path.basename(f)}: {len(file_months[f])} months')

# Sort all covered months chronologically
all_months = sorted(covered, key=lambda m: (int(m.split('-')[1]), int(m.split('-')[0])))

# Read and merge all selected files
combined = {}  # (marca, modelo) → {month: int}

for f in selected:
    df = pd.read_excel(f, sheet_name='Consulta', header=0)
    mcols = file_months[f]
    for _, row in df.iterrows():
        marca  = str(row.get('Marca', '')).strip()
        modelo = str(row.get('Modelo', '')).strip()
        if not marca or marca in ('Marca', 'nan') or not modelo or modelo == 'nan':
            continue
        # Normalización de nombres de marca
        MARCA_MAP = {
            'QJ Motor': 'QJ MOTOR',
            'Qj Motor': 'QJ MOTOR',
            'qj motor': 'QJ MOTOR',
            'QJMOTOR':  'QJ MOTOR',
        }
        marca = MARCA_MAP.get(marca, marca)
        key = (marca, modelo)
        if key not in combined:
            combined[key] = {}
        for m in mcols:
            val = row.get(m, 0)
            combined[key][m] = combined[key].get(m, 0) + (int(val) if pd.notna(val) else 0)

# Build records (omit zero months to reduce file size)
records = []
for (marca, modelo), month_data in combined.items():
    cil = cil_map.get(modelo, 'Sin categoría')
    locs = list(loc_map.get(modelo, []))
    provs = sorted(set(prov_map.get(loc, '') for loc in locs if prov_map.get(loc)))
    zonas = sorted(set(zona_map.get(prov, '') for prov in provs if zona_map.get(prov)))

    rec = {'marca': marca, 'modelo': modelo, 'cilindrada': cil}
    if locs:
        rec['localidades'] = locs
    if provs:
        rec['provincias'] = provs
    if zonas:
        rec['zonas'] = zonas

    total = 0
    for m in all_months:
        v = month_data.get(m, 0)
        if v:
            rec[m] = v
        total += v
    rec['total'] = total
    records.append(rec)

records.sort(key=lambda r: -r['total'])

# Last update date = most recent file in Marca-Modelo folder
import datetime
all_source_files = sorted(glob.glob(FOLDER + r'\*.xlsx'))
last_update = max(os.path.getmtime(f) for f in all_source_files) if all_source_files else None
last_update_str = datetime.datetime.fromtimestamp(last_update).strftime('%d/%m/%Y') if last_update else ''

js  = f'const LAST_UPDATE = "{last_update_str}";\n'
js += 'const RAW_DATA = ' + json.dumps(records, ensure_ascii=False) + ';\n'
with open(OUT_JS, 'w', encoding='utf-8') as fh:
    fh.write(js)

print(f'\nOK: {len(records)} registros, {len(all_months)} meses')
print(f'Primer mes: {all_months[0]}  |  Último mes: {all_months[-1]}')
print(f'Archivo: {OUT_JS}')
print(f'\nMeses: {all_months}')
