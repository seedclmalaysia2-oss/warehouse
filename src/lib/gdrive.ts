// Google Drive, for the CSG proof photos. Signs in as the warehouse Google
// account with a refresh token (see docs/google-drive-setup.md). The scope is
// drive.file, so the app can only see the files and folders it made itself.
// Server only: these keys must never reach the browser.

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
export const ROOT_FOLDER = "SEED Warehouse - CSG proof photos";

/** A message that can be shown to the user. */
export class DriveError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export const driveConfigured = () =>
  !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);

let cached: { token: string; until: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.until) return cached.token;
  if (!driveConfigured()) throw new DriveError("Google Drive is not set up yet.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    cache: "no-store",
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    throw new DriveError(json.error === "invalid_grant"
      ? "The Google Drive sign-in has expired. Run the connect step again."
      : "Could not sign in to Google Drive. Check the Google keys.");
  }
  // Renew a minute early so a token never runs out mid-request.
  cached = { token: json.access_token, until: Date.now() + ((json.expires_in ?? 3600) - 60) * 1000 };
  return cached.token;
}

async function call(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await accessToken()}`);
  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    if (res.status === 404) throw new DriveError("That file is no longer in Google Drive.", 404);
    const reason = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message;
    throw new DriveError(`Google Drive refused the request (${res.status}${reason ? `: ${reason}` : ""}).`, res.status);
  }
  return res;
}

const quoted = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** The id of the folder with this name (under `parent`), making it if there is none. */
async function folderId(name: string, parent?: string): Promise<string> {
  const q = [
    `name = '${quoted(name)}'`, `mimeType = '${FOLDER}'`, "trashed = false",
    ...(parent ? [`'${parent}' in parents`] : []),
  ].join(" and ");
  const search = new URLSearchParams({ q, fields: "files(id)", orderBy: "createdTime", pageSize: "1" });
  const found = (await (await call(`${API}/files?${search}`)).json()) as { files: { id: string }[] };
  if (found.files[0]) return found.files[0].id;
  const made = await call(`${API}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}) }),
  });
  return ((await made.json()) as { id: string }).id;
}

/** Save a JPEG as "<root>/<outlet>/<fileName>" and return its Drive file id. */
export async function uploadPhoto(outlet: string, fileName: string, bytes: Uint8Array): Promise<string> {
  const parent = await folderId(outlet, await folderId(ROOT_FOLDER));
  const boundary = `seed-${crypto.randomUUID()}`;
  const meta = JSON.stringify({ name: fileName, parents: [parent] });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`,
    new Uint8Array(bytes),
    `\r\n--${boundary}--`,
  ]);
  const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  return ((await res.json()) as { id: string }).id;
}

export const downloadPhoto = (id: string) => call(`${API}/files/${encodeURIComponent(id)}?alt=media`);

/** Move a file to the Drive bin, where Google keeps it for 30 days. A file already gone counts as done. */
export async function binPhoto(id: string): Promise<void> {
  try {
    await call(`${API}/files/${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }),
    });
  } catch (e) {
    if (!(e instanceof DriveError && e.status === 404)) throw e;
  }
}
