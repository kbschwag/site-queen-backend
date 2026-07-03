// Improved Data Field Executor
// Drop-in replacement for execUpdateDataField in change-request-apply/index.ts
// Uses the Smart Field Replacer for fuzzy matching and HTML-aware replacement.

import {
  replaceFieldValue,
  findAllOccurrences,
  normalizeForComparison,
} from "./smart-field-replacer.ts";
import { FIELD_INTAKE_KEYS, getCurrentFieldValue } from "./change-request-shared.ts";

interface ExecContext {
  clientId: string;
  supabase: any;
  deployedHtml: Record<string, string>;
  intake: any;
  uploadedFileUrl: string | null;
  anthropicKey: string;
  cachedCurrentValue?: string | null;
}

interface ExecResult {
  editedFiles: string[];
  changesCount: number;
  updatedFiles: Record<string, string>;
}

/**
 * Improved execUpdateDataField with fuzzy matching.
 * 
 * Changes from original:
 * 1. Uses Smart Field Replacer instead of naive split().join()
 * 2. Handles address abbreviation differences
 * 3. Handles HTML entity differences
 * 4. Provides composite address block matching
 * 5. Falls back gracefully through multiple strategies
 */
export async function execUpdateDataFieldImproved(params: any, ctx: ExecContext): Promise<ExecResult> {
  // Step 1: Determine current value (same as before)
  let cur: string | null = ctx.cachedCurrentValue && ctx.cachedCurrentValue.trim()
    ? ctx.cachedCurrentValue
    : getCurrentFieldValue(ctx.intake, params.field) || null;

  // Fallback: run extraction if neither cache nor intake had it
  if (!cur) {
    const { extractCurrentValue } = await import("./extract-current-value.ts");
    const r = await extractCurrentValue({
      field: params.field,
      intake: ctx.intake,
      deployedHtml: ctx.deployedHtml,
      anthropicKey: ctx.anthropicKey,
    });
    cur = r.value;
  }

  if (!cur) {
    throw new Error(`Could not determine current value for ${params.field}. Not in intake or deployed HTML.`);
  }

  // Step 2: Check if already equal
  if (normalizeForComparison(cur) === normalizeForComparison(params.new_value)) {
    throw new Error(`Field already equals "${params.new_value}" (after normalization)`);
  }

  // Step 3: Use Smart Field Replacer (the key improvement)
  const isAddressField = params.field.includes("address") || params.field.includes("city") || params.field.includes("state") || params.field.includes("zip");

  const result = replaceFieldValue(
    ctx.deployedHtml,
    cur,
    params.new_value,
    {
      field: params.field,
      city: isAddressField ? getCurrentFieldValue(ctx.intake, "business_city") || undefined : undefined,
      state: isAddressField ? getCurrentFieldValue(ctx.intake, "business_state") || undefined : undefined,
      zip: isAddressField ? getCurrentFieldValue(ctx.intake, "business_zip") || undefined : undefined,
    },
  );

  // Step 4: If Smart Replacer failed, try one more strategy: search for the value
  // with HTML tags stripped and replace in the containing text node
  if (!result.success) {
    console.warn(`[improved-data-field] Smart replacer failed for ${params.field}. Trying text-node strategy...`);

    const occurrences = findAllOccurrences(ctx.deployedHtml, cur);
    if (occurrences.length > 0) {
      // We found it with fuzzy matching — apply the replacement
      for (const occ of occurrences) {
        const html = ctx.deployedHtml[occ.file] || result.updatedFiles[occ.file];
        if (!html) continue;
        const updated = html.slice(0, occ.startIndex) + params.new_value + html.slice(occ.endIndex);
        result.updatedFiles[occ.file] = updated;
        if (!result.editedFiles.includes(occ.file)) result.editedFiles.push(occ.file);
        result.changesCount++;
      }
      result.success = true;
    }
  }

  if (!result.success) {
    throw new Error(
      `Could not find "${cur.slice(0, 80)}" in any deployed page. ` +
      `Tried exact, normalized, fuzzy, and composite matching. ` +
      `The value may have been reformatted during generation.`
    );
  }

  // Step 5: Persist back into intake_data (same as before)
  const keys = FIELD_INTAKE_KEYS[params.field] || [params.field];
  const nextIntake = { ...(ctx.intake || {}) };
  nextIntake[keys[0]] = params.new_value;
  await ctx.supabase.from("sites").update({ intake_data: nextIntake }).eq("client_id", ctx.clientId);

  // Step 6: Log the match method for debugging
  console.log(`[improved-data-field] ${params.field}: replaced "${cur.slice(0, 40)}" → "${params.new_value.slice(0, 40)}" using ${result.matchMethod} matching (${result.changesCount} changes across ${result.editedFiles.length} files)`);

  return {
    editedFiles: result.editedFiles,
    changesCount: result.changesCount,
    updatedFiles: result.updatedFiles,
  };
}

/**
 * Fast-path check: Can we skip the AI routing step entirely?
 * Returns the field and new value if the instruction is a simple structured update.
 */
export function tryFastPath(instruction: string): { field: string; newValue: string } | null {
  const patterns: Array<{ regex: RegExp; field: string; valueGroup: number }> = [
    // Address
    { regex: /(?:change|update|set|replace|correct|fix)\s+(?:the\s+)?(?:business\s+)?(?:street\s+)?address\s+(?:to|with|as|→|->)\s+["']?(.+?)["']?\s*$/i, field: "business_address", valueGroup: 1 },
    { regex: /(?:new|updated?|correct)\s+(?:street\s+)?address\s*[:=]\s*["']?(.+?)["']?\s*$/i, field: "business_address", valueGroup: 1 },
    // Phone
    { regex: /(?:change|update|set|replace|correct|fix)\s+(?:the\s+)?(?:business\s+)?(?:phone|number|telephone|cell)\s+(?:to|with|as|→|->)\s+["']?(.+?)["']?\s*$/i, field: "business_phone", valueGroup: 1 },
    { regex: /(?:new|updated?|correct)\s+(?:phone|number|telephone)\s*[:=]\s*["']?(.+?)["']?\s*$/i, field: "business_phone", valueGroup: 1 },
    // Email
    { regex: /(?:change|update|set|replace|correct|fix)\s+(?:the\s+)?(?:business\s+)?(?:email|e-mail)\s+(?:to|with|as|→|->)\s+["']?(.+?)["']?\s*$/i, field: "business_email", valueGroup: 1 },
    // Business name
    { regex: /(?:change|update|set|replace|correct|fix)\s+(?:the\s+)?(?:business\s+|company\s+)?name\s+(?:to|with|as|→|->)\s+["']?(.+?)["']?\s*$/i, field: "business_name", valueGroup: 1 },
    // Hours
    { regex: /(?:change|update|set|replace|correct|fix)\s+(?:the\s+)?(?:business\s+)?hours?\s+(?:to|with|as|→|->)\s+["']?(.+?)["']?\s*$/i, field: "business_hours", valueGroup: 1 },
    // City
    { regex: /(?:change|update|set|replace|correct|fix)\s+(?:the\s+)?city\s+(?:to|with|as|→|->)\s+["']?(.+?)["']?\s*$/i, field: "business_city", valueGroup: 1 },
    // State
    { regex: /(?:change|update|set|replace|correct|fix)\s+(?:the\s+)?state\s+(?:to|with|as|→|->)\s+["']?(.+?)["']?\s*$/i, field: "business_state", valueGroup: 1 },
    // Zip
    { regex: /(?:change|update|set|replace|correct|fix)\s+(?:the\s+)?(?:zip|postal)\s*(?:code)?\s+(?:to|with|as|→|->)\s+["']?(.+?)["']?\s*$/i, field: "business_zip", valueGroup: 1 },
    // Tagline
    { regex: /(?:change|update|set|replace|correct|fix)\s+(?:the\s+)?tagline\s+(?:to|with|as|→|->)\s+["']?(.+?)["']?\s*$/i, field: "tagline", valueGroup: 1 },
    // Social URLs
    { regex: /(?:change|update|set|replace|add)\s+(?:the\s+)?instagram\s+(?:url|link)?\s*(?:to|with|as|→|->)\s+["']?(.+?)["']?\s*$/i, field: "instagram_url", valueGroup: 1 },
    { regex: /(?:change|update|set|replace|add)\s+(?:the\s+)?facebook\s+(?:url|link)?\s*(?:to|with|as|→|->)\s+["']?(.+?)["']?\s*$/i, field: "facebook_url", valueGroup: 1 },
    { regex: /(?:change|update|set|replace|add)\s+(?:the\s+)?(?:linkedin|linked\s*in)\s+(?:url|link)?\s*(?:to|with|as|→|->)\s+["']?(.+?)["']?\s*$/i, field: "linkedin_url", valueGroup: 1 },
  ];

  for (const { regex, field, valueGroup } of patterns) {
    const match = instruction.match(regex);
    if (match && match[valueGroup]) {
      const newValue = match[valueGroup].trim();
      // Sanity check: value should be reasonable
      if (newValue.length > 0 && newValue.length < 500) {
        return { field, newValue };
      }
    }
  }

  return null;
}
