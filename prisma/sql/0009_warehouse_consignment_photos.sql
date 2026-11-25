-- ECP Consignment: photos taken on a phone as proof for a CSG. The image itself
-- is a file in the warehouse Google Drive; this table is the list of them.
-- A delete moves the Drive file to its bin and stamps deleted_at; rows stay.
--
-- Apply by hand in the Supabase SQL editor, like 0001 to 0008.

create table if not exists warehouse.consignment_photo (
  id            bigserial primary key,
  csg_key       text        not null,              -- CSG03935
  outlet_key    text        not null,              -- upper-case outlet name
  outlet        text        not null default '',
  drive_file_id text        not null,
  file_name     text        not null default '',
  bytes         int         not null default 0,
  uploaded_at   timestamptz not null default now(),
  uploaded_by   text,
  deleted_at    timestamptz,
  deleted_by    text
);

create index if not exists consignment_photo_outlet_idx on warehouse.consignment_photo (outlet_key, csg_key);

alter table warehouse.consignment_photo enable row level security;
revoke all on all tables in schema warehouse from anon, authenticated;
