import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * Finds any remaining {{PLACEHOLDER}} tags in HTML, logs them, and writes them
 * to the generation_diagnostics table. Call this BEFORE the silent strip line.
 * Returns the list of unique unfilled placeholders found.
 */
export async function logUnfilledPlaceholders(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  templateId: string,
  pageSlug: string,
  html: string,
): Promise<string[]> {
  const matches = html.match(/\{\{[^}]+\}\}/g) || [];
  const unique = [...new Set(matches)].sort();

  if (unique.length === 0) {
    console.log(`[diagnostics] ✓ ${templateId}/${pageSlug} — all placeholders filled`);
    return [];
  }

  console.warn(
    `[diagnostics] ⚠ ${templateId}/${pageSlug} — ${unique.length} unfilled placeholder(s):`,
    unique.join(", "),
  );

  try {
    await supabase.from("generation_diagnostics").insert({
      client_id: clientId,
      template_id: templateId,
      page_slug: pageSlug,
      unfilled_placeholders: unique,
      placeholder_count: unique.length,
    });
  } catch (e) {
    console.error("[diagnostics] failed to write to generation_diagnostics:", e);
  }

  return unique;
}
