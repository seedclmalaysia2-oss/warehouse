-- ECP Consignment: the ERP's printed CONSIGNMENT documents, one per CSG number,
-- with a line per box (colour, power, expiry, quantity). Powers the Details view
-- on /consignment. Re-uploading a CSG replaces it (src/lib/consignment/doc-store.ts).
--
-- Apply by hand in the Supabase SQL editor, like 0001 to 0004.

create table if not exists warehouse.consignment_doc (
  id             bigserial primary key,
  csg_no         text        not null unique,   -- CSG02903
  doc_date       date,
  to_counter     text        not null default '',  -- the outlet, e.g. DR SPECS - A18
  from_counter   text        not null default '',
  salesperson    text        not null default '',
  created_by     text        not null default '',
  printed_total  int,                              -- the total printed on the document
  line_total     int         not null,             -- what the lines add up to
  remark         text        not null default '',
  file_name      text        not null default '',
  uploaded_at    timestamptz not null default now(),
  uploaded_by    text
);

create table if not exists warehouse.consignment_doc_line (
  id           bigserial primary key,
  doc_id       bigint not null references warehouse.consignment_doc (id) on delete cascade,
  item_no      int    not null,
  stock_id     text   not null,
  description  text   not null,   -- product and colour, e.g. Monthly Color UV - Fire Brown
  power        text,              -- 0.00, -1.25 ...
  extra        text,              -- anything else printed before the quantity
  expire       text,              -- YYYYMM as printed
  mda_no       text,
  qty          int    not null check (qty > 0),
  uom          text   not null default 'BOX'
);

create index if not exists consignment_doc_line_doc_idx on warehouse.consignment_doc_line (doc_id);

alter table warehouse.consignment_doc      enable row level security;
alter table warehouse.consignment_doc_line enable row level security;
revoke all on all tables in schema warehouse from anon, authenticated;
