-- Warehouse dashboard: its own schema on the shared salesreport project,
-- and the email route settings table (Inward PO / Outward PO).
-- Applied 2026-09-30 via Supabase migration "warehouse_email_route".
create schema if not exists warehouse;

create table if not exists warehouse.email_route (
  route             text primary key check (route in ('outward', 'inward')),
  enabled           boolean     not null default true,
  mailbox           text        not null default '',
  to_list           text[]      not null default '{}',
  cc_list           text[]      not null default '{}',
  bcc_list          text[]      not null default '{}',
  subject_template  text        not null,
  body_template     text        not null,
  attachment_name   text        not null default '',
  auto_ack          boolean     not null default false,
  updated_at        timestamptz not null default now(),
  updated_by        text
);

-- The app reads through Prisma as the service role, which bypasses RLS.
-- RLS on with no policies keeps PostgREST (anon / authenticated) out.
alter table warehouse.email_route enable row level security;
revoke all on schema warehouse from anon, authenticated;
revoke all on all tables in schema warehouse from anon, authenticated;
