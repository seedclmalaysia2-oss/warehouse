-- ECP Consignment: a log of every CSG / CSR file deleted, with a full copy of
-- what was deleted so it can be put back (Restore on the outlet page).
-- Nothing is ever removed from this table: a restore only stamps restored_at.
--
-- Apply by hand in the Supabase SQL editor, like 0001 to 0007.

create table if not exists warehouse.consignment_trash (
  id           bigserial primary key,
  kind         text        not null,               -- 'CSG' | 'CSR'
  code         text        not null,               -- CSG03935 / CSR03935(1)
  outlet_key   text,                               -- the outlet page it belongs on (upper-case name)
  outlet       text        not null default '',
  boxes        int         not null default 0,     -- boxes on the deleted document(s)
  file_name    text        not null default '',
  payload      jsonb       not null,               -- the deleted rows, to restore from
  deleted_at   timestamptz not null default now(),
  deleted_by   text,
  restored_at  timestamptz,
  restored_by  text
);

create index if not exists consignment_trash_outlet_idx on warehouse.consignment_trash (outlet_key, deleted_at desc);
create index if not exists consignment_trash_deleted_idx on warehouse.consignment_trash (deleted_at desc);

alter table warehouse.consignment_trash enable row level security;
revoke all on all tables in schema warehouse from anon, authenticated;
