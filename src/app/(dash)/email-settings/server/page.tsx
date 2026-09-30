import { PageHeader } from "@/components/page-header";
import { ServerForm } from "@/components/email/server-form";
import { hasSecretKey } from "@/lib/email/crypto";
import { loadServerView } from "@/lib/email/server-store";

export default async function SendingServerPage() {
  const server = await loadServerView();
  const envFallback = !server && !!process.env.SMTP_HOST;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm">
        <a href="/email-settings" className="text-ink-2 no-underline hover:text-ink hover:underline">Email settings</a>
        <span className="mx-2 text-muted">/</span>
        <span className="text-ink">Sending server</span>
      </nav>
      <PageHeader
        title="Sending server"
        description="The mailbox that sends Outward PO orders to HQ and acknowledgements to customers. One server for the whole warehouse team."
      />
      <ServerForm initial={server} canEncrypt={hasSecretKey()} envFallback={envFallback} />
    </>
  );
}
