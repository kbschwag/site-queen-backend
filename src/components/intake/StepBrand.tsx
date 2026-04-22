import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
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

const FONT_OPTIONS = [
  { id: "Oswald", label: "Oswald — bold and strong", googleFamily: "Oswald" },
  { id: "Montserrat", label: "Montserrat — clean and modern", googleFamily: "Montserrat" },
  { id: "Raleway", label: "Raleway — elegant and professional", googleFamily: "Raleway" },
  { id: "Poppins", label: "Poppins — friendly and rounded", googleFamily: "Poppins" },
  { id: "Playfair Display", label: "Playfair Display — luxury and editorial", googleFamily: "Playfair+Display" },
  { id: "Nunito", label: "Nunito — warm and approachable", googleFamily: "Nunito" },
  { id: "Bebas Neue", label: "Bebas Neue — bold trades style", googleFamily: "Bebas+Neue" },
  { id: "Cormorant", label: "Cormorant — high end and refined", googleFamily: "Cormorant" },
  { id: "Inter", label: "Inter — clean and minimal", googleFamily: "Inter" },
  { id: "Lato", label: "Lato — versatile and professional", googleFamily: "Lato" },
];

const isValidHex = (v: string) => /^#?([0-9a-fA-F]{3}){1,2}$/.test(v.trim());
const normalizeHex = (v: string) => {
  const t = v.trim();
  if (!t) return "";
  return t.startsWith("#") ? t : `#${t}`;
};

function ColorPickerInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value?: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const swatchValue = value && isValidHex(value) ? normalizeHex(value) : "#000000";
  return (
    <div>
      <Label className="text-sm">{label}</Label>
      <div className="flex gap-2 mt-1">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={swatchValue}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 rounded border cursor-pointer bg-background"
        />
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && isValidHex(v)) onChange(normalizeHex(v));
          }}
          placeholder={placeholder}
          className="font-mono"
        />
      </div>
    </div>
  );
}

export function StepBrand({ data, onChange, onUpload, uploading, plan }: Props) {
  const fontMode = data.font_choice_mode || "auto";
  const [uploadingFont, setUploadingFont] = useState(false);

  // Lazy-load Google Fonts for the live preview list
  useEffect(() => {
    const id = "intake-google-fonts-preview";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?" +
      FONT_OPTIONS.map((f) => `family=${f.googleFamily}:wght@400;700`).join("&") +
      "&display=swap";
    document.head.appendChild(link);
  }, []);

  const handleLogoUpload = async (file: File, type: "logo_url" | "logo_dark_url" | "logo_white_url") => {
    const url = await onUpload(file, "logos");
    if (url) onChange({ [type]: url });
  };

  const handleFontUpload = async (file: File) => {
    const allowed = [".ttf", ".otf", ".woff", ".woff2"];
    const lower = file.name.toLowerCase();
    if (!allowed.some((ext) => lower.endsWith(ext))) {
      toast.error("Please upload a .ttf, .otf, .woff, or .woff2 font file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Font file must be under 5MB");
      return;
    }
    setUploadingFont(true);
    try {
      const url = await onUpload(file, "fonts");
      if (url) {
        onChange({ custom_font_url: url, custom_font_name: data.custom_font_name || file.name });
        toast.success("Font uploaded");
      }
    } finally {
      setUploadingFont(false);
    }
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
        {data.no_logo && plan !== "pro" && (
          <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-2">
            <p className="text-sm">
              No logo? No problem. We'll use your business name styled beautifully — or you can add a professional logo design.
            </p>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={data.logo_addon_requested || false}
                onCheckedChange={(v) => onChange({ logo_addon_requested: !!v })}
              />
              <span className="text-sm">
                <span className="font-semibold">Add a professional logo design — $75 one time ♛</span>
                <span className="block text-xs text-muted-foreground">
                  Our designer will create a polished logo before your website is built.
                </span>
              </span>
            </label>
          </div>
        )}
        {data.no_logo && plan === "pro" && (
          <p className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">
            Great news — logo design is included in your Pro plan. We'll create one for you. ♛
          </p>
        )}
      </div>

      {/* Brand Colors */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">Brand Colors</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorPickerInput
            label="Primary brand color"
            value={data.primary_color}
            placeholder="#000000"
            onChange={(v) => onChange({ primary_color: v })}
          />
          <ColorPickerInput
            label="Accent or secondary color (optional)"
            value={data.accent_color}
            placeholder="#000000"
            onChange={(v) => onChange({ accent_color: v })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Don't know your hex code? Use the color picker or paste it from your brand guidelines.
        </p>
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

      {/* Typography */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">Do you have a preferred font for your website?</Label>
        <p className="text-sm text-muted-foreground">Your heading font sets the personality of your entire site</p>

        <RadioGroup
          value={fontMode}
          onValueChange={(v) => onChange({ font_choice_mode: v as "auto" | "list" | "upload" })}
          className="space-y-2"
        >
          <label
            className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
              fontMode === "auto" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
            }`}
          >
            <RadioGroupItem value="auto" />
            <span className="font-medium">Let us choose — we'll pick something that suits your brand ♛</span>
          </label>

          <label
            className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
              fontMode === "list" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
            }`}
          >
            <RadioGroupItem value="list" />
            <span className="font-medium">I'd like to choose from popular options</span>
          </label>

          <label
            className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
              fontMode === "upload" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
            }`}
          >
            <RadioGroupItem value="upload" />
            <span className="font-medium">I have my own font file I'd like to use</span>
          </label>
        </RadioGroup>

        {fontMode === "list" && (
          <div className="space-y-3 pl-1">
            <Select
              value={data.preferred_font || ""}
              onValueChange={(v) => onChange({ preferred_font: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a font…" />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    <span style={{ fontFamily: `'${f.id}', sans-serif` }}>{f.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Live preview grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FONT_OPTIONS.map((f) => {
                const selected = data.preferred_font === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onChange({ preferred_font: f.id })}
                    className={`text-left rounded-lg border-2 p-3 transition-all ${
                      selected ? "border-primary ring-2 ring-primary/20 bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <p className="text-xl leading-tight" style={{ fontFamily: `'${f.id}', sans-serif` }}>
                      {f.id}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{f.label.split(" — ")[1]}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {fontMode === "upload" && (
          <div className="space-y-3 pl-1 rounded-lg border-2 border-dashed border-border p-4">
            <div>
              <Label className="text-sm">Font file</Label>
              {data.custom_font_url ? (
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm font-mono truncate">
                    {data.custom_font_name || "Uploaded font"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange({ custom_font_url: undefined })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 mt-1"
                  disabled={uploadingFont}
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = ".ttf,.otf,.woff,.woff2";
                    input.onchange = (e) => {
                      const f = (e.target as HTMLInputElement).files?.[0];
                      if (f) handleFontUpload(f);
                    };
                    input.click();
                  }}
                >
                  {uploadingFont ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload font (TTF, OTF, WOFF, WOFF2 — max 5MB)
                </Button>
              )}
            </div>
            <div>
              <Label className="text-sm">What is this font called?</Label>
              <Input
                value={data.custom_font_name || ""}
                onChange={(e) => onChange({ custom_font_name: e.target.value })}
                placeholder="e.g. Gotham, Brandon Grotesque"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Please only upload fonts you own or have a commercial license to use. Free Google Fonts are always a safe alternative.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
