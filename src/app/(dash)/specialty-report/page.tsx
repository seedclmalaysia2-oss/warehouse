import { PAGES } from "@/lib/pages";
import { PageHeader } from "@/components/page-header";
import { AwaitingSource } from "@/components/awaiting-source";

const page = PAGES.find(p => p.href === "/specialty-report")!;

export default function Page() {
  return (
    <>
      <PageHeader title={page.title} description={page.description} />
      <AwaitingSource
        sections={[
          { title: "Monthly summary", detail: "Specialty lens orders, deliveries and value for the month." },
          { title: "By product / practitioner", detail: "Breakdown of the month by lens type and ordering outlet." },
          { title: "Export", detail: "The report in the format it is sent today." },
        ]}
        needs={[
          "Last month’s report file, so the layout can be matched",
          "Whether the data comes from the B2B Portal specialty orders or a POS export",
        ]}
      />
    </>
  );
}
