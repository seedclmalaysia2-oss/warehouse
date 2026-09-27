# SEED CL Malaysia — Warehouse dashboard

Lives at **warehouse.seedclmalaysiastore.com**, linked from the hub. Same sign-in
as the hub, Sales and the GM report (shared Supabase Auth on the salesreport
project), own schema `warehouse`.

## Pages

| Route | Page | Status |
|---|---|---|
| `/` | Overview | tiles for the four pages |
| `/consignment` | Customer Consignment | shell — awaiting source file |
| `/po-conversion` | PO Conversion | shell — awaiting source file |
| `/boc-stock` | BOC Stock Management | shell — awaiting source file |
| `/specialty-report` | Specialty CL Monthly Report | shell — awaiting source file |

The list lives in `src/lib/pages.ts`; the sidebar and overview both read it.
Each shell page states what it will show and what it still needs.

## Run it

```bash
cp .env.example .env     # fill in Supabase URL/anon key and DATABASE_URL (?schema=warehouse)
pnpm install
pnpm dev                 # http://localhost:3002
```

## Access

Signing in is not enough: the account needs `warehouse` in
`app.staff.departments` (or `is_admin`). Otherwise the dashboard shows a
"No access" card pointing back to the hub.

```sql
update app.staff
   set departments = array(select distinct unnest(departments || array['warehouse']))
 where email = 'you@example.com';
```

Prisma connects as the service role and bypasses row level security, so the
check in `src/app/(dash)/layout.tsx` (and `guardDept()` in every future API
route) is the security boundary — not the middleware.

## Deploying

1. Create the `warehouse` schema when the first tables are added.
2. Vercel project, framework Next.js, env vars as in `.env.example`.
3. Add domain `warehouse.seedclmalaysiastore.com`.
4. Supabase → Authentication → URL Configuration: allow
   `https://warehouse.seedclmalaysiastore.com/login`.
5. In the hub, set Warehouse to `status: "live"` in `src/app/departments.ts`.
