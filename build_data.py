import pandas as pd
import glob
import os
import json
import datetime
import unicodedata

def norm(s):
    """Normalizar para matching: maneja Ñ (leída a veces como Ð), acentos y mayúsculas."""
    if not isinstance(s, str):
        s = str(s)
    s = s.replace('Ð', 'N').replace('ð', 'N').replace('Ñ', 'N').replace('ñ', 'N')
    nfd = unicodedata.normalize('NFD', s)
    return ''.join(c for c in nfd if unicodedata.category(c) != 'Mn').upper().strip()

BASE       = r'C:\Users\Mariano Mastronardi\Desktop\Pacheco\Cadecom'
FUENTES    = BASE + r'\Fuentes'
LOC_FOLDER = FUENTES + r'\Localidad - Modelo'   # ventas: Localidad, Modelo, meses, Total
GEO_FILE   = FUENTES + r'\BD_Geo.xlsx'           # Zona, Provincia, Localidad
MOTOS_FILE = FUENTES + r'\BD_Motos.xlsx'         # Marca, Modelo, Cilindrada
OUT_JS     = BASE + r'\data.js'

JUNK = {'TOTAL GENERAL', 'NAN', ''}

# ===== 1. BD_GEO: localidad -> (provincia, zona) canónicos =====
geo_df = pd.read_excel(GEO_FILE, sheet_name='Geo')
geo_by_loc = {}              # norm(localidad) -> {localidad, provincia, zona}
zona_localidades = {}        # ZONA -> set(localidades canónicas)
provincia_localidades = {}   # PROVINCIA -> set(localidades canónicas)
for _, row in geo_df.iterrows():
    loc  = str(row.get('Localidad', '')).strip()
    prov = str(row.get('Provincia', '')).strip()
    zona = str(row.get('Zona', '')).strip().upper()
    if not loc or norm(loc) in JUNK:
        continue
    geo_by_loc[norm(loc)] = {'localidad': loc, 'provincia': prov, 'zona': zona}
    if zona:
        zona_localidades.setdefault(zona, set()).add(loc)
    if prov:
        provincia_localidades.setdefault(prov, set()).add(loc)

zona_localidades = {z: sorted(locs) for z, locs in zona_localidades.items()}
provincia_localidades = {p: sorted(locs) for p, locs in provincia_localidades.items()}
print(f'BD_Geo: {len(geo_by_loc)} localidades, {len(zona_localidades)} zonas, {len(provincia_localidades)} provincias')

# ===== 2. BD_MOTOS: modelo -> (marca, cilindrada) =====
motos_df = pd.read_excel(MOTOS_FILE, sheet_name='Consulta')
moto_by_modelo = {}          # norm(modelo) -> {marca, cilindrada}
for _, row in motos_df.iterrows():
    modelo = str(row.get('Modelo', '')).strip()
    marca  = str(row.get('Marca', '')).strip()
    cil    = str(row.get('Cilindrada', '')).strip()
    if not modelo or norm(modelo) in JUNK:
        continue
    key = norm(modelo)
    if key not in moto_by_modelo:
        moto_by_modelo[key] = {
            'marca': marca if marca and marca != 'nan' else 'SIN MARCA',
            'cilindrada': cil if cil and cil != 'nan' else 'Sin categoría'
        }
print(f'BD_Motos: {len(moto_by_modelo)} modelos')

# ===== 3. VENTAS: Localidad - Modelo =====
loc_files = sorted(glob.glob(LOC_FOLDER + r'\*.xlsx'))
print(f'\nLeyendo {len(loc_files)} archivos de ventas Localidad-Modelo...')

all_months_set = set()
records_dict = {}  # (modelo, localidad_canonica) -> record dict

for lf in loc_files:
    df = pd.read_excel(lf, sheet_name='Consulta', header=0)
    month_cols = [c for c in df.columns if isinstance(c, str) and '-' in c and c != 'Total']
    all_months_set.update(month_cols)

    for _, row in df.iterrows():
        localidad = str(row.get('Localidad', '')).strip()
        modelo    = str(row.get('Modelo', '')).strip()
        if norm(localidad) in JUNK or norm(modelo) in JUNK:
            continue

        # Cruce geográfico por localidad (usa nombre canónico de BD_Geo)
        geo = geo_by_loc.get(norm(localidad))
        if geo:
            loc_canon = geo['localidad']
            provincia = geo['provincia']
            zona      = geo['zona']
        else:
            loc_canon = localidad
            provincia = ''
            zona      = ''

        # Cruce de moto por modelo
        moto = moto_by_modelo.get(norm(modelo))
        marca = moto['marca'] if moto else 'SIN MARCA'
        cil   = moto['cilindrada'] if moto else 'Sin categoría'

        key = (modelo, loc_canon)
        if key not in records_dict:
            records_dict[key] = {
                'marca': marca, 'modelo': modelo, 'cilindrada': cil,
                'localidad': loc_canon, 'provincia': provincia, 'zona': zona
            }
        rec = records_dict[key]
        for m in month_cols:
            val = row.get(m, 0)
            if pd.notna(val) and val > 0:
                rec[m] = rec.get(m, 0) + int(val)

all_months = sorted(all_months_set, key=lambda m: (int(m.split('-')[1]), int(m.split('-')[0])))

# Construir registros finales en formato COMPACTO (sparse + claves cortas + lookups).
# CARGA DIFERIDA: se parten en RECIENTES (>= RECENT_FROM_YEAR) e HISTORIA (resto).
#   - data.js          -> recientes (render instantáneo) + lookups + meses completos
#   - data-historia.js -> historia, se carga en segundo plano y se fusiona
RECENT_FROM_YEAR = 2024
recent_months = [m for m in all_months if int(m.split('-')[1]) >= RECENT_FROM_YEAR]
hist_months   = [m for m in all_months if int(m.split('-')[1]) <  RECENT_FROM_YEAR]

modelo_info = {}   # modelo -> [marca, cilindrada]
loc_info    = {}   # localidad -> [provincia, zona]
recent_records = []
hist_records   = []
for rec in records_dict.values():
    total = sum(rec.get(m, 0) for m in all_months)
    if total <= 0:
        continue
    modelo_info.setdefault(rec['modelo'], [rec['marca'], rec['cilindrada']])
    loc_info.setdefault(rec['localidad'], [rec['provincia'], rec['zona']])

    r_out = {'o': rec['modelo'], 'l': rec['localidad']}
    r_tot = 0
    for m in recent_months:
        if rec.get(m, 0) > 0:
            r_out[m] = rec[m]; r_tot += rec[m]
    if r_tot > 0:
        r_out['t'] = r_tot
        recent_records.append(r_out)

    h_out = {'o': rec['modelo'], 'l': rec['localidad']}
    has_hist = False
    for m in hist_months:
        if rec.get(m, 0) > 0:
            h_out[m] = rec[m]; has_hist = True
    if has_hist:
        hist_records.append(h_out)

print(f'Recientes: {len(recent_records)} | Historia: {len(hist_records)} | modelos: {len(modelo_info)} | localidades: {len(loc_info)}')

# ===== 4. ESCRIBIR DATA.JS (recientes) Y DATA-HISTORIA.JS =====
last_update = max(os.path.getmtime(f) for f in loc_files) if loc_files else None
last_update_str = datetime.datetime.fromtimestamp(last_update).strftime('%d/%m/%Y') if last_update else ''
dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))

# Rehidratación reutilizable (modelo/localidad/marca/cilindrada/provincia/zona)
REHYDRATE = ('function _rehydrate(r){'
             'var mi=MODELO_INFO[r.o]||["SIN MARCA","Sin categoría"];'
             'var li=LOCALIDAD_INFO[r.l]||["",""];'
             'r.modelo=r.o;r.localidad=r.l;r.total=r.t||0;'
             'r.marca=mi[0];r.cilindrada=mi[1];r.provincia=li[0];r.zona=li[1];return r;}\n')

js  = f'const LAST_UPDATE = "{last_update_str}";\n'
js += 'const ALL_MONTHS = ' + dump(all_months) + ';\n'
js += 'const MODELO_INFO = ' + dump(modelo_info) + ';\n'
js += 'const LOCALIDAD_INFO = ' + dump(loc_info) + ';\n'
js += 'const ZONA_LOCALIDADES = ' + dump(zona_localidades) + ';\n'
js += 'const PROVINCIA_LOCALIDADES = ' + dump(provincia_localidades) + ';\n'
js += 'const RAW_DATA = ' + dump(recent_records) + ';\n'
js += REHYDRATE
js += 'RAW_DATA.forEach(_rehydrate);\n'

with open(OUT_JS, 'w', encoding='utf-8') as fh:
    fh.write(js)

# data-historia.js: fusiona la historia dentro de RAW_DATA (por modelo+localidad)
OUT_HIST = OUT_JS.replace('data.js', 'data-historia.js')
hjs  = 'const RAW_DATA_HIST = ' + dump(hist_records) + ';\n'
hjs += ('(function(){'
        'var idx={};for(var i=0;i<RAW_DATA.length;i++){var r=RAW_DATA[i];idx[r.o+"|"+r.l]=r;}'
        'RAW_DATA_HIST.forEach(function(h){'
        'var k=h.o+"|"+h.l,r=idx[k];'
        'if(!r){r={o:h.o,l:h.l};_rehydrate(r);RAW_DATA.push(r);idx[k]=r;}'
        'for(var key in h){if(key!=="o"&&key!=="l"){r[key]=h[key];}}'
        '});'
        # recomputar totales completos (recientes + historia)
        'RAW_DATA.forEach(function(r){var t=0;for(var key in r){if(/^\\d{2}-\\d{4}$/.test(key))t+=r[key];}r.t=t;r.total=t;});'
        'if(typeof onHistoriaLoaded==="function")onHistoriaLoaded();'
        '})();\n')

with open(OUT_HIST, 'w', encoding='utf-8') as fh:
    fh.write(hjs)

print(f'\nOK: {len(all_months)} meses ({all_months[0]} a {all_months[-1]})')
print(f'data.js (recientes): {os.path.getsize(OUT_JS)/1024/1024:.1f} MB')
print(f'data-historia.js: {os.path.getsize(OUT_HIST)/1024/1024:.1f} MB')
