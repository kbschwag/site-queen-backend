// Shared upload helper for Hostinger shared hosting.
//
// We POST files over HTTPS to a tiny PHP receiver living on the Hostinger
// account itself (/public_html/_sq_upload.php).
//
// Receiver contract (current):
//   - Header: X-SECRET = STAGING_UPLOAD_SECRET
//   - Body:   multipart/form-data with:
//       file       — the file blob
//       client_id  — destination client folder (UUID) or "__root__" for /public_html
//       filename   — destination filename (e.g. index.html)
//
// Required project secrets:
//   - STAGING_UPLOAD_SECRET — shared secret string; must match the
//                              SHARED_SECRET / X-SECRET expected by the PHP file.
//   - HOSTINGER_UPLOAD_URL  — full https URL of the receiver
//                              (e.g. https://staging.sitequeen.ai/_sq_upload.php).
//                              Falls back to the staging URL if not set.

const DEFAULT_RECEIVER_URL = "https://staging.sitequeen.ai/_sq_upload.php";

export interface FtpUpload {
  /** Absolute remote path, e.g. "/public_html/staging/<clientId>/index.html"
   *  or "/public_html/index.html". The helper derives client_id + filename
   *  from the trailing two path segments. */
  remotePath: string;
  /** Raw file contents (UTF-8 string for HTML, or bytes) */
  content: string | Uint8Array;
}

function getCreds() {
  const url = Deno.env.get("HOSTINGER_UPLOAD_URL") || DEFAULT_RECEIVER_URL;
  const secret =
    Deno.env.get("STAGING_UPLOAD_SECRET") ||
    Deno.env.get("HOSTINGER_UPLOAD_SECRET");
  if (!secret) {
    throw new Error(
      "Hostinger upload receiver not configured — set STAGING_UPLOAD_SECRET in project secrets.",
    );
  }
  return { url, secret };
}

/** Pull `client_id` and `filename` out of a remotePath. */
function splitRemotePath(remotePath: string): { clientId: string; filename: string } {
  const parts = remotePath.split("/").filter(Boolean);
  const filename = parts[parts.length - 1] || "index.html";
  // Recognise patterns:
  //   public_html/staging/<clientId>/<file>     → clientId = staging/<clientId>
  //   public_html/<clientId>/<file>             → clientId = <clientId>
  //   public_html/<file>                        → clientId = "__root__"
  // The receiver decides the destination folder; we just pass these tokens.
  if (parts.length >= 4 && parts[0] === "public_html" && parts[1] === "staging") {
    return { clientId: `staging/${parts[2]}`, filename };
  }
  if (parts.length >= 3 && parts[0] === "public_html") {
    return { clientId: parts[1], filename };
  }
  return { clientId: "__root__", filename };
}

async function uploadOne(
  url: string,
  secret: string,
  upload: FtpUpload,
): Promise<void> {
  const { clientId, filename } = splitRemotePath(upload.remotePath);
  const blob =
    typeof upload.content === "string"
      ? new Blob([upload.content], { type: "text/html" })
      : new Blob([upload.content as BlobPart], { type: "text/html" });

  const form = new FormData();
  form.append("file", blob, filename);
  form.append("client_id", clientId);
  form.append("filename", filename);

  const resp = await fetch(url, {
    method: "POST",
    headers: { "X-SECRET": secret },
    body: form,
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(
      `Hostinger upload receiver failed for ${upload.remotePath} (${resp.status}): ${text.substring(0, 400)}`,
    );
  }
  console.log(`[hostinger-upload] ${upload.remotePath} → ${text.substring(0, 200)}`);
}

/**
 * Upload one or many files to Hostinger via the PHP receiver. Each file is
 * sent as its own multipart POST (the receiver accepts one file per request).
 */
export async function uploadToHostingerFtp(uploads: FtpUpload[]): Promise<void> {
  if (uploads.length === 0) return;
  const { url, secret } = getCreds();
  const failures: string[] = [];
  for (const u of uploads) {
    try {
      await uploadOne(url, secret, u);
    } catch (e: any) {
      failures.push(e.message || String(e));
    }
  }
  if (failures.length > 0) {
    throw new Error(`Hostinger upload partial failure: ${failures.join("; ")}`);
  }
}

/** Convenience: upload a single file. */
export async function uploadFileToHostingerFtp(
  remotePath: string,
  content: string | Uint8Array,
): Promise<void> {
  await uploadToHostingerFtp([{ remotePath, content }]);
}
