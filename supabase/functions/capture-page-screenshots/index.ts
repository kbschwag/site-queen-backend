// supabase/functions/capture-page-screenshots/index.ts
//
// Captures screenshots of all pages on a client's site and stores them
// in the page-screenshots Storage bucket. Updates the client_page_screenshots
// table with the public URLs.
//
// This function is INVOKED BY THE GENERATOR after a successful Hostinger
// deploy — NOT by the tracker. It is a build-time operation.
//
// Uses the ScreenshotOne API (or similar) for headless browser capture.
// Captures at both desktop (1440x900) and mobile (390x844) viewports.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCREENSHOT_API_KEY = Deno.env.get("SCREENSHOTONE_API_KEY") ?? "";
const SCREENSHOT_API_SECRET = Deno.env.get("SCREENSHOTONE_API_SECRET") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const STORAGE_BUCKET = "page-screenshots";
const SCREENSHOT_API = "https://api.screenshotone.com/take";

interface CaptureRequest {
  client_id: string;
  pages: Array<{ path: string; url: string; name?: string }>;
}

interface DeviceConfig {
  name: "desktop" | "mobile";
  viewport_width: number;
  viewport_height: number;
}

const DEVICES: DeviceConfig[] = [
  { name: "desktop", viewport_width: 1440, viewport_height: 900 },
  { name: "mobile", viewport_width: 390, viewport_height: 844 },
];

async function captureScreenshot(url: string, device: DeviceConfig): Promise<ArrayBuffer> {
  const params = new URLSearchParams({
    access_key: SCREENSHOT_API_KEY,
    url,
    viewport_width: device.viewport_width.toString(),
    viewport_height: device.viewport_height.toString(),
    device_scale_factor: "1",
    format: "png",
    full_page: "true",
    block_ads: "true",
    block_cookie_banners: "true",
    block_trackers: "true",
    cache: "false",
    delay: "2",
    timeout: "30",
  });

  const apiUrl = `${SCREENSHOT_API}?${params.toString()}`;
  const response = await fetch(apiUrl);

  if (!response.ok) {
    throw new Error(`Screenshot API returned ${response.status}: ${await response.text()}`);
  }

  return await response.arrayBuffer();
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders() });
  }

  // Dormant-deployment guard: refuse if the screenshot service isn't configured.
  // Returns 503 with a clear error instead of crashing silently or hitting the API with an empty key.
  if (!SCREENSHOT_API_KEY) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "screenshot service not configured",
        detail: "SCREENSHOTONE_API_KEY is not set. This function is deployed but dormant.",
      }),
      { status: 503, headers: { ...corsHeaders(), "content-type": "application/json" } },
    );
  }

  let body: CaptureRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders(), "content-type": "application/json" },
    });
  }

  const { client_id, pages } = body;

  if (!client_id || !Array.isArray(pages) || pages.length === 0) {
    return new Response(JSON.stringify({ error: "missing client_id or pages" }), {
      status: 400,
      headers: { ...corsHeaders(), "content-type": "application/json" },
    });
  }

  const results: Array<{
    path: string;
    name?: string;
    desktop_url?: string;
    mobile_url?: string;
    error?: string;
  }> = [];

  for (const page of pages) {
    const result: typeof results[0] = { path: page.path, name: page.name };
    const screenshotRecord: Record<string, unknown> = {
      client_id,
      page_path: page.path,
      page_name: page.name || null,
      captured_at: new Date().toISOString(),
    };

    let anyDeviceSucceeded = false;

    for (const device of DEVICES) {
      try {
        const buf = await captureScreenshot(page.url, device);

        const safePath =
          page.path === "/" ? "home" : page.path.replace(/^\//, "").replace(/\//g, "_");
        const storagePath = `${client_id}/${device.name}/${safePath}.png`;

        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, buf, {
            contentType: "image/png",
            upsert: true,
            cacheControl: "3600",
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
        const publicUrl = urlData.publicUrl;

        if (device.name === "desktop") {
          result.desktop_url = publicUrl;
          screenshotRecord.desktop_url = publicUrl;
          screenshotRecord.desktop_width = device.viewport_width;
          screenshotRecord.desktop_height = device.viewport_height;
        } else {
          result.mobile_url = publicUrl;
          screenshotRecord.mobile_url = publicUrl;
          screenshotRecord.mobile_width = device.viewport_width;
          screenshotRecord.mobile_height = device.viewport_height;
        }

        anyDeviceSucceeded = true;
      } catch (err) {
        result.error = `${device.name}: ${(err as Error).message}`;
      }
    }

    if (anyDeviceSucceeded) {
      await supabase
        .from("client_page_screenshots")
        .upsert(screenshotRecord, { onConflict: "client_id,page_path" });
    }

    results.push(result);
  }

  const captured = results.filter((r) => r.desktop_url || r.mobile_url).length;
  const failed = results.length - captured;

  return new Response(
    JSON.stringify({ ok: true, captured, failed, screenshots: results }),
    { status: 200, headers: { ...corsHeaders(), "content-type": "application/json" } },
  );
});
