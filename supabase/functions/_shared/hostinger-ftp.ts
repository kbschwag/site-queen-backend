// Shared upload helper for Hostinger shared hosting.
//
// Hostinger's public REST API has no file-upload endpoint, and Supabase Edge
// Runtime blocks outbound TCP on FTP/SFTP ports. So we POST files over HTTPS
// to a tiny PHP receiver living on the Hostinger account itself
// (scripts/hostinger-upload-receiver.php → uploaded to /public_html/_sq_upload.php).
//
// Required project secrets:
//   - HOSTINGER_UPLOAD_URL    — full https URL of the receiver
//                                (e.g. https://sitequeen.ai/_sq_upload.php)
//   - HOSTINGER_UPLOAD_SECRET — shared secret string; must match the
//                                SHARED_SECRET constant in the PHP file.

export interface FtpUpload {
  /** Absolute remote path, e.g. "/public_html/index.html" */
  remotePath: string;
  /** Raw file contents (UTF-8 string for HTML, or bytes) */
  content: string | Uint8Array;
}

function getCreds() {
  const url = Deno.env.get("HOSTINGER_UPLOAD_URL");
  const secret = Deno.env.get("HOSTINGER_UPLOAD_SECRET");
  if (!url || !secret) {
    throw new Error(
      "Hostinger upload receiver not configured — set HOSTINGER_UPLOAD_URL and HOSTINGER_UPLOAD_SECRET in project secrets, and upload scripts/hostinger-upload-receiver.php to /public_html/_sq_upload.php on Hostinger.",
    );
  }
  return { url, secret };
}

function toBase64(content: string | Uint8Array): string {
  const bytes =
    typeof content === "string"
      ? new TextEncoder().encode(content)
      : content;
  // Base64-encode without busting the call stack on large payloads.
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/**
 * Upload one or many files to Hostinger via the PHP receiver. All uploads
 * happen in a single POST so it stays fast.
 */
export async function uploadToHostingerFtp(uploads: FtpUpload[]): Promise<void> {
  if (uploads.length === 0) return;
  const { url, secret } = getCreds();

  const payload = {
    files: uploads.map((u) => ({
      path: u.remotePath,
      content_b64: toBase64(u.content),
    })),
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Upload-Secret": secret,
    },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  if (!resp.ok && resp.status !== 207) {
    throw new Error(
      `Hostinger upload receiver failed (${resp.status}): ${text.substring(0, 400)}`,
    );
  }

  // Parse response and surface partial failures as a thrown error.
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `Hostinger upload receiver returned non-JSON (${resp.status}): ${text.substring(0, 200)}`,
    );
  }
  if (Array.isArray(parsed?.failed) && parsed.failed.length > 0) {
    const summary = parsed.failed
      .map((f: any) => `${f.path}: ${f.error}`)
      .join("; ");
    throw new Error(`Hostinger upload partial failure: ${summary}`);
  }
}

/** Convenience: upload a single file. */
export async function uploadFileToHostingerFtp(
  remotePath: string,
  content: string | Uint8Array,
): Promise<void> {
  await uploadToHostingerFtp([{ remotePath, content }]);
}
