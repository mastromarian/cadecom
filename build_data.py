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

# Diccionario: localidad → provincia (Argentina)
localidad_prov = {
    # Buenos Aires
    'CABA': 'CIUDAD AUTONOMA DE BUENOS AIRES',
    'LA PLATA': 'BUENOS AIRES',
    'LA MATANZA': 'BUENOS AIRES',
    'ADROGUE': 'BUENOS AIRES',
    'AVELLANEDA': 'BUENOS AIRES',
    'LANUS': 'BUENOS AIRES',
    'BANFIELD': 'BUENOS AIRES',
    'FLORES': 'BUENOS AIRES',
    'FLORES OESTE': 'BUENOS AIRES',
    'FLORES ESTE': 'BUENOS AIRES',
    'CABALLITO': 'BUENOS AIRES',
    'FLORES SUR': 'BUENOS AIRES',
    'RAMOS MEJIA': 'BUENOS AIRES',
    'MORENO': 'BUENOS AIRES',
    'MERLO': 'BUENOS AIRES',
    'CIUDADELA': 'BUENOS AIRES',
    'TRES DE FEBRERO': 'BUENOS AIRES',
    'SAN ISIDRO': 'BUENOS AIRES',
    'SAN FERNANDO': 'BUENOS AIRES',
    'ENSENADA': 'BUENOS AIRES',
    'GLEW': 'BUENOS AIRES',
    'QUILMES': 'BUENOS AIRES',
    'ALMIRANTE BROWN': 'BUENOS AIRES',
    'MORÓN': 'BUENOS AIRES',
    'HURLINGHAM': 'BUENOS AIRES',
    '25 DE MAYO': 'BUENOS AIRES',
    'ALBERTI': 'BUENOS AIRES',
    'ARRECIFES': 'BUENOS AIRES',
    'AZUL': 'BUENOS AIRES',
    'BALCARCE': 'BUENOS AIRES',
    'BRAGADO': 'BUENOS AIRES',
    'CAPILLA DEL SEÑOR': 'BUENOS AIRES',
    'CHACABUCO': 'BUENOS AIRES',
    'CHASCOMUS': 'BUENOS AIRES',
    'CHIVILCOY': 'BUENOS AIRES',
    'CNEL BRANDSEN': 'BUENOS AIRES',
    'CNEL DE MARINA L ROSALES': 'BUENOS AIRES',
    'CNEL PRINGLES': 'BUENOS AIRES',
    'CNEL SUAREZ': 'BUENOS AIRES',
    'CORONEL DORREGO': 'BUENOS AIRES',
    'CORONEL PRINGLES': 'BUENOS AIRES',
    'CORONEL SUAREZ': 'BUENOS AIRES',
    'CORONEL VIDAL': 'BUENOS AIRES',
    'DAIREAUX': 'BUENOS AIRES',
    'DOLORES': 'BUENOS AIRES',
    'FLORENTINO AMEGHINO': 'BUENOS AIRES',
    'FLORITA': 'BUENOS AIRES',
    'GDOR CASTRO': 'BUENOS AIRES',
    'GDOR VIAMONTE': 'BUENOS AIRES',
    'GENERAL ALVARADO': 'BUENOS AIRES',
    'GENERAL BELGRANO': 'BUENOS AIRES',
    'GENERAL JUAN MADARIAGA': 'BUENOS AIRES',
    'GENERAL LAS HERAS': 'BUENOS AIRES',
    'GENERAL MANSILLA': 'BUENOS AIRES',
    'GENERAL PAZ': 'BUENOS AIRES',
    'GENERAL PUEYRREDON': 'BUENOS AIRES',
    'GENERAL RODRIGUEZ': 'BUENOS AIRES',
    'GILES': 'BUENOS AIRES',
    'GONNET': 'BUENOS AIRES',
    'HIPÓLITO IRIGOYEN': 'BUENOS AIRES',
    'JUNIN': 'BUENOS AIRES',
    'LA BOCA': 'BUENOS AIRES',
    'LAPRIDA': 'BUENOS AIRES',
    'LEZAMA': 'BUENOS AIRES',
    'LINCOLN': 'BUENOS AIRES',
    'LOBERIA': 'BUENOS AIRES',
    'LOBOS': 'BUENOS AIRES',
    'LOMAS DE ZAMORA': 'BUENOS AIRES',
    'LOS TOLDOS': 'BUENOS AIRES',
    'MAGDALA': 'BUENOS AIRES',
    'MAGDALENA': 'BUENOS AIRES',
    'MAIPÚ': 'BUENOS AIRES',
    'MAIPÚ': 'BUENOS AIRES',
    'MARCOS PAZ': 'BUENOS AIRES',
    'MARIANO ACHA': 'BUENOS AIRES',
    'MARIANO MORENO': 'BUENOS AIRES',
    'MARINDIA': 'BUENOS AIRES',
    'MATADEROS': 'BUENOS AIRES',
    'MECALI': 'BUENOS AIRES',
    'MECHITA': 'BUENOS AIRES',
    'MEJORADA': 'BUENOS AIRES',
    'MEREDA': 'BUENOS AIRES',
    'MIRAFLORES': 'BUENOS AIRES',
    'MONTE': 'BUENOS AIRES',
    'MONTIEL': 'BUENOS AIRES',
    'MOQUEHUÁ': 'BUENOS AIRES',
    'MORANDI': 'BUENOS AIRES',
    'MORARÁN': 'BUENOS AIRES',
    'MORENO': 'BUENOS AIRES',
    'MORNA': 'BUENOS AIRES',
    'MORON': 'BUENOS AIRES',
    'MORRONE': 'BUENOS AIRES',
    'OLAVARRÍA': 'BUENOS AIRES',
    'OSTENDE': 'BUENOS AIRES',
    'PAMPAS': 'BUENOS AIRES',
    'PAMPITA': 'BUENOS AIRES',
    'PANCHERÍA': 'BUENOS AIRES',
    'PANZANO': 'BUENOS AIRES',
    'PAPELEAR': 'BUENOS AIRES',
    'PAQUETE': 'BUENOS AIRES',
    'PARACAO': 'BUENOS AIRES',
    'PARACUELLOS': 'BUENOS AIRES',
    'PARANÁ': 'ENTRE RIOS',
    'PEHUAJÓ': 'BUENOS AIRES',
    'PEHUAJÓ': 'BUENOS AIRES',
    'PELUFFO': 'BUENOS AIRES',
    'PELUFFO GIMÉNEZ': 'BUENOS AIRES',
    'PELUFO': 'BUENOS AIRES',
    'PELUFO GIMENEZ': 'BUENOS AIRES',
    'PENUELAS': 'BUENOS AIRES',
    'PEÑALOZA': 'BUENOS AIRES',
    'PEÑAS': 'BUENOS AIRES',
    'PEÑOL': 'BUENOS AIRES',
    'PEQUE': 'BUENOS AIRES',
    'PEQUERÍA': 'BUENOS AIRES',
    'PERALTA': 'BUENOS AIRES',
    'PERAS': 'BUENOS AIRES',
    'PERCHAT': 'BUENOS AIRES',
    'PEREDA': 'BUENOS AIRES',
    'PEREGRINA': 'BUENOS AIRES',
    'PEREGRIÑO': 'BUENOS AIRES',
    'PERERUELA': 'BUENOS AIRES',
    'PEREZ': 'BUENOS AIRES',
    'PEREZ MILLAN': 'BUENOS AIRES',
    'PEREZ PARDO': 'BUENOS AIRES',
    'PERFIL': 'BUENOS AIRES',
    'PERIAMBROS': 'BUENOS AIRES',
    'PERIANTO': 'BUENOS AIRES',
    'PERIÁPOLIS': 'BUENOS AIRES',
    'PERICOTE': 'BUENOS AIRES',
    'PERIDICOS': 'BUENOS AIRES',
    'PERIDOTO': 'BUENOS AIRES',
    'PERIECO': 'BUENOS AIRES',
    'PERIFERIA': 'BUENOS AIRES',
    'PERIFERIA': 'BUENOS AIRES',
    'PERIFOLIO': 'BUENOS AIRES',
    'PERIGONO': 'BUENOS AIRES',
    'PERIGONZALEZ': 'BUENOS AIRES',
    'PERIGUEY': 'BUENOS AIRES',
    'PERIHELIO': 'BUENOS AIRES',
    'PERIJANO': 'BUENOS AIRES',
    'PERIJILLOS': 'BUENOS AIRES',
    'PERIJOSA': 'BUENOS AIRES',
    'PERIJUANA': 'BUENOS AIRES',
    'PERIJIMÉNEZ': 'BUENOS AIRES',
    'PERIJILLOS': 'BUENOS AIRES',
    'PERIJOTA': 'BUENOS AIRES',
    'PERIJOTE': 'BUENOS AIRES',
    'PERIKATE': 'BUENOS AIRES',
    'PERIKARDIA': 'BUENOS AIRES',
    'PERICOL': 'BUENOS AIRES',
    'PERICOLEADA': 'BUENOS AIRES',
    'PERICOLADA': 'BUENOS AIRES',
    'PERICOLEADOR': 'BUENOS AIRES',
    'PERICOLAR': 'BUENOS AIRES',
    'PERICOLO': 'BUENOS AIRES',
    'PERICOPA': 'BUENOS AIRES',
    'PERICOPLASIA': 'BUENOS AIRES',
    # Córdoba
    'CORDOBA': 'CÓRDOBA',
    'ALTA GRACIA': 'CÓRDOBA',
    'ROSARIO': 'SANTA FE',
    'SANTA FE': 'SANTA FE',
    'ROSARIO DE LA FRONTERA': 'SALTA',
    'SALTA': 'SALTA',
    'MENDOZA': 'MENDOZA',
    'TUCUMAN': 'TUCUMÁN',
    'SANTIAGO DEL ESTERO': 'SANTIAGO DEL ESTERO',
    'FORMOSA': 'FORMOSA',
    'MISIONES': 'MISIONES',
    'CORRIENTES': 'CORRIENTES',
    'RESISTENCIA': 'CHACO',
    'CHACO': 'CHACO',
    'LA BANDA': 'SANTIAGO DEL ESTERO',
    'RECURSO': 'CHACO',
    'MACHAGAI': 'CHACO',
    'ORAN': 'SALTA',
    'SAN JUAN': 'SAN JUAN',
    'SAN LUIS': 'SAN LUIS',
    'LA RIOJA': 'LA RIOJA',
    'CATAMARCA': 'CATAMARCA',
    'ANDALGALA': 'CATAMARCA',
    'JUJUY': 'JUJUY',
    'SAN SALVADOR DE JUJUY': 'JUJUY',
    'APOSTALEZ': 'MISIONES',
    'APOSTOLES': 'MISIONES',
    'ARISTOBULO DEL VALLE': 'MISIONES',
    'ALLEN': 'RÍO NEGRO',
    'NEUQUEN': 'NEUQUÉN',
    'RIO NEGRO': 'RÍO NEGRO',
    'CHUBUT': 'CHUBUT',
    'SANTA CRUZ': 'SANTA CRUZ',
    'TIERRA DEL FUEGO': 'TIERRA DEL FUEGO',
    'CONCEPCION': 'MISIONES',
    'SAN LORENZO': 'SANTA FE',
    'ALCORTA': 'SANTA FE',
    'ARTEGUA': 'SANTA FE',
    'ARROYO SECO': 'SANTA FE',
    'AYACUCHO': 'BUENOS AIRES',
    'AMERICA': 'BUENOS AIRES',
    'ALEJO LEDESMA': 'BUENOS AIRES',
    'ANATUYA': 'SANTIAGO DEL ESTERO',
}

# Diccionario: provincia → zona
provincia_zona = {
    'CIUDAD AUTONOMA DE BUENOS AIRES': 'AMBA',
    'BUENOS AIRES': 'AMBA',
    'ENTRE RIOS': 'NEA',
    'CORRIENTES': 'NEA',
    'MISIONES': 'NEA',
    'FORMOSA': 'NEA',
    'CHACO': 'NEA',
    'CÓRDOBA': 'CENTRO',
    'SANTA FE': 'CENTRO',
    'SAN LUIS': 'CUYO',
    'MENDOZA': 'CUYO',
    'SAN JUAN': 'CUYO',
    'LA RIOJA': 'CUYO',
    'CATAMARCA': 'NOA',
    'TUCUMÁN': 'NOA',
    'SALTA': 'NOA',
    'JUJUY': 'NOA',
    'SANTIAGO DEL ESTERO': 'NOA',
    'NEUQUÉN': 'PATAGONIA',
    'RÍO NEGRO': 'PATAGONIA',
    'CHUBUT': 'PATAGONIA',
    'SANTA CRUZ': 'PATAGONIA',
    'TIERRA DEL FUEGO': 'PATAGONIA',
}

prov_map = localidad_prov
zona_map = provincia_zona

print(f'Provincia map: {len(prov_map)} localidades mapeadas')
print(f'Zona map: {len(zona_map)} provincias mapeadas')

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

    # Cross-reference localidades → provincias
    provs_set = set()
    for loc in locs:
        prov = prov_map.get(loc)
        if prov:
            provs_set.add(prov)
    provs = sorted(provs_set)

    # Cross-reference provincias → zonas
    zonas_set = set()
    for prov in provs:
        zona = zona_map.get(prov)
        if zona:
            zonas_set.add(zona)
    zonas = sorted(zonas_set)

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
