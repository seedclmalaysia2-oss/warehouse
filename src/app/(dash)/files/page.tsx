import { loadUploads } from "@/lib/uploads";
import { PageHeader } from "@/components/page-header";
import { UploadBox as ConsignmentUpload } from "@/components/consignment/upload-box";
import { DocUploadBox } from "@/components/consignment/doc-upload-box";
import { UploadBox as ExchangeUpload } from "@/components/exchange/upload-box";
import { UploadHistory } from "@/components/files/history";

// Never cache: the history must show the file that was just uploaded.
export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const entries = await loadUploads();

  return (
    <>
      <PageHeader
        title="Upload files"
        description="Add the consignment workbook, the ERP CSG documents and the daily exchange listings, then check what has already been uploaded."
      />

      <section aria-labelledby="up-consignment" className="mb-8">
        <h2 id="up-consignment" className="mb-1 font-display text-lg font-semibold text-ink">ECP Consignment</h2>
        <p className="mb-3 max-w-[70ch] text-sm text-ink-2">
          The workbook gives the stock at each outlet. The CSG documents add the colour and power behind each CSG&apos;s Details button.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <ConsignmentUpload />
          <DocUploadBox />
        </div>
      </section>

      <section aria-labelledby="up-exchange" className="mb-8">
        <h2 id="up-exchange" className="mb-1 font-display text-lg font-semibold text-ink">Exchange Stock</h2>
        <p className="mb-3 max-w-[70ch] text-sm text-ink-2">
          The day&apos;s Stock Issue and Stock Receive listings. Returns are matched to issues by customer (Location) and product.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <ExchangeUpload kind="issue" title="Stock Issue Listing" />
          <ExchangeUpload kind="receive" title="Stock Receive Listing" />
        </div>
      </section>

      <section aria-labelledby="up-history">
        <h2 id="up-history" className="mb-3 font-display text-lg font-semibold text-ink">Upload history</h2>
        <UploadHistory entries={entries} />
      </section>
    </>
  );
}
