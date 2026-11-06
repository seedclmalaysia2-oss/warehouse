"use client";
import { useRef } from "react";
import { CsrUpload } from "./csr-upload";

/** Uploads CSR files over the overview, next to "Upload CSG file". */
export function CsrFileDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button" onClick={() => ref.current?.showModal()}
        className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Upload CSR file
      </button>
      <dialog
        ref={ref} aria-labelledby="csr-h"
        onClick={e => { if (e.target === ref.current) ref.current?.close(); }}
        className="m-auto max-h-[calc(100vh-2rem)] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto rounded-xl bg-transparent p-0 text-left backdrop:bg-black/50"
      >
        <CsrUpload onClose={() => ref.current?.close()} />
      </dialog>
    </>
  );
}
