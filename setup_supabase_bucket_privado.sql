-- ════════════════════════════════════════════════════════════════
-- CIERRE DEL BUCKET 'cadecom' (de público a privado) + permisos por rol.
--
-- Ejecutar en Supabase → SQL Editor, EN ESTE ORDEN y RECIÉN DESPUÉS de
-- haber deployado el código nuevo (data-loader.js + los 3 HTML que bajan
-- los datos autenticado con sb.storage.download). Si algo falla, el paso 4
-- (flip a privado) es reversible al instante: `... set public = true`.
--
-- Motivo: antes data.js/data-historia.js se servían del endpoint PÚBLICO,
-- así que cualquiera con la URL bajaba todo el dataset sin login. Y las
-- policies de escritura estaban abiertas a CUALQUIER usuario autenticado
-- (un vendedor/lectura podía sobrescribir data.js → XSS en el navegador
-- de los admins). Esto cierra ambas cosas.
-- ════════════════════════════════════════════════════════════════

-- ── 1) Función helper: ¿el usuario actual es admin de cadecom? ──
--    Mismo criterio que auth.js: dueño + gerencia_* (cualquier sucursal).
create or replace function public.is_cadecom_admin()
  returns boolean
  language sql
  security definer
  stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        lower(p.role::text) = 'dueno'
        or lower(p.role::text) = 'dueño'
        or lower(p.role::text) like 'gerencia%'
      )
  );
$$;

-- ── 2) LECTURA: solo usuarios autenticados (cualquier rol logueado) ──
--    Con el bucket privado, download() necesita esta policy de SELECT.
drop policy if exists "cadecom read authenticated" on storage.objects;
create policy "cadecom read authenticated" on storage.objects
  for select to authenticated
  using (bucket_id = 'cadecom');

-- ── 3) ESCRITURA: SOLO admin (dueño/gerencia), no cualquier authenticated ──
--    Reemplaza las policies viejas (setup_supabase_policies.sql) que estaban
--    abiertas a todo authenticated.
drop policy if exists "cadecom_auth_insert" on storage.objects;
drop policy if exists "cadecom_auth_update" on storage.objects;
drop policy if exists "cadecom_auth_delete" on storage.objects;

create policy "cadecom_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cadecom' and public.is_cadecom_admin());

create policy "cadecom_admin_update" on storage.objects
  for update to authenticated
  using      (bucket_id = 'cadecom' and public.is_cadecom_admin())
  with check (bucket_id = 'cadecom' and public.is_cadecom_admin());

create policy "cadecom_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cadecom' and public.is_cadecom_admin());

-- ── 4) Flip del bucket a PRIVADO (hacer AL FINAL, ya con todo lo anterior) ──
--    Reversible: para volver atrás, `set public = true`.
update storage.buckets set public = false where id = 'cadecom';

-- ── Verificación rápida ──
-- select id, public from storage.buckets where id = 'cadecom';   -- public debe ser false
-- select policyname, cmd from pg_policies
--   where schemaname='storage' and tablename='objects' and policyname like 'cadecom%';
