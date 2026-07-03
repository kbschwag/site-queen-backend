// Smart Field Replacer: Fuzzy matching + HTML-aware replacement for structured data fields.
// Solves the "changing an address is painful" problem by handling formatting variations,
// HTML entities, abbreviation differences, and composite address blocks.

export interface ReplacementResult {
  success: boolean;
  editedFiles: string[];
  changesCount: number;
  updatedFiles: Record<string, string>;
  matchMethod: "exact" | "normalized" | "fuzzy" | "composite" | "regex";
  warnings: string[];
}

// ─── Address Abbreviation Map ──────────────────────────────────────────────────
const ADDRESS_ABBREVIATIONS: Record<string, string[]> = {
  street: ["st", "str", "street"],
  avenue: ["ave", "av", "avenue"],
  boulevard: ["blvd", "boulevard"],
  drive: ["dr", "drive"],
  lane: ["ln", "lane"],
  road: ["rd", "road"],
  court: ["ct", "court"],
  place: ["pl", "place"],
  circle: ["cir", "circle"],
  highway: ["hwy", "highway"],
  parkway: ["pkwy", "parkway"],
  suite: ["ste", "suite", "unit"],
  apartment: ["apt", "apartment"],
  north: ["n", "north"],
  south: ["s", "south"],
  east: ["e", "east"],
  west: ["w", "west"],
};

// ─── Normalize text for comparison ─────────────────────────────────────────────
export function normalizeForComparison(text: string): string {
  let normalized = text
    .toLowerCase()
    .trim()
    // Decode HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Remove HTML tags
    .replace(/<[^>]+>/g, " ")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    // Remove common punctuation differences
    .replace(/[.,;:!?()]/g, "")
    .trim();

  return normalized;
}

// ─── Normalize address abbreviations ───────────────────────────────────────────
function normalizeAddressAbbreviations(text: string): string {
  let result = text.toLowerCase();
  for (const [full, abbrevs] of Object.entries(ADDRESS_ABBREVIATIONS)) {
    for (const abbrev of abbrevs) {
      // Match word boundaries
      const re = new RegExp(`\\b${abbrev}\\.?\\b`, "gi");
      result = result.replace(re, full);
    }
  }
  return result;
}

// ─── Find value in HTML using multiple strategies ──────────────────────────────
export function findValueInHtml(
  html: string,
  searchValue: string,
): { found: boolean; matchedText: string; method: "exact" | "normalized" | "fuzzy" | "regex"; startIndex: number; endIndex: number } | null {

  // Strategy 1: Exact match
  const exactIndex = html.indexOf(searchValue);
  if (exactIndex !== -1) {
    return { found: true, matchedText: searchValue, method: "exact", startIndex: exactIndex, endIndex: exactIndex + searchValue.length };
  }

  // Strategy 2: Case-insensitive match
  const lowerHtml = html.toLowerCase();
  const lowerSearch = searchValue.toLowerCase();
  const caseIndex = lowerHtml.indexOf(lowerSearch);
  if (caseIndex !== -1) {
    const actualText = html.slice(caseIndex, caseIndex + searchValue.length);
    return { found: true, matchedText: actualText, method: "normalized", startIndex: caseIndex, endIndex: caseIndex + searchValue.length };
  }

  // Strategy 3: Normalized match (handles HTML entities, extra whitespace)
  const normalizedSearch = normalizeForComparison(searchValue);
  // Search through text nodes
  const textNodeRe = />([^<]+)</g;
  let m: RegExpExecArray | null;
  while ((m = textNodeRe.exec(html)) !== null) {
    const textContent = m[1];
    const normalizedText = normalizeForComparison(textContent);
    if (normalizedText.includes(normalizedSearch)) {
      // Found it in a text node — return the original text
      const textStart = m.index + 1; // Skip the ">"
      return { found: true, matchedText: textContent, method: "normalized", startIndex: textStart, endIndex: textStart + textContent.length };
    }
  }

  // Strategy 4: Address-aware fuzzy match
  const normalizedAddressSearch = normalizeAddressAbbreviations(normalizedSearch);
  textNodeRe.lastIndex = 0;
  while ((m = textNodeRe.exec(html)) !== null) {
    const textContent = m[1];
    const normalizedText = normalizeAddressAbbreviations(normalizeForComparison(textContent));
    if (normalizedText.includes(normalizedAddressSearch)) {
      const textStart = m.index + 1;
      return { found: true, matchedText: textContent, method: "fuzzy", startIndex: textStart, endIndex: textStart + textContent.length };
    }
  }

  return null;
}

// ─── Find all occurrences of a value across files ──────────────────────────────
export function findAllOccurrences(
  deployedHtml: Record<string, string>,
  searchValue: string,
): Array<{ file: string; matchedText: string; method: string; startIndex: number; endIndex: number }> {
  const results: Array<{ file: string; matchedText: string; method: string; startIndex: number; endIndex: number }> = [];

  for (const [file, html] of Object.entries(deployedHtml)) {
    if (!html) continue;

    // Find ALL occurrences (not just the first)
    let searchFrom = 0;
    while (searchFrom < html.length) {
      const remaining = html.slice(searchFrom);
      const match = findValueInHtml(remaining, searchValue);
      if (!match) break;

      results.push({
        file,
        matchedText: match.matchedText,
        method: match.method,
        startIndex: searchFrom + match.startIndex,
        endIndex: searchFrom + match.endIndex,
      });
      searchFrom += match.endIndex;
    }
  }

  return results;
}

// ─── Composite Address Finder ──────────────────────────────────────────────────
// Finds the full address block (street + city + state + zip) even when split across
// multiple HTML elements or separated by <br> tags.
export function findAddressBlock(
  html: string,
  street: string,
  city?: string,
  state?: string,
  zip?: string,
): { found: boolean; blockHtml: string; startIndex: number; endIndex: number } | null {

  // Strategy 1: Find a container that has all address parts
  const addressPatterns = [
    // Pattern: All in one line
    new RegExp(`[^<]*${escapeRegex(street)}[^<]*`, "i"),
    // Pattern: With <br> separators
    new RegExp(`${escapeRegex(street)}[\\s\\S]{0,100}(?:<br\\s*\\/?>|\\n)[\\s\\S]{0,100}${city ? escapeRegex(city) : "[A-Z][a-z]+"}`, "i"),
    // Pattern: Inside an <a> tag (Google Maps link)
    new RegExp(`<a[^>]*(?:maps|directions)[^>]*>[\\s\\S]*?${escapeRegex(street)}[\\s\\S]*?<\\/a>`, "i"),
  ];

  for (const pattern of addressPatterns) {
    const match = html.match(pattern);
    if (match && match.index !== undefined) {
      // Expand to the nearest containing element
      const blockStart = findContainingElementStart(html, match.index);
      const blockEnd = findContainingElementEnd(html, match.index + match[0].length);
      return {
        found: true,
        blockHtml: html.slice(blockStart, blockEnd),
        startIndex: blockStart,
        endIndex: blockEnd,
      };
    }
  }

  return null;
}

// ─── Helper: Find the start of the containing element ──────────────────────────
function findContainingElementStart(html: string, index: number): number {
  // Walk backwards to find the nearest opening tag
  let i = index;
  while (i > 0 && html[i] !== ">") i--;
  // Now find the start of this tag
  while (i > 0 && html[i] !== "<") i--;
  return i;
}

function findContainingElementEnd(html: string, index: number): number {
  // Walk forward to find the nearest closing tag
  let i = index;
  while (i < html.length && html[i] !== "<") i++;
  // Find the end of this closing tag
  while (i < html.length && html[i] !== ">") i++;
  return i + 1;
}

// ─── Main Replacement Function ─────────────────────────────────────────────────
export function replaceFieldValue(
  deployedHtml: Record<string, string>,
  currentValue: string,
  newValue: string,
  options?: {
    field?: string;
    city?: string;
    state?: string;
    zip?: string;
  },
): ReplacementResult {
  const warnings: string[] = [];
  const updatedFiles: Record<string, string> = {};
  const editedFiles: string[] = [];
  let changesCount = 0;
  let matchMethod: ReplacementResult["matchMethod"] = "exact";

  const isAddressField = options?.field?.includes("address") || options?.field?.includes("city") || options?.field?.includes("state") || options?.field?.includes("zip");

  for (const [file, html] of Object.entries(deployedHtml)) {
    if (!html) continue;
    let updatedHtml = html;
    let fileChanged = false;

    // Strategy 1: Exact match (fastest, most reliable)
    if (html.includes(currentValue)) {
      const occurrences = html.split(currentValue).length - 1;
      updatedHtml = html.split(currentValue).join(newValue);
      changesCount += occurrences;
      fileChanged = true;
      matchMethod = "exact";
    }
    // Strategy 2: Fuzzy match
    else {
      const match = findValueInHtml(html, currentValue);
      if (match) {
        updatedHtml = html.slice(0, match.startIndex) + newValue + html.slice(match.endIndex);
        changesCount += 1;
        fileChanged = true;
        matchMethod = match.method as ReplacementResult["matchMethod"];
        warnings.push(`Used ${match.method} matching in ${file} (original: "${match.matchedText.slice(0, 60)}")`);
      }
      // Strategy 3: Composite address block (for address fields)
      else if (isAddressField && options?.city) {
        const block = findAddressBlock(html, currentValue, options.city, options.state, options.zip);
        if (block) {
          // Replace just the street portion within the block
          const updatedBlock = block.blockHtml.replace(
            new RegExp(escapeRegex(currentValue), "i"),
            newValue,
          );
          if (updatedBlock !== block.blockHtml) {
            updatedHtml = html.slice(0, block.startIndex) + updatedBlock + html.slice(block.endIndex);
            changesCount += 1;
            fileChanged = true;
            matchMethod = "composite";
            warnings.push(`Used composite address matching in ${file}`);
          }
        }
      }
    }

    if (fileChanged) {
      updatedFiles[file] = updatedHtml;
      editedFiles.push(file);
    }
  }

  if (editedFiles.length === 0) {
    warnings.push(`Could not find "${currentValue.slice(0, 60)}" in any deployed page using any matching strategy.`);
  }

  return {
    success: editedFiles.length > 0,
    editedFiles,
    changesCount,
    updatedFiles,
    matchMethod,
    warnings,
  };
}

// ─── Fast-Path Router ──────────────────────────────────────────────────────────
// Detects common structured field update patterns without needing an AI call.
export function detectFastPathField(instruction: string): { field: string; newValue: string } | null {
  const patterns: Array<{ regex: RegExp; field: string; valueGroup: number }> = [
    // Address patterns
    { regex: /(?:change|update|set|replace)\s+(?:the\s+)?(?:business\s+)?address\s+(?:to|with|as)\s+["']?(.+?)["']?\s*$/i, field: "business_address", valueGroup: 1 },
    { regex: /(?:new|updated?)\s+address\s*[:=]\s*["']?(.+?)["']?\s*$/i, field: "business_address", valueGroup: 1 },
    // Phone patterns
    { regex: /(?:change|update|set|replace)\s+(?:the\s+)?(?:business\s+)?(?:phone|number|telephone)\s+(?:to|with|as)\s+["']?(.+?)["']?\s*$/i, field: "business_phone", valueGroup: 1 },
    { regex: /(?:new|updated?)\s+(?:phone|number)\s*[:=]\s*["']?(.+?)["']?\s*$/i, field: "business_phone", valueGroup: 1 },
    // Email patterns
    { regex: /(?:change|update|set|replace)\s+(?:the\s+)?(?:business\s+)?email\s+(?:to|with|as)\s+["']?(.+?)["']?\s*$/i, field: "business_email", valueGroup: 1 },
    // Business name patterns
    { regex: /(?:change|update|set|replace)\s+(?:the\s+)?(?:business\s+)?name\s+(?:to|with|as)\s+["']?(.+?)["']?\s*$/i, field: "business_name", valueGroup: 1 },
    // Hours patterns
    { regex: /(?:change|update|set|replace)\s+(?:the\s+)?(?:business\s+)?hours?\s+(?:to|with|as)\s+["']?(.+?)["']?\s*$/i, field: "business_hours", valueGroup: 1 },
  ];

  for (const { regex, field, valueGroup } of patterns) {
    const match = instruction.match(regex);
    if (match && match[valueGroup]) {
      return { field, newValue: match[valueGroup].trim() };
    }
  }

  return null;
}

// ─── Utility: Escape regex special characters ──────────────────────────────────
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
