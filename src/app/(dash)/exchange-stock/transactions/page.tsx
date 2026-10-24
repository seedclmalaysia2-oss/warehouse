import { loadLocations, loadTransactions } from "@/lib/exchange/store";
import { PageHeader } from "@/components/page-header";

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
const money = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dash = (s: string | null) => s || "—";

type SP = { kind?: string; q?: string; location?: string };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const kind = sp.kind === "issue" || sp.kind === "receive" ? sp.kind : undefined;

  let data: Awaited<ReturnType<typeof loadTransactions>> | null = null;
  let locations: string[] = [];
  try {
    [data, locations] = await Promise.all([loadTransactions({ kind, q: sp.q, location: sp.location }), loadLocations()]);
  } catch {
    data = null;
  }

  const th = "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted";
  const td = "whitespace-nowrap px-3 py-2 text-sm text-ink-2";
  const field = "rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink";

  return (
    <>
      <PageHeader
        title="Exchange transactions"
        description="Every Stock Issue and Stock Receive line from the daily listings, newest first."
      >
        <a href="/exchange-stock"
           className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 no-underline transition-colors hover:border-brand hover:text-ink">
          ← Overdue alerts
        </a>
      </PageHeader>

      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <input className={field} name="q" defaultValue={sp.q ?? ""} placeholder="Doc no, stock ID, description…" />
        <select className={field} name="kind" defaultValue={kind ?? ""}>
          <option value="">Issue + Receive</option>
          <option value="issue">Stock Issue</option>
          <option value="receive">Stock Receive</option>
        </select>
        <select className={field} name="location" defaultValue={sp.location ?? ""}>
          <option value="">All customers</option>
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <button className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 hover:border-brand hover:text-ink" type="submit">Filter</button>
      </form>

      {data === null ? (
        <div className="needs">
          <strong>The exchange tables don&apos;t exist yet.</strong>
          <ul><li>Run <code>prisma/sql/0003_warehouse_exchange_stock.sql</code> in the Supabase SQL editor.</li></ul>
        </div>
      ) : data.length === 0 ? (
        <p className="rounded-xl border border-line bg-quiet px-4 py-3 text-sm text-ink-2">No transactions match.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Type</th><th className={th}>Doc no</th><th className={th}>Date</th>
                <th className={th}>Location</th><th className={th}>Adj type</th><th className={th}>Reference</th>
                <th className={th}>Created by</th><th className={`${th} text-right`}>Net amount</th>
                <th className={th}>Item</th><th className={th}>Stock ID</th><th className={th}>Description</th>
                <th className={th}>MDA no</th><th className={th}>Brand</th><th className={th}>Power</th>
                <th className={th}>Expire</th><th className={`${th} text-right`}>Qty</th><th className={th}>Uom</th>
                <th className={`${th} text-right`}>Unit price</th><th className={`${th} text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.map(r => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className={`${td} font-semibold ${r.kind === "issue" ? "text-warn" : "text-ok"}`}>{r.kind === "issue" ? "Issue" : "Receive"}</td>
                  <td className={`${td} font-mono text-[0.8125rem]`}>{r.docNo}</td>
                  <td className={td}>{fmt(r.docDate)}</td>
                  <td className={`${td} font-semibold text-ink`}>{r.location}</td>
                  <td className={td}>{dash(r.adjType)}</td>
                  <td className={td}>{dash(r.reference)}</td>
                  <td className={td}>{dash(r.createdBy)}</td>
                  <td className={`${td} text-right tabular-nums`}>{money(r.netAmount)}</td>
                  <td className={td}>{r.lineNo}</td>
                  <td className={`${td} font-mono text-[0.8125rem]`}>{r.stockId}</td>
                  <td className={td}>{r.description}</td>
                  <td className={`${td} font-mono text-[0.8125rem]`}>{dash(r.mdaNo)}</td>
                  <td className={td}>{dash(r.brand)}</td>
                  <td className={td}>{dash(r.power)}</td>
                  <td className={td}>{dash(r.expire)}</td>
                  <td className={`${td} text-right tabular-nums`}>{r.quantity}</td>
                  <td className={td}>{dash(r.uom)}</td>
                  <td className={`${td} text-right tabular-nums`}>{money(r.unitPrice)}</td>
                  <td className={`${td} text-right tabular-nums`}>{money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
