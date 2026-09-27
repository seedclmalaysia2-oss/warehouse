import { PAGES } from "@/lib/pages";
import { PageHeader } from "@/components/page-header";
import { AwaitingSource } from "@/components/awaiting-source";

const page = PAGES.find(p => p.href === "/boc-stock")!;

export default function Page() {
  return (
    <>
      <PageHeader title={page.title} description={page.description} />
      <AwaitingSource
        sections={[
          { title: "Stock on hand", detail: "BOC warehouse and consignment balances per lens parameter." },
          { title: "Trial lens sets", detail: "Sets out with practitioners, returns and gaps." },
          { title: "Replenishment", detail: "Parameters below minimum and what to order from Japan." },
        ]}
        needs={[
          "Confirm the source: SCLM Stock List BOC (already parsed by the GM report) and/or the BOC Report Excel",
          "Minimum stock levels per parameter, if any exist today",
        ]}
      />
    </>
  );
}
