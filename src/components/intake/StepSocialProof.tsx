import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Upload, X } from "lucide-react";
import type { IntakeData } from "./types";

interface Props {
  data: IntakeData;
  onChange: (updates: Partial<IntakeData>) => void;
  onUpload: (file: File, category: string) => Promise<string | null>;
  onUploadMultiple: (files: File[], category: string) => Promise<string[]>;
}

export function StepSocialProof({ data, onChange, onUpload, onUploadMultiple }: Props) {
  const testimonials = data.testimonials || [];

  const addTestimonial = () => {
    if (testimonials.length >= 3) return;
    onChange({ testimonials: [...testimonials, { name: "", text: "" }] });
  };
  const updateTestimonial = (idx: number, field: string, value: string) => {
    const updated = [...testimonials];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange({ testimonials: updated });
  };
  const removeTestimonial = (idx: number) => {
    onChange({ testimonials: testimonials.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold mb-1">Social Proof</h2>
        <p className="text-sm text-muted-foreground">Reviews and testimonials are your most powerful sales tool. Let's show them off.</p>
      </div>

      <div className="space-y-4">
        <Label className="text-base font-semibold">Google Reviews</Label>
        <div>
          <Label className="text-sm">Google Business Profile URL</Label>
          <p className="text-xs text-muted-foreground mb-1">Find your link by searching your business name on Google Maps</p>
          <Input value={data.google_business_url || ""} onChange={(e) => onChange({ google_business_url: e.target.value })} placeholder="https://maps.google.com/..." />
        </div>
      </div>

      <div className="space-y-4">
        <Label className="text-base font-semibold">Written Testimonials</Label>
        {testimonials.map((t, i) => (
          <div key={i} className="border rounded-lg p-4 space-y-3 relative">
            <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6" onClick={() => removeTestimonial(i)}>
              <X className="h-4 w-4" />
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-sm">Customer Name *</Label><Input value={t.name} onChange={(e) => updateTestimonial(i, "name", e.target.value)} /></div>
              <div><Label className="text-sm">Title/Description</Label><Input value={t.title || ""} onChange={(e) => updateTestimonial(i, "title", e.target.value)} placeholder="e.g. Homeowner in Phoenix" /></div>
            </div>
            <div>
              <Label className="text-sm">Testimonial *</Label>
              <Textarea value={t.text} onChange={(e) => updateTestimonial(i, "text", e.target.value.slice(0, 300))} maxLength={300} rows={2} />
              <p className="text-xs text-muted-foreground text-right">{(t.text || "").length}/300</p>
            </div>
          </div>
        ))}
        {testimonials.length < 3 && (
          <Button variant="outline" size="sm" className="gap-2" onClick={addTestimonial}>
            <Plus className="h-4 w-4" /> Add Testimonial
          </Button>
        )}
        <div className="flex items-center gap-2">
          <Checkbox checked={data.no_testimonials || false} onCheckedChange={(v) => onChange({ no_testimonials: !!v })} />
          <span className="text-sm">I don't have testimonials yet — add a placeholder section</span>
        </div>
      </div>

      <div className="space-y-4">
        <Label className="text-base font-semibold">Awards, Certifications, or Press</Label>
        <Textarea value={data.awards_text || ""} onChange={(e) => onChange({ awards_text: e.target.value })} rows={3} placeholder="List any awards, certifications, licenses, or press mentions..." />
        <div className="space-y-2">
          <Label className="text-sm">Award/Certification Logos</Label>
          <div className="flex flex-wrap gap-2">
            {(data.award_logos || []).map((url, i) => (
              <div key={i} className="relative group">
                <img src={url} alt="" className="h-12 object-contain rounded border p-1" />
                <button
                  onClick={() => onChange({ award_logos: (data.award_logos || []).filter((_, idx) => idx !== i) })}
                  className="absolute -top-1 -right-1 bg-background rounded-full shadow opacity-0 group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1" onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*";
              input.multiple = true;
              input.onchange = async (e) => {
                const files = Array.from((e.target as HTMLInputElement).files || []);
                const urls = await onUploadMultiple(files, "awards");
                onChange({ award_logos: [...(data.award_logos || []), ...urls] });
              };
              input.click();
            }}>
              <Upload className="h-4 w-4" /> Upload
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
