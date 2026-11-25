"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PhotoMeta } from "@/lib/consignment/photo-store";

const LONG_SIDE = 2000;
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", {
  timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
});
const src = (id: number) => `/api/consignment/photos/${id}`;
const plain = "min-h-11 rounded-lg border border-line-strong px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50 md:min-h-9";

/** A phone photo is several MB. Resize it to a readable JPEG, the right way up, before sending. */
async function shrink(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, LONG_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((done, fail) => canvas.toBlob(b => (b ? done(b) : fail(new Error("no image"))), "image/jpeg", 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The proof photos of one CSG: "Take photo" opens the camera on a phone (a file
 * picker on a computer), and each thumbnail opens full size, with Delete.
 */
export function CsgPhotos({ csgNo, outletKey, photos, blocked }: {
  csgNo: string; outletKey: string; photos: PhotoMeta[]; /** Why photos cannot be taken yet, if they cannot. */ blocked: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"saving" | "deleting" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [viewing, setViewing] = useState<PhotoMeta | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  async function send(file: File) {
    setBusy("saving");
    setError(null);
    setSaved(false);
    try {
      let image: Blob;
      try {
        image = await shrink(file);
      } catch {
        setError("That picture could not be read. Take it again as a normal photo.");
        return;
      }
      const body = new FormData();
      body.set("photo", new File([image], "photo.jpg", { type: "image/jpeg" }));
      body.set("csg", csgNo);
      body.set("outlet", outletKey);
      const res = await fetch("/api/consignment/photos", { method: "POST", body });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Could not save the photo.");
      else { setSaved(true); router.refresh(); }
    } catch {
      setError("Could not send the photo. Check your connection and take it again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(p: PhotoMeta) {
    if (!window.confirm(`Delete this photo of ${csgNo}? It goes to the Google Drive bin, where it stays for 30 days.`)) return;
    setBusy("deleting");
    setError(null);
    try {
      const res = await fetch(src(p.id), { method: "DELETE" });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Could not delete the photo.");
      else { dialog.current?.close(); setSaved(false); router.refresh(); }
    } catch {
      setError("Could not delete the photo. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3 pl-12">
      <label
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border border-line-strong px-3 text-sm font-semibold text-ink-2 transition-colors focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-brand md:min-h-0 md:px-2 md:py-0.5 md:text-xs ${
          blocked || busy ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-brand hover:text-ink"
        }`}
        title={blocked ? `Photos cannot be taken yet: ${blocked}` : undefined}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
        </svg>
        {busy === "saving" ? "Saving photo…" : "Take photo"}
        <input
          type="file" accept="image/*" capture="environment" className="sr-only" disabled={!!blocked || !!busy}
          aria-label={`Take a proof photo for ${csgNo}`}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) send(f); }}
        />
      </label>

      {photos.map((p, i) => (
        <button
          key={p.id} type="button" onClick={() => { setViewing(p); setError(null); dialog.current?.showModal(); }}
          className="h-14 w-14 overflow-hidden rounded-md border border-line-strong bg-quiet hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
          aria-label={`Open photo ${i + 1} of ${csgNo}, taken ${when(p.uploadedAt)}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a private image behind sign-in */}
          <img src={src(p.id)} alt="" loading="lazy" className="h-full w-full object-cover" />
        </button>
      ))}

      <p role="status" aria-live="polite" className="text-sm empty:hidden">
        {error && !viewing ? <span className="text-danger">{error}</span> : saved ? <span className="text-ok">Photo saved.</span> : null}
      </p>

      <dialog
        ref={dialog} onClose={() => { setViewing(null); setError(null); }} aria-label={`Proof photo of ${csgNo}`}
        onClick={e => { if (e.target === dialog.current) dialog.current?.close(); }}
        className="m-auto max-h-[calc(100dvh-1rem)] w-[min(48rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border border-line bg-surface p-0 text-left backdrop:bg-black/70"
      >
        {viewing && (
          <div className="p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- a private image behind sign-in */}
            <img src={src(viewing.id)} alt={`Proof photo of ${csgNo}`} className="max-h-[70dvh] w-full rounded-lg bg-quiet object-contain" />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 break-words text-sm text-ink-2">
                <span className="font-mono font-semibold text-ink">{csgNo}</span> taken {when(viewing.uploadedAt)}
                {viewing.uploadedBy ? ` by ${viewing.uploadedBy}` : ""}
              </p>
              <div className="ml-auto flex gap-2">
                <button type="button" disabled={busy === "deleting"} onClick={() => remove(viewing)} className={`${plain} text-danger hover:border-danger`}>
                  {busy === "deleting" ? "Deleting…" : "Delete photo"}
                </button>
                <button type="button" onClick={() => dialog.current?.close()} className={`${plain} text-ink-2 hover:border-brand hover:text-ink`}>
                  Close
                </button>
              </div>
            </div>
            {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
          </div>
        )}
      </dialog>
    </div>
  );
}
