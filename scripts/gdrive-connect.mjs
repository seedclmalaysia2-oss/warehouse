// One-time sign-in that lets the dashboard save photos to Google Drive.
//   node --env-file=.env scripts/gdrive-connect.mjs
// Prints a Google sign-in address, then writes GOOGLE_REFRESH_TOKEN into .env.
// The token itself is never printed. See docs/google-drive-setup.md.
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error("Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env first.");
  process.exit(1);
}

const state = randomBytes(16).toString("hex");
const verifier = randomBytes(48).toString("base64url");
let redirect;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, redirect);
  const code = url.searchParams.get("code");
  const problem = url.searchParams.get("error");
  if ((!code && !problem) || url.searchParams.get("state") !== state) {
    res.writeHead(404).end();
    return;
  }
  const finish = (text, ok) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", Connection: "close" }).end(text);
    console.log(text);
    server.close();
    process.exitCode = ok ? 0 : 1;
  };
  if (problem) return finish(`Google did not allow access (${problem}).`, false);
  try {
    const reply = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: id, client_secret: secret, code, code_verifier: verifier,
        grant_type: "authorization_code", redirect_uri: redirect,
      }),
    });
    const token = await reply.json();
    if (!token.refresh_token) return finish(`No sign-in token came back (${token.error ?? "unknown error"}). Run this again.`, false);
    const env = readFileSync(".env", "utf8");
    const line = `GOOGLE_REFRESH_TOKEN=${token.refresh_token}`;
    const existing = /^GOOGLE_REFRESH_TOKEN=[^\r\n]*/m;
    writeFileSync(".env", existing.test(env) ? env.replace(existing, () => line) : `${env.replace(/\r?\n?$/, "\n")}${line}\n`);
    finish("Connected. GOOGLE_REFRESH_TOKEN is saved in .env. You can close this tab.", true);
  } catch (e) {
    finish(`Could not finish connecting (${e.message}). Run this again.`, false);
  }
});

server.listen(0, "127.0.0.1", () => {
  redirect = `http://127.0.0.1:${server.address().port}`;
  const query = new URLSearchParams({
    client_id: id, redirect_uri: redirect, response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file",
    access_type: "offline", prompt: "consent", state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
  });
  console.log("Open this address in a browser on this computer and sign in with the warehouse Google account:\n");
  console.log(`https://accounts.google.com/o/oauth2/v2/auth?${query}\n`);
});
