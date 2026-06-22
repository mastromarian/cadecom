"""
Setup de Supabase Storage para CADECOM.
Crea el bucket 'cadecom' (público) y sube todas las fuentes + data.js/historia.

USO (una sola vez):
  1. Sacá tu service_role key de Supabase → Settings → API → "service_role" (secret)
  2. En la terminal, parado en la carpeta Cadecom:

     Windows (PowerShell):
       $env:SUPABASE_SERVICE_KEY="pega-tu-service-role-key"
       python setup_supabase.py

     Git Bash / Linux / Mac:
       SUPABASE_SERVICE_KEY="pega-tu-service-role-key" python setup_supabase.py

La key se usa SOLO en tu PC para esta carga inicial. No queda guardada.
"""
import os, glob, json, re, urllib.request, urllib.error, mimetypes

SUPABASE_URL = "https://cazdzwigtazmecixhuiw.supabase.co"
BUCKET = "cadecom"
BASE = os.path.dirname(os.path.abspath(__file__))

KEY = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
if not KEY:
    raise SystemExit("Falta SUPABASE_SERVICE_KEY en el entorno. Ver instrucciones arriba.")

def _req(method, url, data=None, headers=None, ok=(200, 201)):
    h = {"Authorization": f"Bearer {KEY}", "apikey": KEY}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

# 1) Crear bucket (público). Si ya existe, seguimos.
status, body = _req(
    "POST", f"{SUPABASE_URL}/storage/v1/bucket",
    data=json.dumps({"id": BUCKET, "name": BUCKET, "public": True}).encode(),
    headers={"Content-Type": "application/json"},
)
if status in (200, 201):
    print(f"[OK] Bucket '{BUCKET}' creado (público).")
elif status == 409 or b"already exists" in body.lower():
    print(f"[OK] Bucket '{BUCKET}' ya existía.")
    # Asegurar que sea público
    _req("PUT", f"{SUPABASE_URL}/storage/v1/bucket/{BUCKET}",
         data=json.dumps({"public": True}).encode(),
         headers={"Content-Type": "application/json"})
else:
    raise SystemExit(f"[ERROR] No se pudo crear el bucket: {status} {body[:300]}")

def upload(local_path, remote_path):
    with open(local_path, "rb") as f:
        content = f.read()
    ctype = mimetypes.guess_type(local_path)[0] or "application/octet-stream"
    if remote_path.endswith(".js"):
        ctype = "application/javascript"
    status, body = _req(
        "POST", f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{remote_path}",
        data=content,
        headers={"Content-Type": ctype, "x-upsert": "true"},
    )
    tag = "OK" if status in (200, 201) else f"ERROR {status}"
    print(f"  [{tag}] {remote_path}  ({len(content)/1024:.0f} KB)")
    if status not in (200, 201):
        print(f"        {body[:200]}")

print("\nSubiendo fuentes...")
upload(os.path.join(BASE, "Fuentes", "BD_Geo.xlsx"), "BD_Geo.xlsx")
upload(os.path.join(BASE, "Fuentes", "BD_Motos.xlsx"), "BD_Motos.xlsx")

# Limpiar la carpeta localidad-modelo (para no acumular archivos viejos / con otro nombre)
st, bd = _req("POST", f"{SUPABASE_URL}/storage/v1/object/list/{BUCKET}",
              data=json.dumps({"prefix": "localidad-modelo", "limit": 1000}).encode(),
              headers={"Content-Type": "application/json"})
if st == 200:
    names = [o["name"] for o in json.loads(bd)]
    if names:
        _req("DELETE", f"{SUPABASE_URL}/storage/v1/object/{BUCKET}",
             data=json.dumps({"prefixes": ["localidad-modelo/" + n for n in names]}).encode(),
             headers={"Content-Type": "application/json"})
        print(f"  (limpieza: borrados {len(names)} archivos previos en localidad-modelo/)")

# Subir cada año con nombre fijo: localidad-modelo/<AAAA>.xlsx
for f in sorted(glob.glob(os.path.join(BASE, "Fuentes", "Localidad - Modelo", "*.xlsx"))):
    name = os.path.basename(f)
    m = re.search(r'_(\d{4})-\d{2}-\d{2}_', name)
    year = m.group(1) if m else os.path.splitext(name)[0]
    upload(f, f"localidad-modelo/{year}.xlsx")

print("\nSubiendo data generada...")
for f in ("data.js", "data-historia.js"):
    p = os.path.join(BASE, f)
    if os.path.exists(p):
        upload(p, f)

print("\nListo. URL pública de ejemplo:")
print(f"  {SUPABASE_URL}/storage/v1/object/public/{BUCKET}/data.js")
