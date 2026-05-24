// ============================================================================
// Canonical brand-color application.
//
// This module is the ONLY place in the codebase that mutates :root CSS
// variables for the purpose of applying brand colors. Every generator calls
// `applyBrandColors` exactly once per page. There are no template-specific
// branches, no per-page branches, no fallback append logic.
//
// Rules (do not relax):
//   1. If both brand colors are null/missing, the input :root is returned
//      UNCHANGED. Template defaults always win in that case.
//   2. The function NEVER adds a CSS variable that wasn't in the input.
//   3. The function NEVER modifies a CSS variable that isn't in the active
//      template's `roles` list. Structural variables (template-defined
//      neutrals, surfaces, borders, font tokens, etc.) are permanent.
//   4. A brand color is only placed on a role when its HSL fits the role's
//      lightness/saturation bounds. Otherwise it is skipped, and the
//      template default for that role is preserved.
//   5. Same function, same inputs → same output on every page.
// ============================================================================

export interface BrandColors {
  primary: string | null;
  accent: string | null;
}

export interface ColorRole {
  name: string;
  cssVar: string;
  lightnessRange: [number, number];
  minSaturation?: number;
  maxSaturation?: number;
  priority: number;
}

export interface TemplateColorRegistry {
  templateId: string;
  surfaces: { light: string; dark: string };
  roles: ColorRole[];
}

export interface ColorPlacement {
  brandSlot: "primary" | "accent";
  cssVar: string;
  color: string;
  role: string;
}

export interface SkippedBrandColor {
  brandSlot: "primary" | "accent";
  color: string;
  reason: string;
}

export interface ColorApplicationResult {
  appliedPlacements: ColorPlacement[];
  skippedBrandColors: SkippedBrandColor[];
  modifiedRootBlock: string;
}

// ─── Template registries ──────────────────────────────────────────────────

export const TEMPLATE_REGISTRIES: Record<string, TemplateColorRegistry> = {
  "warm-welcome": {
    templateId: "warm-welcome",
    surfaces: { light: "#f7f2ea", dark: "#20110e" },
    roles: [
      { name: "accent",             cssVar: "--gold",    lightnessRange: [35, 70], minSaturation: 25, priority: 1 },
      { name: "dark-surface-alt",   cssVar: "--dark-2",  lightnessRange: [0, 25],                       priority: 5 },
      { name: "light-surface-alt",  cssVar: "--cream-2", lightnessRange: [80, 100],                     priority: 6 },
    ],
  },
  "business-professional": {
    templateId: "business-professional",
    surfaces: { light: "#f1ece4", dark: "#0b1a31" },
    roles: [
      { name: "accent",        cssVar: "--gold",      lightnessRange: [40, 70], minSaturation: 30, priority: 1 },
      { name: "accent-dark",   cssVar: "--gold-dark", lightnessRange: [25, 50], minSaturation: 25, priority: 2 },
      { name: "dark-surface",  cssVar: "--navy-mid",  lightnessRange: [0, 25],                     priority: 5 },
    ],
  },
  "feminine-bold": {
    templateId: "feminine-bold",
    surfaces: { light: "#fcf8f2", dark: "#170f0d" },
    roles: [
      { name: "accent",        cssVar: "--gold",          lightnessRange: [40, 70], minSaturation: 30, priority: 1 },
      { name: "primary-brand", cssVar: "--burgundy",      lightnessRange: [10, 40], minSaturation: 20, priority: 2 },
      { name: "primary-deep",  cssVar: "--dark-burgundy", lightnessRange: [5, 25],  minSaturation: 15, priority: 3 },
    ],
  },
  "local-favorite": {
    templateId: "local-favorite",
    surfaces: { light: "#fcf3e6", dark: "#21100c" },
    roles: [
      { name: "primary-brand", cssVar: "--red",  lightnessRange: [25, 65], minSaturation: 40, priority: 1 },
      { name: "accent",        cssVar: "--gold", lightnessRange: [40, 70], minSaturation: 30, priority: 2 },
    ],
  },
  "trades-hero": {
    templateId: "trades-hero",
    surfaces: { light: "#ffffff", dark: "#0d1d3b" },
    roles: [
      { name: "primary-brand", cssVar: "--red",  lightnessRange: [25, 60], minSaturation: 40, priority: 1 },
      { name: "accent",        cssVar: "--gold", lightnessRange: [40, 70], minSaturation: 30, priority: 2 },
    ],
  },
};

// ─── Color utilities ──────────────────────────────────────────────────────

interface HSL { h: number; s: number; l: number }

function normalizeHex(input: string): string | null {
  let raw = input.trim();
  if (!raw) return null;
  if (raw.startsWith("#")) raw = raw.slice(1);
  if (!/^[0-9a-fA-F]+$/.test(raw)) return null;
  if (raw.length === 3) raw = raw.split("").map(c => c + c).join("");
  if (raw.length !== 6) return null;
  return "#" + raw.toLowerCase();
}

function hexToHSL(hex: string): HSL | null {
  const norm = normalizeHex(hex);
  if (!norm) return null;
  const r = parseInt(norm.slice(1, 3), 16) / 255;
  const g = parseInt(norm.slice(3, 5), 16) / 255;
  const b = parseInt(norm.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function fits(hsl: HSL, role: ColorRole): boolean {
  if (hsl.l < role.lightnessRange[0] || hsl.l > role.lightnessRange[1]) return false;
  if (role.minSaturation !== undefined && hsl.s < role.minSaturation) return false;
  if (role.maxSaturation !== undefined && hsl.s > role.maxSaturation) return false;
  return true;
}

// ─── Root-block helpers ───────────────────────────────────────────────────

const ROOT_BLOCK_RE = /:root\s*\{([\s\S]*?)\}/;

export function extractRootBlock(html: string): { match: string; body: string } | null {
  const m = html.match(ROOT_BLOCK_RE);
  if (!m) return null;
  return { match: m[0], body: m[1] };
}

export function replaceRootBlock(html: string, newBody: string): string {
  return html.replace(ROOT_BLOCK_RE, `:root {${newBody}}`);
}

function listCssVarNames(body: string): string[] {
  const names: string[] = [];
  const re = /(--[a-zA-Z0-9_-]+)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) names.push(m[1]);
  return names;
}

function replaceCssVar(body: string, cssVar: string, value: string): { body: string; replaced: boolean } {
  const re = new RegExp(`(${cssVar.replace(/-/g, "\\-")}\\s*:\\s*)([^;]+)(;)`);
  if (!re.test(body)) return { body, replaced: false };
  return { body: body.replace(re, `$1${value}$3`), replaced: true };
}

// ─── Main API ─────────────────────────────────────────────────────────────

export function applyBrandColors(
  rootBlock: string,
  brand: BrandColors,
  templateId: string,
): ColorApplicationResult {
  const primary = brand.primary?.trim() || null;
  const accent = brand.accent?.trim() || null;

  // Rule 1: both null → no-op.
  if (!primary && !accent) {
    return { appliedPlacements: [], skippedBrandColors: [], modifiedRootBlock: rootBlock };
  }

  const registry = TEMPLATE_REGISTRIES[templateId];
  if (!registry) {
    return {
      appliedPlacements: [],
      skippedBrandColors: [
        ...(primary ? [{ brandSlot: "primary" as const, color: primary, reason: "no-registry-for-template" }] : []),
        ...(accent ? [{ brandSlot: "accent" as const, color: accent, reason: "no-registry-for-template" }] : []),
      ],
      modifiedRootBlock: rootBlock,
    };
  }

  const inputVarNames = new Set(listCssVarNames(rootBlock));
  const filledRoles = new Set<string>();
  const appliedPlacements: ColorPlacement[] = [];
  const skippedBrandColors: SkippedBrandColor[] = [];

  const brandInputs: Array<{ slot: "primary" | "accent"; color: string }> = [];
  if (primary) brandInputs.push({ slot: "primary", color: primary });
  if (accent)  brandInputs.push({ slot: "accent",  color: accent });

  const sortedRoles = [...registry.roles].sort((a, b) => a.priority - b.priority);
  let working = rootBlock;

  for (const { slot, color } of brandInputs) {
    const hsl = hexToHSL(color);
    if (!hsl) {
      skippedBrandColors.push({ brandSlot: slot, color, reason: "invalid-color" });
      continue;
    }

    let placed = false;
    for (const role of sortedRoles) {
      if (filledRoles.has(role.cssVar)) continue;
      if (!inputVarNames.has(role.cssVar)) continue; // Rule 2/3: only existing vars
      if (!fits(hsl, role)) continue;

      const { body: nextBody, replaced } = replaceCssVar(working, role.cssVar, normalizeHex(color) || color);
      if (!replaced) continue;
      working = nextBody;
      filledRoles.add(role.cssVar);
      appliedPlacements.push({ brandSlot: slot, cssVar: role.cssVar, color: normalizeHex(color) || color, role: role.name });
      placed = true;
      break;
    }
    if (!placed) {
      skippedBrandColors.push({ brandSlot: slot, color, reason: "no-matching-role" });
    }
  }

  // Rule verification: same variable names in, same out (no adds/removes).
  const outputVarNames = new Set(listCssVarNames(working));
  if (outputVarNames.size !== inputVarNames.size ||
      [...inputVarNames].some(n => !outputVarNames.has(n))) {
    console.error("[color-system] verification failed — variable set drift; returning input unchanged", {
      templateId, input: [...inputVarNames], output: [...outputVarNames],
    });
    return {
      appliedPlacements: [],
      skippedBrandColors: [
        ...(primary ? [{ brandSlot: "primary" as const, color: primary, reason: "verification-failed" }] : []),
        ...(accent ? [{ brandSlot: "accent" as const, color: accent, reason: "verification-failed" }] : []),
      ],
      modifiedRootBlock: rootBlock,
    };
  }

  return { appliedPlacements, skippedBrandColors, modifiedRootBlock: working };
}

// Convenience: apply to a full HTML page (extracts :root, applies, replaces).
export function applyBrandColorsToHTML(
  html: string,
  brand: BrandColors,
  templateId: string,
): { html: string; result: ColorApplicationResult } {
  const extracted = extractRootBlock(html);
  if (!extracted) {
    return {
      html,
      result: {
        appliedPlacements: [],
        skippedBrandColors: [],
        modifiedRootBlock: "",
      },
    };
  }
  const result = applyBrandColors(extracted.body, brand, templateId);
  const newHtml = result.modifiedRootBlock === extracted.body
    ? html
    : replaceRootBlock(html, result.modifiedRootBlock);
  return { html: newHtml, result };
}

// Diagnostic logger — single source of structured log output for color application.
// Logs to console (queryable via edge function logs) keyed by "[color-system]".
export function logColorApplication(args: {
  clientId: string;
  templateId: string;
  brandColors: BrandColors;
  appliedPlacements: ColorPlacement[];
  skippedBrandColors: SkippedBrandColor[];
  pagesGenerated: string[];
}): void {
  console.log("[color-system] " + JSON.stringify({
    kind: "color-application",
    client_id: args.clientId,
    template_id: args.templateId,
    brand_colors: args.brandColors,
    applied_placements: args.appliedPlacements,
    skipped_brand_colors: args.skippedBrandColors,
    pages_generated: args.pagesGenerated,
  }));
}
