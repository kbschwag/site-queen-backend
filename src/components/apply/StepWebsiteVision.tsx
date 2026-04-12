import { useState } from "react";
import { ApplicationFormData, WEBSITE_GOALS, BRAND_VIBES, LOGO_OPTIONS } from "./types";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Upload } from "lucide-react";

interface Props {
  form: ApplicationFormData;
  update: (field: string, value: any) => void;
}

export default function StepWebsiteVision({ form, update }: Props) {
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [inspirationPreviews, setInspirationPreviews] = useState<string[]>([]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      update("logo_file", file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleInspirationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    update("inspiration_files", [...form.inspiration_files, ...files]);
    setInspirationPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Your website vision</h2>
        <p className="text-muted-foreground">Let's get a feel for what your dream website looks like.</p>
      </div>

      {/* Q11 */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">What is the main goal of your new website? *</Label>
        <RadioGroup value={form.website_goal} onValueChange={(v) => update("website_goal", v)} className="space-y-2">
          {WEBSITE_GOALS.map((o) => (
            <label key={o.value} className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${form.website_goal === o.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
              <RadioGroupItem value={o.value} />
              <span className="font-medium">{o.label}</span>
            </label>
          ))}
        </RadioGroup>
      </div>

      {/* Q12 - Visual vibe cards */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Pick the vibe that feels most like your brand *</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {BRAND_VIBES.map((vibe) => (
            <button
              key={vibe.value}
              type="button"
              onClick={() => update("brand_vibe", vibe.value)}
              className={`relative rounded-xl border-2 overflow-hidden transition-all text-left ${
                form.brand_vibe === vibe.value
                  ? "border-primary ring-2 ring-primary/30 scale-[1.02]"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <div className={`h-24 bg-gradient-to-br ${vibe.color} flex items-center justify-center`}>
                <span className="text-4xl">{vibe.icon}</span>
              </div>
              <div className="p-4">
                <p className="font-semibold text-foreground">{vibe.label}</p>
                <p className="text-sm text-muted-foreground">{vibe.desc}</p>
              </div>
              {form.brand_vibe === vibe.value && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground text-xs">✓</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Q13 */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Do you have a logo? *</Label>
        <RadioGroup value={form.has_logo} onValueChange={(v) => update("has_logo", v)} className="space-y-2">
          {LOGO_OPTIONS.map((o) => (
            <label key={o.value} className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${form.has_logo === o.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
              <RadioGroupItem value={o.value} />
              <span className="font-medium">
                {o.label}
                {o.value === "want_one" && (
                  <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    Included in Pro plan ♛
                  </span>
                )}
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>

      {/* Q14 */}
      {form.has_logo === "yes" && (
        <div className="space-y-2">
          <Label className="text-base font-semibold">Upload your logo</Label>
          <p className="text-sm text-muted-foreground">Accepts PNG, JPG, or SVG</p>
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
            {logoPreview ? (
              <img src={logoPreview} alt="Logo preview" className="h-24 object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="w-8 h-8" />
                <span className="text-sm">Click to upload your logo</span>
              </div>
            )}
            <Input type="file" className="hidden" accept=".png,.jpg,.jpeg,.svg" onChange={handleLogoChange} />
          </label>
        </div>
      )}

      {/* Q15 */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Upload any inspiration or brand photos</Label>
        <p className="text-sm text-muted-foreground">Optional — share images that capture the look and feel you love</p>
        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Upload className="w-8 h-8" />
            <span className="text-sm">Click to upload photos</span>
          </div>
          <Input type="file" className="hidden" accept="image/*" multiple onChange={handleInspirationChange} />
        </label>
        {inspirationPreviews.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-2">
            {inspirationPreviews.map((src, i) => (
              <img key={i} src={src} alt={`Inspiration ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
