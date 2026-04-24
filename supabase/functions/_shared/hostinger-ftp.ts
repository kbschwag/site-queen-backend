// Shared FTP helper for uploading files to Hostinger shared hosting.
//
// Hostinger's public REST API does NOT have a file-upload endpoint, so all
// site deploys (live + staging) push HTML over FTPS using the `basic-ftp`
// npm package. Three secrets are required:
//   - HOSTINGER_FTP_HOST     (e.g. "ftp.your-domain.com" or the IP shown in hPanel)
//   - HOSTINGER_FTP_USER     (FTP username from hPanel → Files → FTP accounts)
//   - HOSTINGER_FTP_PASSWORD (FTP password)
//
// Hostinger supports FTPS (FTP over explicit TLS) on port 21, which is what
// we use. Plain FTP would also work but transmits credentials in cleartext.

// deno-lint-ignore-file no-explicit-any
import { Client } from "npm:basic-ftp@5.3.0";
import { Buffer } from "node:buffer";
import { Readable } from "node:stream";

export interface FtpUpload {
  /** Absolute remote path, e.g. "/public_html/index.html" */
  remotePath: string;
  /** Raw file contents (UTF-8 string is fine for HTML) */
  content: string | Uint8Array;
}

function getCreds() {
  const host = Deno.env.get("HOSTINGER_FTP_HOST");
  const user = Deno.env.get("HOSTINGER_FTP_USER");
  const password = Deno.env.get("HOSTINGER_FTP_PASSWORD");
  if (!host || !user || !password) {
    throw new Error(
      "Hostinger FTP credentials missing — set HOSTINGER_FTP_HOST, HOSTINGER_FTP_USER, and HOSTINGER_FTP_PASSWORD in project secrets",
    );
  }
  return { host, user, password };
}

/** Split "/public_html/staging/abc/index.html" → ["public_html", "staging", "abc"]. */
function parentDirs(remotePath: string): string[] {
  const parts = remotePath.split("/").filter(Boolean);
  parts.pop(); // drop filename
  return parts;
}

/**
 * Upload one or many files to Hostinger over FTPS. Creates parent directories
 * as needed. Reuses a single connection for all uploads in the batch.
 */
export async function uploadToHostingerFtp(uploads: FtpUpload[]): Promise<void> {
  if (uploads.length === 0) return;
  const { host, user, password } = getCreds();

  const client = new Client(30_000); // 30s timeout
  client.ftp.verbose = false;

  try {
    await client.access({
      host,
      user,
      password,
      secure: true, // FTPS (explicit TLS)
      secureOptions: { rejectUnauthorized: false }, // Hostinger certs sometimes mismatch
    });

    for (const u of uploads) {
      // Ensure parent dir exists, then cd into it.
      await client.cd("/");
      const dirs = parentDirs(u.remotePath);
      for (const d of dirs) {
        try {
          await client.ensureDir(d); // creates if needed AND cds into it
        } catch (e) {
          throw new Error(`Failed to ensure directory "${d}" while uploading ${u.remotePath}: ${(e as Error).message}`);
        }
      }
      // After ensureDir loop, CWD is the deepest dir. Use the basename as the upload target.
      const filename = u.remotePath.split("/").pop()!;
      const buf =
        typeof u.content === "string"
          ? Buffer.from(u.content, "utf8")
          : Buffer.from(u.content);
      const stream = Readable.from(buf);
      await client.uploadFrom(stream as any, filename);
    }
  } finally {
    client.close();
  }
}

/** Convenience: upload a single file. */
export async function uploadFileToHostingerFtp(
  remotePath: string,
  content: string | Uint8Array,
): Promise<void> {
  await uploadToHostingerFtp([{ remotePath, content }]);
}
