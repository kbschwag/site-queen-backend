import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, X } from "lucide-react";
import type { IntakeData } from "./types";

interface Props {
  data: IntakeData;
  onChange: (updates: Partial<IntakeData>) => void;
  onUpload: (file: File, category: string) => Promise<string | null>;
  uploading: Record<string, boolean>;
  plan: string;
}

const COLOR_PALETTES = [
  { id: "ocean", name: "Ocean Blues", colors: ["#1a5276", "#2980b9", "#aed6f1"] },
  { id: "forest", name: "Forest Greens", colors: ["#1e8449", "#27ae60", "#a9dfbf"] },
  { id: "neutrals", name: "Warm Neutrals", colors: ["#6e5b4b", "#c4a882", "#f5e6d3"] },
  { id: "purples", name: "Bold Purples", colors: ["#6c3483", "#a569bd", "#d7bde2"] },
  { id: "sunset", name: "Sunset Oranges", colors: ["#e74c3c", "#f39c12", "#fdebd0"] },
  { id: "blacks", name: "Classic Blacks", colors: ["#1c1c1c", "#555555", "#e5e5e5"] },
  { id: "rosegold", name: "Rose Golds", colors: ["#b76e79", "#e8c4c8", "#fdf2f0"] },
  { id: "navy", name: "Deep Navys", colors: ["#1b2631", "#2c3e50", "#d5d8dc"] },
];

const HEADING_FONTS = [
  { id: "classic-serif", name: "Classic Serif", example: "font-serif" },
  { id: "modern-sans", name: "Modern Sans", example: "font-sans" },
  { id: "bold-display", name: "Bold Display", example: "font-sans font-black" },
  { id: "elegant-script", name: "Elegant Script", example: "italic font-serif" },
  { id: "clean-minimal", name: "Clean Minimal", example: "font-sans font-light" },
  { id: "strong-geometric", name: "Strong Geometric", example: "font-mono font-bold" },
];

export function StepBrand({ data, onChange, onUpload, uploading, plan }: Props) {
  const logoRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (file: File, type: "logo_url" | "logo_dark_url" | "logo_white_url") => {
    const url = await onUpload(file, "logos");
    if (url) onChange({ [type]: url });
  };

  const inspirations = data.inspiration_sites || [{ url: "", notes: "" }, { url: "", notes: "" }, { url: "", notes: "" }];
  const updateInspiration = (idx: number, field: string, value: string) => {
    const updated = [...inspirations];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange({ inspiration_sites: updated });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold mb-1">Your Brand</h2>
        <p className="text-sm text-muted-foreground">Your brand is how your business looks and feels. Upload what you have and we'll take care of the rest.</p>
      </div>

      {/* Logo uploads */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">Logo</Label>
        {["logo_url", "logo_dark_url", "logo_white_url"].map((key, i) => {
          const labels = ["Primary Logo", "Dark Version (optional)", "White Version (optional)"];
          const url = (data as any)[key];
          return (
            <div key={key} className="space-y-2">
              <Label className="text-sm">{labels[i]}</Label>
              {url ? (
                <div className="flex items-center gap-3">
                  <img src={url} alt="" className="h-12 object-contain rounded border p-1 bg-secondary" />
                  <Button variant="ghost" size="sm" onClick={() => onChange({ [key]: undefined })}><X className="h-4 w-4" /></Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".png,.svg,.jpg,.jpeg";
                  input.onchange = (e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) handleLogoUpload(f, key as any);
                  };
                  input.click();
                }}>
                  <Upload className="h-4 w-4" /> Upload
                </Button>
              )}
            </div>
          );
        })}
        <div className="flex items-center gap-2">
          <Checkbox checked={data.no_logo || false} onCheckedChange={(v) => onChange({ no_logo: !!v })} />
          <span className="text-sm">I don't have a logo yet</span>
        </div>
        {data.no_logo && (
          <p className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">
            {plan === "pro"
              ? "Great news — logo design is included in your Pro plan. We'll create one for you. ♛"
              : "No logo? No problem. We'll use your business name styled beautifully."}
          </p>
        )}
      </div>

      {/* Brand Colors */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">Brand Colors</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm">Primary Color</Label>
            <div className="flex gap-2">
              <input type="color" value={data.primary_color || "#7B2D8E"} onChange={(e) => onChange({ primary_color: e.target.value })} className="h-10 w-12 rounded border cursor-pointer" />
              <Input value={data.primary_color || ""} onChange={(e) => onChange({ primary_color: e.target.value })} placeholder="#7B2D8E" className="font-mono" />
            </div>
          </div>
          <div>
            <Label className="text-sm">Secondary Color</Label>
            <div className="flex gap-2">
              <input type="color" value={data.secondary_color || "#E91E90"} onChange={(e) => onChange({ secondary_color: e.target.value })} className="h-10 w-12 rounded border cursor-pointer" />
              <Input value={data.secondary_color || ""} onChange={(e) => onChange({ secondary_color: e.target.value })} placeholder="#E91E90" className="font-mono" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox checked={data.help_choose_colors || false} onCheckedChange={(v) => onChange({ help_choose_colors: !!v })} />
          <span className="text-sm">I'm not sure — help me choose</span>
        </div>
        {data.help_choose_colors && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {COLOR_PALETTES.map((palette) => (
              <button
                key={palette.id}
                onClick={() => onChange({ color_palette: palette.id })}
                className={`rounded-lg border-2 p-3 text-center transition-all ${
                  data.color_palette === palette.id ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50"
                }`}
              >
                <div className="flex gap-1 mb-2 justify-center">
                  {palette.colors.map((c) => (
                    <div key={c} className="w-6 h-6 rounded-full" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <p className="text-xs font-medium">{palette.name}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Fonts */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">Font Preferences</Label>
        <Label className="text-sm">Heading Style</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {HEADING_FONTS.map((font) => (
            <button
              key={font.id}
              onClick={() => onChange({ heading_font: font.id })}
              className={`rounded-lg border-2 p-4 text-center transition-all ${
                data.heading_font === font.id ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50"
              }`}
            >
              <p className={`text-lg mb-1 ${font.example}`}>Heading</p>
              <p className="text-xs text-muted-foreground">{font.name}</p>
            </button>
          ))}
          <button
            onClick={() => onChange({ heading_font: "surprise" })}
            className={`rounded-lg border-2 p-4 text-center transition-all ${
              data.heading_font === "surprise" ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50"
            }`}
          >
            <p className="text-lg mb-1">✨</p>
            <p className="text-xs text-muted-foreground">Surprise Me</p>
          </button>
        </div>
        <div>
          <Label className="text-sm">Body Text Style</Label>
          <div className="flex gap-3 mt-1">
            {["Simple Readable", "Modern Clean", "Traditional"].map((style) => (
              <button
                key={style}
                onClick={() => onChange({ body_font: style.toLowerCase().replace(" ", "-") })}
                className={`rounded-lg border-2 px-4 py-2 text-sm transition-all ${
                  data.body_font === style.toLowerCase().replace(" ", "-")
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {style} {style === "Simple Readable" && <span className="text-xs text-muted-foreground">(recommended)</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Inspiration */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">Inspiration Websites</Label>
        {inspirations.slice(0, 3).map((ins, i) => (
          <div key={i} className="space-y-2">
            <Input
              placeholder={`Website URL #${i + 1}`}
              value={ins.url}
              onChange={(e) => updateInspiration(i, "url", e.target.value)}
            />
            <Input
              placeholder="What do you love about this site? (optional)"
              value={ins.notes}
              onChange={(e) => updateInspiration(i, "notes", e.target.value.slice(0, 200))}
              maxLength={200}
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Don't have any? No worries — skip this section</p>
      </div>
    </div>
  );
}
