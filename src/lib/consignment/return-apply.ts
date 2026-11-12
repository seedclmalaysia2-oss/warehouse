// Takes the boxes on CSR documents off the CSG they were returned from. Pure, so
// the same result comes from the Details view, the balance and the upload check.

export type Box = {
  stockId: string;
  power: string | null;
  extra: string | null;
  expire: string | null;
  mdaNo: string | null;
  qty: number;
};

const strict = (b: Box) => [b.stockId, b.power ?? "", b.extra ?? "", b.expire ?? "", b.mdaNo ?? ""].join("|");
// A returned box that cannot be found by batch is still the same product and power.
const loose = (b: Box) => [b.stockId, b.power ?? "", b.extra ?? ""].join("|");

export type TakeOff<T extends Box> = {
  /** The CSG's lines after the returns, empty ones dropped. `returned` is what came off each line. */
  remaining: (T & { returned: number })[];
  /** Returned boxes that are not on the CSG (or are more than it still holds). */
  unmatched: (Box & { short: number })[];
  returnedTotal: number;
};

/**
 * Match each returned box to a CSG line of the same stock, power and batch
 * first, then to the same stock and power. A return never takes a line below
 * zero; whatever cannot be placed is reported as unmatched.
 */
export function takeOff<T extends Box>(given: T[], returns: Box[]): TakeOff<T> {
  const lines = given.map(g => ({ ...g, returned: 0 }));
  const unmatched: TakeOff<T>["unmatched"] = [];
  let returnedTotal = 0;

  for (const r of returns) {
    let want = r.qty;
    for (const key of [strict, loose]) {
      for (const l of lines) {
        if (!want) break;
        if (key(l) !== key(r)) continue;
        const take = Math.min(want, l.qty - l.returned);
        l.returned += take;
        want -= take;
      }
      if (!want) break;
    }
    returnedTotal += r.qty - want;
    if (want) unmatched.push({ ...r, short: want });
  }

  return {
    remaining: lines.filter(l => l.qty - l.returned > 0).map(l => ({ ...l, qty: l.qty - l.returned })),
    unmatched,
    returnedTotal,
  };
}

/** CSR03935(1) -> { csgKey: "CSG03935", seq: 1 }. Null when it is not a CSR number. */
export function parseReturnCode(code: string): { csgKey: string; seq: number } | null {
  const m = code.toUpperCase().replace(/\s+/g, "").match(/^CSR(\d+)(?:\((\d+)\))?$/);
  return m ? { csgKey: `CSG${m[1]}`, seq: m[2] ? Number(m[2]) : 0 } : null;
}

/**
 * A CSR is not stock. Every CSG upload keeps CSRs out, so a CSR dropped on the
 * wrong button is turned away instead of being filed as a CSG.
 */
export function withoutReturns<T extends { csgNo: string }>(docs: T[]): { docs: T[]; returns: string[] } {
  return { docs: docs.filter(d => !parseReturnCode(d.csgNo)), returns: docs.filter(d => parseReturnCode(d.csgNo)).map(d => d.csgNo) };
}

export const CSR_ONLY = "This is a CSR. Use Upload CSR file for it.";
