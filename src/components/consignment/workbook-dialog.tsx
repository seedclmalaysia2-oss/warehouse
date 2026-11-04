"use client";
import { useRef } from "react";
import { UploadBox } from "./upload-box";

/** Updates the workbook over the current page, so nobody has to leave what they were looking at. */
export function WorkbookDialog({ label = "Update workbook", primary = false }: { label?: string; primary?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button" onClick={() => ref.current?.showModal()}
        className={primary
          ? "rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          : "rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"}
      >
        {label}
      </button>
      <dialog
        ref={ref} aria-label="Update the consignment workbook"
        onClick={e => { if (e.target === ref.current) ref.current?.close(); }}
        className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-xl bg-transparent p-0 text-left backdrop:bg-black/50"
      >
        <div className="relative">
          <UploadBox embedded />
          <button
            type="button" onClick={() => ref.current?.close()}
            className="absolute right-3 top-3 rounded px-2 py-1 text-sm font-semibold text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
          >
            Close
          </button>
        </div>
      </dialog>
    </>
  );
}
