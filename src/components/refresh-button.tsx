"use client";

/**
 * Reloads the whole page, beside the build number in the side menu. A full reload, not a router refresh,
 * so a phone that has kept the site open picks up a newer build as well as fresh figures.
 */
export function RefreshButton() {
  return (
    <button type="button" className="refresh-btn" onClick={() => window.location.reload()} aria-label="Refresh the page" title="Refresh">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
      </svg>
    </button>
  );
}
