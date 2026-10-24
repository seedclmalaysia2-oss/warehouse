import { PAGES } from "@/lib/pages";
import { OVERDUE_DAYS, todayMYT, type IssueStatus } from "@/lib/exchange/match";
import { loadIssueStatuses } from "@/lib/exchange/store";
import { PageHeader } from "@/components/page-header";
import { ResolveButtons } from "@/components/exchange/resolve-button";

const page = PAGES.find(p => p.href === "/exchange-stock")!;
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export default async function ExchangeStockPage() {
  let statuses: IssueStatus[] | null = null;
  try {
    statuses = await loadIssueStatuses();
  } catch {
    statuses = null;
  }

  return (
    <>
      <PageHeader title={page.title} description={page.description}>
        <a href="/exchange-stock/import"
           className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white no-underline transition-opacity hover:opacity-90">
          Upload listings
        </a>
        <a href="/exchange-stock/transactions"
           className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 no-underline transition-colors hover:border-brand hover:text-ink">
          All transactions →
        </a>
      </PageHeader>

      {statuses === null ? (
        <div className="needs">
          <strong>The exchange tables don&apos;t exist yet.</strong>
          <ul>
            <li>Run <code>prisma/sql/0003_warehouse_exchange_stock.sql</code> in the Supabase SQL editor.</li>
          </ul>
        </div>
      ) : statuses.length === 0 ? (
        <div className="needs">
          <strong>No exchange documents yet.</strong>
          <ul>
            <li><a href="/exchange-stock/import">Upload the daily Stock Issue and Stock Receive listings</a> to start tracking.</li>
          </ul>
        </div>
      ) : (
        <Overview statuses={statuses} />
      )}
    </>
  );
}

function Overview({ statuses }: { statuses: IssueStatus[] }) {
  const today = fmt(todayMYT());
  const overdue = statuses.filter(s => s.overdue).sort((a, b) => b.ageDays - a.ageDays);
  const open = statuses.filter(s => s.open > 0);

  const byCustomer = new Map<string, { issued: number; returned: number; open: number; overdue: number }>();
  for (const s of statuses) {
    const c = byCustomer.get(s.location) ?? { issued: 0, returned: 0, open: 0, overdue: 0 };
    c.issued += s.quantity;
    c.returned += s.quantity - s.open;
    c.open += s.open;
    if (s.overdue) c.overdue += s.open;
    byCustomer.set(s.location, c);
  }
  const customers = [...byCustomer.entries()].sort((a, b) => b[1].overdue - a[1].overdue || b[1].open - a[1].open);

  const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted";
  const td = "px-3 py-2 text-sm text-ink-2";
  const num = "px-3 py-2 text-right text-sm tabular-nums text-ink-2";

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label={`Overdue (over ${OVERDUE_DAYS} days)`} value={overdue.length} tone={overdue.length ? "danger" : "ok"} />
        <Tile label="Issues still open" value={open.length} />
        <Tile label="Customers with open exchanges" value={new Set(open.map(o => o.location)).size} />
      </section>

      <section>
        <h2 className="mb-2 font-display text-lg font-semibold text-ink">Not returned within {OVERDUE_DAYS} days</h2>
        {overdue.length === 0 ? (
          <p className="rounded-xl border border-line bg-quiet px-4 py-3 text-sm text-ink-2">Nothing overdue as of {today}.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>Customer</th><th className={th}>Issue no</th><th className={th}>Issued</th>
                  <th className={th}>Stock ID</th><th className={th}>Description</th>
                  <th className={`${th} text-right`}>Issued qty</th><th className={`${th} text-right`}>Open</th>
                  <th className={`${th} text-right`}>Days out</th><th className={th} />
                </tr>
              </thead>
              <tbody>
                {overdue.map(s => (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className={`${td} font-semibold text-ink`}>{s.location}</td>
                    <td className={`${td} font-mono text-[0.8125rem]`}>{s.docNo}</td>
                    <td className={td}>{fmt(s.docDate)}</td>
                    <td className={`${td} font-mono text-[0.8125rem]`}>{s.stockId}</td>
                    <td className={td}>{s.description}</td>
                    <td className={num}>{s.quantity}</td>
                    <td className={`${num} font-semibold text-danger`}>{s.open}</td>
                    <td className={`${num} font-semibold text-danger`}>{s.ageDays}</td>
                    <td className={td}><ResolveButtons issueId={s.id} resolved={s.resolved} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-display text-lg font-semibold text-ink">By customer</h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Customer (Location)</th>
                <th className={`${th} text-right`}>Issued</th><th className={`${th} text-right`}>Returned</th>
                <th className={`${th} text-right`}>Open</th><th className={`${th} text-right`}>Overdue</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(([name, c]) => (
                <tr key={name} className="border-b border-line last:border-0">
                  <td className={`${td} font-semibold text-ink`}>
                    <a className="no-underline hover:underline" href={`/exchange-stock/transactions?location=${encodeURIComponent(name)}`}>{name}</a>
                  </td>
                  <td className={num}>{c.issued}</td>
                  <td className={num}>{c.returned}</td>
                  <td className={num}>{c.open}</td>
                  <td className={`${num} ${c.overdue ? "font-semibold text-danger" : ""}`}>{c.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "danger" | "ok" }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="label">{label}</div>
      <div className={`mt-1 font-display text-3xl font-semibold tabular-nums ${tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : "text-ink"}`}>
        {value}
      </div>
    </div>
  );
}
