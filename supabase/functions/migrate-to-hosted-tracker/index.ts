// migrate-to-hosted-tracker
//
// Migrates the 18 existing client sites from the inline analytics tracker
// block (baked into each HTML file at generation time) to the new hosted
// loader snippet that points at the tracker-v2 edge function.
//
// SAFETY:
//   - Defaults to DRY-RUN. Must be explicitly invoked with mode="live".
//   - Owner role required.
//   - Per-file backup to generated-sites/<clientId>/_pre-tracker-v2/<file>
//     before any write in live mode.
//   - Regex is anchored on this client's specific UUID inside the inline
//     block, so it cannot accidentally match anything else.
//   - Skips files with 0 matches (hand-edited / different template) and
//     >1 matches (ambiguous — log + skip).
//
// POST body: { "mode": "dry-run" | "live" }   (default: "dry-run")
// Returns:   { summary, log }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadFileToHostingerFtp } from "../_shared/hostinger-ftp.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Build the inline-tracker regex for a specific client. Matches the exact
// shape emitted by the old generator (see generate-website/index.ts and
// generate-website-part1/index.ts pre-Phase-3):
//
//   <script>\n(function() {\n  var CLIENT_ID = '<uuid>';
//   ...
//   })();\n</script>
//
// Anchored on the literal UUID so cross-client matches are impossible.
function buildInlineTrackerRegex(clientId: string): RegExp {
  const escUuid = clientId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Non-greedy across newlines. Anchor on the unique CLIENT_ID line.
  return new RegExp(
    `\\s*<script>\\s*\\n\\s*\\(function\\(\\) \\{\\s*\\n\\s*var CLIENT_ID = '${escUuid}';[\\s\\S]*?\\}\\)\\(\\);\\s*<\\/script>`,
    "g",
  );
}

function buildLoaderSnippet(clientId: string, supabaseUrl: string): string {
  return `\n<script async
  src="${supabaseUrl}/functions/v1/tracker-v2"
  data-client-id="${clientId}"
  data-endpoint="${supabaseUrl}/functions/v1/track-event"></script>`;
}

function diffSample(before: string, after: string, matchIndex: number, matchLen: number): string {
  // Show 80 chars of context around the replacement boundary in BOTH versions.
  const ctxBefore = before.substring(Math.max(0, matchIndex - 60), Math.min(before.length, matchIndex + matchLen + 60));
  const ctxAfter  = after.substring(Math.max(0, matchIndex - 60), Math.min(after.length, matchIndex + 400));
  return `--- BEFORE (±60 chars around old block) ---\n${ctxBefore}\n\n--- AFTER (±60 chars around new block) ---\n${ctxAfter}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Auth: owner-only
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden — admin role required" }), {
      status: 403, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let mode: "dry-run" | "live" = "dry-run";
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.mode === "live") mode = "live";
  } catch (_) { /* default dry-run */ }

  // Fetch all in-scope clients
  const { data: clients, error: cliErr } = await supabase
    .from("clients")
    .select("id, business_name, site_status")
    .in("site_status", ["staging", "live"])
    .is("deleted_at", null);
  if (cliErr) {
    return new Response(JSON.stringify({ error: `clients query: ${cliErr.message}` }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  type LogRow = {
    client_id: string;
    file_path: string;
    mode: string;
    result: string;
    match_count: number;
    file_size_before: number | null;
    file_size_after: number | null;
    diff_sample: string | null;
    error_message: string | null;
  };
  const logRows: LogRow[] = [];
  const summary = {
    mode,
    sites_scanned: 0,
    files_scanned: 0,
    matched_cleanly: 0,
    no_match: 0,
    multiple_matches: 0,
    failed: 0,
  };

  for (const c of clients || []) {
    summary.sites_scanned++;
    const regex = buildInlineTrackerRegex(c.id);
    const loader = buildLoaderSnippet(c.id, supabaseUrl);

    // List HTML in deploy/ (source of truth for what's deployed)
    const { data: listing, error: lstErr } = await supabase.storage
      .from("generated-sites")
      .list(`${c.id}/deploy`, { limit: 200 });
    if (lstErr) {
      logRows.push({
        client_id: c.id, file_path: "(deploy/ list)", mode, result: "failed",
        match_count: 0, file_size_before: null, file_size_after: null,
        diff_sample: null, error_message: `list error: ${lstErr.message}`,
      });
      summary.failed++;
      continue;
    }
    const htmlFiles = (listing || []).filter((f: any) => f.name?.toLowerCase().endsWith(".html"));
    if (htmlFiles.length === 0) {
      logRows.push({
        client_id: c.id, file_path: "(no html files)", mode, result: "no_match",
        match_count: 0, file_size_before: null, file_size_after: null,
        diff_sample: null, error_message: null,
      });
      summary.no_match++;
      continue;
    }

    for (const f of htmlFiles) {
      summary.files_scanned++;
      const filePath = `${c.id}/deploy/${f.name}`;
      try {
        const { data: blob, error: dlErr } = await supabase.storage
          .from("generated-sites").download(filePath);
        if (dlErr || !blob) throw new Error(`download: ${dlErr?.message || "no blob"}`);
        const before = await blob.text();
        const sizeBefore = before.length;

        // Match count
        const reCount = new RegExp(buildInlineTrackerRegex(c.id).source, "g");
        const matches = before.match(reCount) || [];
        const count = matches.length;

        if (count === 0) {
          logRows.push({
            client_id: c.id, file_path: filePath, mode, result: "no_match",
            match_count: 0, file_size_before: sizeBefore, file_size_after: null,
            diff_sample: null, error_message: null,
          });
          summary.no_match++;
          continue;
        }
        if (count > 1) {
          logRows.push({
            client_id: c.id, file_path: filePath, mode, result: "multiple_matches",
            match_count: count, file_size_before: sizeBefore, file_size_after: null,
            diff_sample: null, error_message: null,
          });
          summary.multiple_matches++;
          continue;
        }

        // Exactly one match — compute replacement
        const firstMatch = reCount.exec(before)!;
        const matchIndex = firstMatch.index;
        const matchLen = firstMatch[0].length;
        const after = before.replace(buildInlineTrackerRegex(c.id), loader);
        const sizeAfter = after.length;
        const diff = diffSample(before, after, matchIndex, matchLen).substring(0, 4000);

        if (mode === "dry-run") {
          logRows.push({
            client_id: c.id, file_path: filePath, mode, result: "would_migrate",
            match_count: 1, file_size_before: sizeBefore, file_size_after: sizeAfter,
            diff_sample: diff, error_message: null,
          });
          summary.matched_cleanly++;
        } else {
          // LIVE: backup → upload to Hostinger + re-upload to bucket
          const backupPath = `${c.id}/_pre-tracker-v2/${f.name}`;
          const { error: bkErr } = await supabase.storage
            .from("generated-sites")
            .upload(backupPath, new Blob([before], { type: "text/html" }),
              { upsert: true, contentType: "text/html; charset=utf-8" });
          if (bkErr) throw new Error(`backup: ${bkErr.message}`);

          // Hostinger production root is /public_html for live sites
          // (matches deploy-to-hostinger logic). Staging sites live at
          // /public_html/staging/<clientId>/. We pick destination by status.
          const remoteBase = c.site_status === "live"
            ? "/public_html"
            : `/public_html/staging/${c.id}`;
          await uploadFileToHostingerFtp(`${remoteBase}/${f.name}`, after);

          // Re-upload to bucket so future deploys / restores use migrated copy
          const { error: upErr } = await supabase.storage
            .from("generated-sites")
            .upload(filePath, new Blob([after], { type: "text/html" }),
              { upsert: true, contentType: "text/html; charset=utf-8" });
          if (upErr) throw new Error(`re-upload: ${upErr.message}`);

          logRows.push({
            client_id: c.id, file_path: filePath, mode, result: "migrated",
            match_count: 1, file_size_before: sizeBefore, file_size_after: sizeAfter,
            diff_sample: diff, error_message: null,
          });
          summary.matched_cleanly++;
        }
      } catch (e: any) {
        logRows.push({
          client_id: c.id, file_path: filePath, mode, result: "failed",
          match_count: 0, file_size_before: null, file_size_after: null,
          diff_sample: null, error_message: e?.message || String(e),
        });
        summary.failed++;
      }
    }
  }

  // Persist log
  if (logRows.length > 0) {
    const { error: insErr } = await supabase
      .from("tracker_migration_log").insert(logRows);
    if (insErr) console.error("log insert error:", insErr);
  }

  return new Response(JSON.stringify({ summary, log: logRows }, null, 2), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
