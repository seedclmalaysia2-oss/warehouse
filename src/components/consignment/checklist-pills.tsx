"use client";
import { useEffect, useRef, useState } from "react";

const pill = "inline-flex items-center whitespace-nowrap rounded-full font-semibold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/**
 * The outlet's filled-in stock confirmation, saved as a PDF or sent straight to
 * the printer. `compact` is the smaller pair for a row of the outlet list.
 */
export function ChecklistPills({ outletKey, outletName, compact = false }: { outletKey: string; outletName: string; compact?: boolean }) {
  const url = `/api/consignment/outlets/${encodeURIComponent(outletKey)}/checklist`;
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dropFrame = () => {
    if (frame.current) {
      URL.revokeObjectURL(frame.current.src);
      frame.current.remove();
      frame.current = null;
    }
  };
  useEffect(() => dropFrame, []);

  async function print() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not prepare the checklist.");
      const src = URL.createObjectURL(await res.blob());
      // Removing the frame would close the print dialog, so it stays until the next print or leaving the page.
      dropFrame();
      const iframe = document.createElement("iframe");
      iframe.title = `Checklist for ${outletName}`;
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0";
      iframe.onload = () => {
        setBusy(false);
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          window.open(src, "_blank", "noopener");
        }
      };
      iframe.src = src;
      document.body.appendChild(iframe);
      frame.current = iframe;
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Could not prepare the checklist.");
    }
  }

  const size = compact ? "px-2.5 py-0.5 text-xs" : "px-4 py-1.5 text-sm";
  const printPill = (
    <button
      type="button" onClick={print} disabled={busy} aria-label={`Print the checklist for ${outletName}`}
      className={`${pill} ${size} border border-line-strong bg-surface text-ink-2 hover:border-brand hover:text-ink disabled:opacity-60`}
    >
      {busy ? (compact ? "…" : "Preparing…") : "Print"}
    </button>
  );
  const pdfPill = (
    <a
      href={`${url}?download=1`} download aria-label={`Download the checklist PDF for ${outletName}`}
      className={`${pill} ${size} bg-brand text-white hover:opacity-90`}
    >
      {compact ? "PDF" : "Download PDF"}
    </a>
  );

  return (
    <div className={`flex flex-col gap-1 ${compact ? "items-start" : "items-end"}`}>
      <div className={`flex ${compact ? "gap-1" : "gap-2"}`} role="group" aria-label={`Checklist for ${outletName}`}>
        {compact ? <>{printPill}{pdfPill}</> : <>{pdfPill}{printPill}</>}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
