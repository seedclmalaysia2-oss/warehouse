// The dashboard's pages. One place to edit when a page is added or renamed —
// the sidebar and the overview tiles both read from here.
//
// status:
//   "ready"   — wired to real data
//   "shell"   — page exists, waiting on its source file / data model
export type PageStatus = "ready" | "shell";

export type WarehousePage = {
  href: string;
  title: string;
  short: string;
  description: string;
  status: PageStatus;
};

export const PAGES: WarehousePage[] = [
  {
    href: "/consignment",
    title: "Customer Consignment",
    short: "Consignment",
    description: "Stock held at customer outlets on consignment — balances per outlet and product, movements and reconciliation.",
    status: "shell",
  },
  {
    href: "/po-conversion",
    title: "PO Conversion",
    short: "PO Conversion",
    description: "Purchase orders converted into stock and deliveries — what was ordered, what has arrived, what is outstanding.",
    status: "shell",
  },
  {
    href: "/boc-stock",
    title: "BOC Stock Management",
    short: "BOC Stock",
    description: "Breath O Correct Ortho-K stock — warehouse and consignment balances, trial lens sets and replenishment.",
    status: "shell",
  },
  {
    href: "/specialty-report",
    title: "Specialty CL Monthly Report",
    short: "Specialty CL",
    description: "Monthly report on specialty contact lens orders, deliveries and stock.",
    status: "shell",
  },
];
