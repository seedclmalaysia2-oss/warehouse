"use client";
import { useRef } from "react";
import { MultiCsgUpload } from "./multi-csg-upload";

/** Uploads a file of many CSGs over the overview, next to "Update workbook". */
export function CsgFileDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button" onClick={() => ref.current?.showModal()}
        className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Upload CSG file
      </button>
      <dialog
        ref={ref} aria-labelledby="multi-csg-h"
        onClick={e => { if (e.target === ref.current) ref.current?.close(); }}
        className="m-auto max-h-[calc(100vh-2rem)] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto rounded-xl bg-transparent p-0 text-left backdrop:bg-black/50"
      >
        <MultiCsgUpload onClose={() => ref.current?.close()} />
      </dialog>
    </>
  );
}
