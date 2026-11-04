"use client";
import { ACCOUNT_PARENT, isSubAccount, type Filters, type Line, type OutletRef } from "@/lib/consignment/analyze";

export const fieldCls =
  "rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

export function filterOptions(lines: Line[], outlets: OutletRef[]) {
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const families = new Map<string, Set<string>>();
  for (const l of lines) (families.get(l.family) ?? families.set(l.family, new Set()).get(l.family)!).add(l.product);
  const owners = uniq([...lines.map(l => l.owner), ...outlets.map(o => o.owner)]);
  return {
    owners: owners.filter(o => !isSubAccount(o)),
    accounts: owners.filter(isSubAccount),
    states: uniq([...lines.map(l => l.state), ...outlets.map(o => o.state)]),
    families: [...families.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([f, p]) => [f, [...p].sort()] as const),
  };
}

export function FilterSelects({ filters, options, onChange }: {
  filters: Filters;
  options: ReturnType<typeof filterOptions>;
  onChange: (k: keyof Filters, v: string) => void;
}) {
  return (
    <>
      <select aria-label="Salesman" className={fieldCls} value={filters.owner} onChange={e => onChange("owner", e.target.value)}>
        <option value="">All salesmen</option>
        {options.owners.map(o => <option key={o}>{o}</option>)}
        {options.accounts.length > 0 && (
          <optgroup label={`${ACCOUNT_PARENT}'s accounts`}>{options.accounts.map(o => <option key={o}>{o}</option>)}</optgroup>
        )}
      </select>
      <select aria-label="State" className={fieldCls} value={filters.state} onChange={e => onChange("state", e.target.value)}>
        <option value="">All states</option>
        {options.states.map(o => <option key={o}>{o}</option>)}
      </select>
      <select aria-label="Product" className={`${fieldCls} max-w-[14rem]`} value={filters.product} onChange={e => onChange("product", e.target.value)}>
        <option value="">All products</option>
        {options.families.map(([f, ps]) => (
          <optgroup key={f} label={f}>{ps.map(p => <option key={p}>{p}</option>)}</optgroup>
        ))}
      </select>
    </>
  );
}
