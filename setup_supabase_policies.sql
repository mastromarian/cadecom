-- ════════════════════════════════════════════════════════════════
-- Permisos de Storage para el bucket 'cadecom'.
-- Pegar y ejecutar en Supabase → SQL Editor (una sola vez).
-- La lectura ya es pública (el bucket es público). Esto habilita la
-- ESCRITURA solo a usuarios logueados (authenticated) — el encargado admin.
-- ════════════════════════════════════════════════════════════════

create policy "cadecom_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cadecom');

create policy "cadecom_auth_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'cadecom');

create policy "cadecom_auth_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cadecom');
