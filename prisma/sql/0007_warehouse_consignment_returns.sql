-- ECP Consignment: the ERP's CSR documents (consignment returns / billing).
-- A CSR is matched to its CSG by number (CSR03935(1) comes off CSG03935); its
-- boxes are taken off that CSG in Details and its total off the outlet's balance.
-- Nothing in the CSG tables is changed: removing a CSR puts the boxes back.
--
-- Apply by hand in the Supabase SQL editor, like 0001 to 0006.

create table if not exists warehouse.consignment_return (
  id           bigserial primary key,
  kind         text        not null default 'CSR',   -- 'CSR'; 'CSA' is reserved for adjustments
  code         text        not null unique,          -- CSR03935(1)
  csg_key      text        not null,                 -- CSG03935
  doc_date     date,
  from_outlet  text        not null default '',
  to_counter   text        not null default '',
  created_by   text        not null default '',
  remark       text        not null default '',
  line_total   int         not null,
  file_name    text        not null default '',
  uploaded_at  timestamptz not null default now(),
  uploaded_by  text
);

create index if not exists consignment_return_csg_idx on warehouse.consignment_return (csg_key);

create table if not exists warehouse.consignment_return_line (
  id           bigserial primary key,
  return_id    bigint not null references warehouse.consignment_return (id) on delete cascade,
  item_no      int    not null,
  stock_id     text   not null,
  description  text   not null,
  power        text,
  extra        text,
  expire       text,              -- YYYYMM as printed
  mda_no       text,
  qty          int    not null check (qty > 0),
  uom          text   not null default 'BOX'
);

create index if not exists consignment_return_line_idx on warehouse.consignment_return_line (return_id);

alter table warehouse.consignment_return      enable row level security;
alter table warehouse.consignment_return_line enable row level security;
revoke all on all tables in schema warehouse from anon, authenticated;
