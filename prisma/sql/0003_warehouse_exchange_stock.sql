-- Exchange Stock: the daily Stock Issue / Stock Receive listings (ERP "Listing
-- - By Document Number" reports), one row per document line. The customer is
-- the Location column. Overdue exchanges are derived at query time
-- (src/lib/exchange/match.ts), not stored.
--
-- Apply by hand in the Supabase SQL editor, like 0001 and 0002.

-- One row per upload.
create table if not exists warehouse.exchange_import (
  id            bigserial primary key,
  kind          text        not null check (kind in ('issue', 'receive')),
  file_name     text        not null default '',
  date_from     date,
  date_to       date,
  rows_added    int         not null default 0,
  rows_updated  int         not null default 0,
  uploaded_at   timestamptz not null default now(),
  uploaded_by   text
);

-- One row per document line. Re-uploading a day upserts on (kind, doc_no, line_no).
create table if not exists warehouse.exchange_txn (
  id           bigserial primary key,
  kind         text          not null check (kind in ('issue', 'receive')),
  doc_no       text          not null,   -- EXC00888 / EXR00888
  doc_date     date          not null,
  adj_type     text          not null default '',  -- EXCHANGE DIFF POWER / EXR
  location     text          not null,   -- the customer, e.g. HQ OPTICAL
  reference    text,                     -- printed sheet only
  created_by   text,                     -- printed issue sheet only
  net_amount   numeric(14, 2),
  line_no      int           not null,   -- the listing's Item column
  stock_id     text          not null,   -- the lot/batch code, e.g. 415B132211. NOT a product key:
                                         -- a diff-power return comes back under a different Stock ID.
  description  text          not null default '',
  mda_no       text,                     -- printed sheet only
  brand        text,
  power        text,
  expire       text,                     -- as the listing prints it: YYYYMM, e.g. 203007
  quantity     int           not null check (quantity > 0),
  uom          text,                     -- printed sheet only (BOX)
  unit_price   numeric(14, 2),
  amount       numeric(14, 2),
  import_id    bigint references warehouse.exchange_import (id) on delete set null,
  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now(),
  unique (kind, doc_no, line_no)
);

create index if not exists exchange_txn_match_idx on warehouse.exchange_txn (kind, location, stock_id);
create index if not exists exchange_txn_date_idx  on warehouse.exchange_txn (doc_date);

-- Manual override for an issue line: returned outside the system, or waived.
create table if not exists warehouse.exchange_resolution (
  issue_txn_id  bigint primary key references warehouse.exchange_txn (id) on delete cascade,
  status        text        not null check (status in ('returned', 'waived')),
  note          text        not null default '',
  resolved_at   timestamptz not null default now(),
  resolved_by   text
);

alter table warehouse.exchange_import     enable row level security;
alter table warehouse.exchange_txn        enable row level security;
alter table warehouse.exchange_resolution enable row level security;
revoke all on all tables in schema warehouse from anon, authenticated;
