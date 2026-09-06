-- ============================================================================
-- Private Storage buckets for invoice templates and generated invoices.
-- Objects are namespaced by user id as the first path segment
--   e.g.  <user_id>/<template_id>.docx
-- and RLS on storage.objects restricts every operation to the owner by that
-- segment, matching the owner-only model used on the data tables.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('invoice-templates', 'invoice-templates', false),
       ('invoices', 'invoices', false)
on conflict (id) do nothing;

-- Helper predicate is inlined per policy: (storage.foldername(name))[1] = uid.
do $$
declare
  b text;
begin
  foreach b in array array['invoice-templates', 'invoices'] loop
    execute format($f$
      create policy %I on storage.objects
        for select to authenticated
        using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text);
    $f$, b || '_select_own', b);

    execute format($f$
      create policy %I on storage.objects
        for insert to authenticated
        with check (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text);
    $f$, b || '_insert_own', b);

    execute format($f$
      create policy %I on storage.objects
        for update to authenticated
        using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)
        with check (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text);
    $f$, b || '_update_own', b, b);

    execute format($f$
      create policy %I on storage.objects
        for delete to authenticated
        using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text);
    $f$, b || '_delete_own', b);
  end loop;
end $$;
