import { PAGES } from "@/lib/pages";
import { PageHeader } from "@/components/page-header";
import { AwaitingSource } from "@/components/awaiting-source";

const page = PAGES.find(p => p.href === "/po-conversion")!;

export default function Page() {
  return (
    <>
      <PageHeader title={page.title} description={page.description} />
      <AwaitingSource
        sections={[
          { title: "Open POs", detail: "Ordered quantity, received quantity and outstanding balance per PO." },
          { title: "Conversion", detail: "PO lines converted into goods received / invoices, with lead time." },
          { title: "Overdue", detail: "POs past their expected arrival date." },
        ]}
        needs={[
          "What PO conversion means in your process: supplier PO to GRN, or customer PO to delivery order / invoice",
          "A sample PO listing export",
        ]}
      />
    </>
  );
}
