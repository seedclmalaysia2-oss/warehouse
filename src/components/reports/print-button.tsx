"use client";

/** Opens the browser's print dialog; the page's print styles leave only the report sheet. */
export function PrintButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      Print
    </button>
  );
}
