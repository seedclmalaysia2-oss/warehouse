-- Lets the Sales dashboard (separate app, same Supabase project) show ECP
-- consignment stock to the sales team, live from the warehouse snapshot.
--
-- The warehouse tables stay locked (RLS on, no policies, no grants to anon or
-- authenticated). Sales reads through three read-only SECURITY DEFINER
-- functions in `public` (the schema PostgREST exposes), and each one applies
-- the Sales dashboard's own visibility rule:
--
--   not signed in                         -> nothing
--   signed in, can_view_all (the default) -> every outlet
--   signed in, restricted by an admin     -> their own salesperson plus their
--                                            managed_sps (public.sp_user_map)
--
-- Because it reads the latest consignment_import snapshot on every call,
-- whatever the warehouse uploads shows up in Sales on its next refresh, with
-- nothing to sync.
--
-- Apply by hand in the Supabase SQL editor, like 0001 to 0005. Idempotent.
-- Needs the Sales dashboard's helpers: public.current_user_can_view_all() and
-- public.current_user_visible_sps().

-- Does this owner (the workbook's salesman name, or a key account) fall inside
-- the signed-in user's scope? The workbook spells names a little differently
-- from sp_user_map ("Khen Tan" / "Khen", "Sakina" / "Sakinah"), so match on a
-- name prefix either way round. The key accounts below are handled under Alan
-- (same list as ACCOUNTS_UNDER_PARENT in src/lib/consignment/analyze.ts).
create or replace function public.consignment_owner_visible(p_owner text)
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select auth.uid() is not null
    and (
      public.current_user_can_view_all()
      or exists (
        select 1
        from unnest(coalesce(public.current_user_visible_sps(), '{}'::text[])) s
        where btrim(p_owner) <> '' and btrim(s) <> ''
          and (
            lower(p_owner) like lower(s) || '%'
            or lower(s) like lower(p_owner) || '%'
            or (lower(s) = 'alan' and p_owner in ('Dr Specs', 'Jac''s Optometry', 'Mag Eyewear', 'Max Vision', 'Optics 81', 'Specs House'))
          )
      )
    )
$$;

-- One row per CSG per product per outlet, from the latest snapshot.
create or replace function public.sales_consignment()
returns table (
  outlet        text,
  owner         text,
  state         text,
  town          text,
  product       text,
  family        text,
  csg_no        text,
  csg_date      date,
  qty           int,
  needs_refresh boolean,
  tag           text
)
language sql stable security definer
set search_path = public, warehouse, auth
as $$
  select l.outlet, l.owner, l.state, l.town, l.product, l.family,
         l.csg_no, l.csg_date, l.qty, l.needs_refresh, l.tag
  from warehouse.consignment_line l
  where l.import_id = (select i.id from warehouse.consignment_import i order by i.uploaded_at desc, i.id desc limit 1)
    and public.consignment_owner_visible(l.owner)
  order by l.outlet, l.csg_date nulls last, l.csg_no, l.product
$$;

-- When the snapshot the tab is showing was uploaded, so it can say "updated 2 hours ago".
create or replace function public.sales_consignment_info()
returns table (uploaded_at timestamptz, file_name text)
language sql stable security definer
set search_path = public, warehouse, auth
as $$
  select i.uploaded_at, i.file_name
  from warehouse.consignment_import i
  where auth.uid() is not null
  order by i.uploaded_at desc, i.id desc
  limit 1
$$;

-- Signed-in users only. (Default privileges can hand new functions to anon,
-- so take them away explicitly.)
revoke all on function public.consignment_owner_visible(text) from public, anon;
revoke all on function public.sales_consignment()            from public, anon;
revoke all on function public.sales_consignment_info()       from public, anon;
grant execute on function public.consignment_owner_visible(text) to authenticated;
grant execute on function public.sales_consignment()            to authenticated;
grant execute on function public.sales_consignment_info()       to authenticated;
