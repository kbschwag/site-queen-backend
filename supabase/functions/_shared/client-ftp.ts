// Shared FTP/FTPS helper for uploading directly to a client's own Hostinger
// (or any standard FTP) account using credentials stored in
// `client_ftp_credentials`.
//
// Implementation uses `basic-ftp` over npm via esm.sh, which works in Deno
// edge functions and supports FTPS (explicit TLS over port 21).

import { Client } from "https://esm.sh/basic-ftp@5.0.5?target=denonext";

export interface ClientFtpCreds {
  ftp_host: string;
  ftp_user: string;
  ftp_password: string;
  ftp_path: string;
  ftp_port?: number | null;
  use_secure?: boolean | null;
}

export interface FtpFile {
  /** Filename only — e.g. "index.html". The client's `ftp_path` is the dir. */
  filename: string;
  content: string | Uint8Array;
}

function normalizeBaseDir(p: string): string {
  let s = (p || "/public_html/").trim();
  if (!s.startsWith("/")) s = "/" + s;
  if (!s.endsWith("/")) s = s + "/";
  return s;
}

async function withClient<T>(
  creds: ClientFtpCreds,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(30_000);
  client.ftp.verbose = false;
  try {
    await client.access({
      host: creds.ftp_host.trim(),
      user: creds.ftp_user.trim(),
      password: creds.ftp_password,
      port: creds.ftp_port || 21,
      secure: creds.use_secure === false ? false : true,
      secureOptions: { rejectUnauthorized: false },
    });
    return await fn(client);
  } finally {
    try { client.close(); } catch { /* noop */ }
  }
}

/** Open a connection, list the target directory, then close. Used by the
 *  test endpoint to verify creds before saving. */
export async function testFtpConnection(creds: ClientFtpCreds): Promise<{
  ok: boolean;
  message: string;
  listingSample?: string[];
}> {
  try {
    const result = await withClient(creds, async (client) => {
      const baseDir = normalizeBaseDir(creds.ftp_path);
      try {
        await client.ensureDir(baseDir);
      } catch (e: any) {
        // Directory may exist; ensureDir leaves us cd'd somewhere — fall back.
        await client.cd("/");
        await client.cd(baseDir);
      }
      const listing = await client.list();
      return listing.slice(0, 5).map((f: any) => f.name);
    });
    return {
      ok: true,
      message: `Connected to ${creds.ftp_host} and accessed ${normalizeBaseDir(creds.ftp_path)}`,
      listingSample: result,
    };
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) };
  }
}

/** Upload a batch of files to the client's FTP account at `ftp_path`. */
export async function uploadToClientFtp(
  creds: ClientFtpCreds,
  files: FtpFile[],
): Promise<void> {
  if (files.length === 0) return;
  await withClient(creds, async (client) => {
    const baseDir = normalizeBaseDir(creds.ftp_path);
    await client.ensureDir(baseDir);
    for (const f of files) {
      const bytes =
        typeof f.content === "string"
          ? new TextEncoder().encode(f.content)
          : f.content;
      // basic-ftp's uploadFrom in Deno wants a Readable; we use a Blob stream.
      const blob = new Blob([bytes]);
      // deno-lint-ignore no-explicit-any
      await client.uploadFrom(blob.stream() as any, f.filename);
    }
  });
}
