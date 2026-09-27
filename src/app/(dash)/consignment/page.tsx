import { PAGES } from "@/lib/pages";
import { PageHeader } from "@/components/page-header";
import { AwaitingSource } from "@/components/awaiting-source";

const page = PAGES.find(p => p.href === "/consignment")!;

export default function Page() {
  return (
    <>
      <PageHeader title={page.title} description={page.description} />
      <AwaitingSource
        sections={[
          { title: "Balance by outlet", detail: "Units on consignment per customer, per product, with last movement date." },
          { title: "Movements", detail: "Stock sent out, sold through, returned and replenished." },
          { title: "Expiry at outlets", detail: "Consignment stock approaching expiry, grouped by outlet." },
        ]}
        needs={[
          "A sample consignment export (per-outlet stock listing) and how often it is pulled",
          "Whether it reconciles against the SCLM master minus HQ/HQ2 split the GM report already uses",
        ]}
      />
    </>
  );
}
