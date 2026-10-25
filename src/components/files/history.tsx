"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { UploadEntry, UploadKind } from "@/lib/uploads";

const KIND_LABEL: Record<UploadKind, string> = {
  workbook: "Consignment workbook",
  csg: "CSG document",
  issue: "Stock Issue listing",
  receive: "Stock Receive listing",
};
const FILTERS: { key: UploadKind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "workbook", label: "Workbook" },
  { key: "csg", label: "CSG documents" },
  { key: "issue", label: "Issue" },
  { key: "receive", label: "Receive" },
];
const PAGE = 40;

const KL = "Asia/Kuala_Lumpur";
const monthOf = (iso: string) => new Date(iso).toLocaleDateString("en-MY", { timeZone: KL, month: "long", year: "numeric" });
const whenOf = (iso: string) => new Date(iso).toLocaleString("en-MY", { timeZone: KL, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const th = "whitespace-nowrap px-3 py-2 text-left text-sm font-semibold text-ink-2";
const td = "px-3 py-2 text-sm text-ink-2";

export function UploadHistory({ entries }: { entries: UploadEntry[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<UploadKind | "all">("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entries.length };
    for (const e of entries) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [entries]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(e => (kind === "all" || e.kind === kind) && (!q || `${e.file} ${e.detail} ${e.by ?? ""}`.toLowerCase().includes(q)));
  }, [entries, kind, query]);

  // Rows arrive newest first, so a month heading goes wherever the month changes.
  const visible = rows.slice(0, shown);

  async function remove(e: UploadEntry) {
    if (!e.csgNo) return;
    if (!window.confirm(`Remove the details for ${e.csgNo}? The Details button on that CSG will go back to "Not uploaded". The workbook figures stay as they are.`)) return;
    setRemoving(e.id);
    setError(null);
    try {
      const res = await fetch(`/api/consignment/docs/${encodeURIComponent(e.csgNo)}`, { method: "DELETE" });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Could not remove it.");
      else router.refresh();
    } catch {
      setError("Could not remove it. Check your connection and try again.");
    } finally {
      setRemoving(null);
    }
  }

  if (entries.length === 0) {
    return <p className="rounded-xl border border-line bg-surface px-4 py-6 text-sm text-ink-2">Nothing has been uploaded yet. Files you upload above will be listed here.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.filter(f => f.key === "all" || counts[f.key]).map(f => (
          <button
            key={f.key} type="button" aria-pressed={kind === f.key} onClick={() => { setKind(f.key); setShown(PAGE); }}
            className={`rounded-full border px-3 py-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              kind === f.key ? "border-tile bg-tile text-white" : "border-line-strong text-ink-2 hover:border-brand hover:text-ink"
            }`}
          >
            {f.label} <span className="tabular-nums opacity-80">{counts[f.key] ?? 0}</span>
          </button>
        ))}
        <input
          type="search" value={query} onChange={e => { setQuery(e.target.value); setShown(PAGE); }}
          placeholder="Search file, CSG or person" aria-label="Search upload history"
          className="ml-auto w-full rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand sm:w-64"
        />
      </div>

      <div role="status" aria-live="polite">{error && <p className="mb-2 text-sm text-danger">{error}</p>}</div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-6 text-sm text-ink-2">No uploads match.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line bg-quiet">
                  <th className={th}>Uploaded</th><th className={th}>Type</th><th className={th}>File</th>
                  <th className={th}>What it holds</th><th className={th}>By</th><th className={th}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              {visible.map((e, i) => {
                const month = monthOf(e.at);
                const newMonth = i === 0 || monthOf(visible[i - 1].at) !== month;
                return (
                  <tbody key={e.id}>
                    {newMonth && (
                      <tr className="border-b border-line bg-page">
                        <th colSpan={6} scope="colgroup" className="px-3 py-1.5 text-left text-sm font-semibold text-ink">{month}</th>
                      </tr>
                    )}
                    <tr className="border-b border-line last:border-0">
                      <td className={`${td} whitespace-nowrap tabular-nums`}>{whenOf(e.at)}</td>
                      <td className={`${td} whitespace-nowrap`}>{KIND_LABEL[e.kind]}</td>
                      <td className={`${td} max-w-[18rem] truncate text-ink`} title={e.file}>{e.file}</td>
                      <td className={`${td} min-w-[15rem]`}>{e.detail}</td>
                      <td className={`${td} whitespace-nowrap`}>{e.by ?? "None"}</td>
                      <td className="px-3 py-2 text-right">
                        {e.csgNo && (
                          <button
                            type="button" disabled={removing === e.id} onClick={() => remove(e)}
                            className="whitespace-nowrap rounded-md px-2 py-0.5 text-sm font-semibold text-danger hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
                          >
                            {removing === e.id ? "Removing…" : "Remove"}
                          </button>
                        )}
                      </td>
                    </tr>
                  </tbody>
                );
              })}
            </table>
          </div>
          {rows.length > shown && (
            <div className="border-t border-line px-3 py-2.5 text-center">
              <button
                type="button" onClick={() => setShown(s => s + PAGE)}
                className="rounded px-2 py-1 text-sm font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Show {Math.min(PAGE, rows.length - shown)} more ({rows.length - shown} left)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
