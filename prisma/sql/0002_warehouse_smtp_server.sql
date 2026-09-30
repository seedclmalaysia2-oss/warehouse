-- Sending server (SMTP) for the warehouse dashboard. One row (id = 1).
-- The password is stored AES-256-GCM encrypted (see src/lib/email/crypto.ts);
-- the key lives only in the EMAIL_SECRET_KEY env var, never in the database.
create table if not exists warehouse.smtp_server (
  id                 int primary key default 1 check (id = 1),
  provider           text        not null default 'custom',
  host               text        not null,
  port               int         not null check (port in (25, 465, 587, 2525)),
  username           text        not null,
  password_enc       text        not null,
  from_name          text        not null default '',
  from_email         text        not null,
  last_verified_at   timestamptz,
  last_verify_ok     boolean,
  last_verify_error  text,
  updated_at         timestamptz not null default now(),
  updated_by         text
);

alter table warehouse.smtp_server enable row level security;
revoke all on all tables in schema warehouse from anon, authenticated;
