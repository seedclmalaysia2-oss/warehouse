import { OVERDUE_DAYS, productKey, type IssueStatus } from "@/lib/exchange/match";
import { loadCustomerLines, loadIssueStatuses } from "@/lib/exchange/store";
import { PageHeader } from "@/components/page-header";
import { ResolveButtons } from "@/components/exchange/resolve-button";

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
const money = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dash = (s: string | null | undefined) => s || "—";

type Line = Awaited<ReturnType<typeof loadCustomerLines>>[number];

export default async function CustomerPage({ params }: { params: Promise<{ location: string }> }) {
  const location = decodeURIComponent((await params).location);

  let lines: Line[] | null = null;
  let statuses: IssueStatus[] = [];
  try {
    [lines, statuses] = await Promise.all([loadCustomerLines(location), loadIssueStatuses()]);
  } catch {
    lines = null;
  }
  const status = new Map(statuses.map(s => [s.id, s]));

  const back = (
    <a href="/exchange-stock"
       className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 no-underline transition-colors hover:border-brand hover:text-ink">
      ← All customers
    </a>
  );

  if (lines === null) {
    return (
      <>
        <PageHeader title={location} description="Exchange stock in and out.">{back}</PageHeader>
        <div className="needs"><strong>Could not load this customer.</strong>
          <ul><li>Check that the exchange tables exist (<code>prisma/sql/0003_warehouse_exchange_stock.sql</code>).</li></ul>
        </div>
      </>
    );
  }
  if (lines.length === 0) {
    return (
      <>
        <PageHeader title={location} description="Exchange stock in and out.">{back}</PageHeader>
        <p className="rounded-xl border border-line bg-quiet px-4 py-3 text-sm text-ink-2">No exchange lines for this customer yet.</p>
      </>
    );
  }

  // Out = Stock Issue (sent to the customer); In = Stock Receive (exchange return).
  const sum = (xs: number[]) => xs.reduce((t, n) => t + n, 0);
  const out = lines.filter(l => l.kind === "issue");
  const inn = lines.filter(l => l.kind === "receive");
  const mine = statuses.filter(s => s.location.toUpperCase() === location.toUpperCase());
  const overdueQty = sum(mine.filter(s => s.overdue).map(s => s.open));

  type Prod = { name: string; brand: string | null; powers: Set<string>; out: number; in: number; outAmt: number; inAmt: number; overdue: number };
  const prods = new Map<string, Prod>();
  const prod = (l: Line) => {
    const k = productKey(l.description);
    if (!prods.has(k)) prods.set(k, { name: l.description, brand: l.brand, powers: new Set(), out: 0, in: 0, outAmt: 0, inAmt: 0, overdue: 0 });
    return prods.get(k)!;
  };
  for (const l of lines) {
    const p = prod(l);
    if (l.power) p.powers.add(l.power);
    if (l.kind === "issue") { p.out += l.quantity; p.outAmt += l.amount ?? 0; }
    else { p.in += l.quantity; p.inAmt += l.amount ?? 0; }
  }
  for (const s of mine) if (s.overdue) {
    const p = prods.get(productKey(s.description));
    if (p) p.overdue += s.open;
  }
  const products = [...prods.values()].sort((a, b) => b.overdue - a.overdue || (b.out - b.in) - (a.out - a.in) || a.name.localeCompare(b.name));

  const th = "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted";
  const td = "whitespace-nowrap px-3 py-2 text-sm text-ink-2";
  const num = "whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums text-ink-2";

  return (
    <>
      <PageHeader title={location} description="Everything sent out to and received back from this customer, with the balance per product.">
        {back}
      </PageHeader>

      <div className="flex flex-col gap-8">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tile label="Out (issued)" value={sum(out.map(l => l.quantity))} sub={money(sum(out.map(l => l.amount ?? 0)))} />
          <Tile label="In (received)" value={sum(inn.map(l => l.quantity))} sub={money(sum(inn.map(l => l.amount ?? 0)))} />
          <Tile label="Balance (out − in)" value={sum(out.map(l => l.quantity)) - sum(inn.map(l => l.quantity))} />
          <Tile label="Still open" value={sum(mine.map(s => s.open))} />
          <Tile label={`Overdue (over ${OVERDUE_DAYS} days)`} value={overdueQty} tone={overdueQty ? "danger" : "ok"} />
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-semibold text-ink">Balance by product</h2>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>Product</th><th className={th}>Brand</th><th className={th}>Powers</th>
                  <th className={`${th} text-right`}>Out</th><th className={`${th} text-right`}>In</th>
                  <th className={`${th} text-right`}>Balance</th><th className={`${th} text-right`}>Overdue</th>
                  <th className={`${th} text-right`}>Amount out</th><th className={`${th} text-right`}>Amount in</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.name} className="border-b border-line last:border-0">
                    <td className={`${td} font-semibold text-ink`}>{p.name}</td>
                    <td className={td}>{dash(p.brand)}</td>
                    <td className={td}>{p.powers.size ? [...p.powers].sort().join(", ") : "—"}</td>
                    <td className={num}>{p.out}</td>
                    <td className={num}>{p.in}</td>
                    <td className={`${num} font-semibold ${p.out - p.in > 0 ? "text-warn" : ""}`}>{p.out - p.in}</td>
                    <td className={`${num} ${p.overdue ? "font-semibold text-danger" : ""}`}>{p.overdue}</td>
                    <td className={num}>{money(p.outAmt)}</td>
                    <td className={num}>{money(p.inAmt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">Balance is out minus in. A positive balance is stock the customer still holds from exchanges.</p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-semibold text-ink">Every line, in and out</h2>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>Date</th><th className={th}>Doc no</th><th className={th}>Direction</th>
                  <th className={th}>Adj type</th><th className={th}>Item</th><th className={th}>Stock ID</th>
                  <th className={th}>Description</th><th className={th}>Brand</th><th className={th}>Power</th>
                  <th className={th}>Expire</th><th className={th}>MDA no</th><th className={th}>Uom</th>
                  <th className={`${th} text-right`}>Qty out</th><th className={`${th} text-right`}>Qty in</th>
                  <th className={`${th} text-right`}>Unit price</th><th className={`${th} text-right`}>Amount</th>
                  <th className={th}>Reference</th><th className={th}>Created by</th><th className={th}>Return status</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(l => {
                  const s = l.kind === "issue" ? status.get(l.id) : undefined;
                  return (
                    <tr key={l.id} className="border-b border-line last:border-0">
                      <td className={td}>{fmt(l.docDate)}</td>
                      <td className={`${td} font-mono text-[0.8125rem]`}>{l.docNo}</td>
                      <td className={`${td} font-semibold ${l.kind === "issue" ? "text-warn" : "text-ok"}`}>{l.kind === "issue" ? "Out" : "In"}</td>
                      <td className={td}>{dash(l.adjType)}</td>
                      <td className={td}>{l.lineNo}</td>
                      <td className={`${td} font-mono text-[0.8125rem]`}>{l.stockId}</td>
                      <td className={td}>{l.description}</td>
                      <td className={td}>{dash(l.brand)}</td>
                      <td className={td}>{dash(l.power)}</td>
                      <td className={td}>{dash(l.expire)}</td>
                      <td className={`${td} font-mono text-[0.8125rem]`}>{dash(l.mdaNo)}</td>
                      <td className={td}>{dash(l.uom)}</td>
                      <td className={num}>{l.kind === "issue" ? l.quantity : ""}</td>
                      <td className={num}>{l.kind === "receive" ? l.quantity : ""}</td>
                      <td className={num}>{money(l.unitPrice)}</td>
                      <td className={num}>{money(l.amount)}</td>
                      <td className={td}>{dash(l.reference)}</td>
                      <td className={td}>{dash(l.createdBy)}</td>
                      <td className={td}>
                        {s ? (
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <StatusText s={s} />
                            {(s.overdue || s.resolved) && <ResolveButtons issueId={s.id} resolved={s.resolved} />}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function StatusText({ s }: { s: IssueStatus }) {
  if (s.resolved) return <span className="text-sm text-ink-2">{s.resolved === "returned" ? "Marked returned" : "Waived"}</span>;
  if (s.open === 0) return <span className="text-sm font-semibold text-ok">Returned</span>;
  const part = s.returned > 0 ? `${s.returned}/${s.quantity} returned, ` : "";
  return (
    <span className={`text-sm font-semibold ${s.overdue ? "text-danger" : "text-warn"}`}>
      {part}{s.open} open · day {s.ageDays}{s.overdue ? " · overdue" : ""}
    </span>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: "danger" | "ok" }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="label">{label}</div>
      <div className={`mt-1 font-display text-3xl font-semibold tabular-nums ${tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : "text-ink"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted tabular-nums">{sub}</div>}
    </div>
  );
}
