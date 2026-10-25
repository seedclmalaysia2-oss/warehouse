-- ECP Consignment: the "CSG ALL_ECP_Consignment_Stock" workbook, one row per CSG
-- (date, number, quantity) per product per outlet. Each upload replaces the
-- previous snapshot's outlets and lines (src/lib/consignment/store.ts); the
-- import row stays as a log. Age is derived at query time from csg_date.
--
-- Apply by hand in the Supabase SQL editor, like 0001 to 0003.

create table if not exists warehouse.consignment_import (
  id              bigserial primary key,
  file_name       text        not null default '',
  outlets         int         not null default 0,
  lines           int         not null default 0,
  units           int         not null default 0,
  sheets          text[]      not null default '{}',
  ignored_sheets  text[]      not null default '{}',
  warnings        text[]      not null default '{}',
  uploaded_at     timestamptz not null default now(),
  uploaded_by     text
);

-- Every outlet the workbook lists, including those holding nothing.
create table if not exists warehouse.consignment_outlet (
  id         bigserial primary key,
  import_id  bigint not null references warehouse.consignment_import (id) on delete cascade,
  sheet      text   not null,
  row_no     int    not null,
  owner      text   not null,   -- salesperson, or key account (Dr Specs, Jac's ...)
  state      text   not null default '',
  town       text   not null default '',
  outlet     text   not null
);

create table if not exists warehouse.consignment_line (
  id             bigserial primary key,
  import_id      bigint not null references warehouse.consignment_import (id) on delete cascade,
  sheet          text   not null,
  row_no         int    not null,
  owner          text   not null,
  state          text   not null default '',
  town           text   not null default '',
  outlet         text   not null,
  product        text   not null,   -- normalised, e.g. Eye Coffret BM · NM · RM
  family         text   not null,
  csg_no         text,
  csg_date       date,
  qty            int    not null check (qty > 0),
  needs_refresh  boolean not null default false,  -- red text in the workbook
  tag            text check (tag in ('new', 'adjusted', 'clearance'))  -- green / cyan / yellow fill
);

create index if not exists consignment_outlet_import_idx on warehouse.consignment_outlet (import_id);
create index if not exists consignment_line_import_idx   on warehouse.consignment_line (import_id);

alter table warehouse.consignment_import enable row level security;
alter table warehouse.consignment_outlet enable row level security;
alter table warehouse.consignment_line   enable row level security;
revoke all on all tables in schema warehouse from anon, authenticated;
