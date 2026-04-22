import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Lock, Plus, Sparkles, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { IntakeData } from "./types";

interface Props {
  data: IntakeData;
  onChange: (updates: Partial<IntakeData>) => void;
}

const STANDARD_PAGES = ["Home", "About", "Services", "Contact"];

const SPECIAL_FEATURES = [
  "Contact form",
  "Booking / appointment button",
  "Online menu",
  "Photo gallery page",
  "FAQ section",
  "Google Maps embed",
  "WhatsApp chat button",
  "Instagram feed embed",
];

const ADDON_PAGES = [
  {
    key: "blog_addon_requested" as const,
    label: "Blog / News",
    note: "Add-on service — we'll discuss this separately",
  },
  {
    key: "booking_addon_requested" as const,
    label: "Online Booking",
    note: "Add-on service — we'll discuss this separately",
  },
];

export function StepPages({ data, onChange }: Props) {
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null);
  const pages = data.custom_pages || [];
  const features = data.special_features || [];

  const addPage = () => {
    if (pages.length >= 5) return;
    onChange({ custom_pages: [...pages, { name: "", description: "" }] });
  };
  const updatePage = (idx: number, field: string, value: string) => {
    const updated = [...pages];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange({ custom_pages: updated });
  };
  const removePage = (idx: number) => {
    onChange({ custom_pages: pages.filter((_, i) => i !== idx) });
  };

  const toggleFeature = (feature: string) => {
    if (features.includes(feature)) {
      onChange({ special_features: features.filter((f) => f !== feature) });
    } else {
      onChange({ special_features: [...features, feature] });
    }
  };

  const generatePageContent = async (idx: number) => {
    setGeneratingIdx(idx);
    try {
      const page = pages[idx];
      const { data: result, error } = await supabase.functions.invoke("generate-intake-content", {
        body: {
          type: "page",
          inputs: { page_name: page.name, description: page.description, business_name: data.business_name },
        },
      });
      if (error) throw error;
      updatePage(idx, "content_generated", result.content);
      toast.success("Content generated!");
    } catch {
      toast.error("Generation failed. Try again.");
    } finally {
      setGeneratingIdx(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold mb-1">Your Pages</h2>
        <p className="text-sm text-muted-foreground">Every website includes Home, About, Services, and Contact pages. Add any extra pages your business needs below.</p>
      </div>

      <div className="space-y-3">
        <Label className="text-base font-semibold">Standard Pages (always included)</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STANDARD_PAGES.map((page) => (
            <div key={page} className="border rounded-lg p-3 text-center bg-secondary/30">
              <Lock className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <p className="text-sm font-medium">{page}</p>
              <p className="text-xs text-muted-foreground">Included</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <Label className="text-base font-semibold">Custom Pages</Label>
        {pages.map((page, i) => (
          <div key={i} className="border rounded-lg p-4 space-y-3 relative">
            <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6" onClick={() => removePage(i)}>
              <X className="h-4 w-4" />
            </Button>
            <div>
              <Label className="text-sm">Page Name</Label>
              <Input value={page.name} onChange={(e) => updatePage(i, "name", e.target.value)} placeholder="e.g. Gallery, FAQ, Blog, Menu" />
            </div>
            <div>
              <Label className="text-sm">What do you want on this page?</Label>
              <Textarea value={page.description} onChange={(e) => updatePage(i, "description", e.target.value.slice(0, 500))} maxLength={500} rows={3} />
              <p className="text-xs text-muted-foreground text-right">{(page.description || "").length}/500</p>
            </div>
            {page.name && page.description && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => generatePageContent(i)} disabled={generatingIdx === i}>
                {generatingIdx === i ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate page content with AI
              </Button>
            )}
            {page.content_generated && (
              <div>
                <Label className="text-sm">AI-Generated Content</Label>
                <Textarea value={page.content_generated} onChange={(e) => updatePage(i, "content_generated", e.target.value)} rows={4} />
              </div>
            )}
          </div>
        ))}
        {pages.length < 5 && (
          <Button variant="outline" className="gap-2" onClick={addPage}>
            <Plus className="h-4 w-4" /> Add Custom Page
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <Label className="text-base font-semibold">Special Features</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SPECIAL_FEATURES.map((feature) => (
            <div key={feature} className="flex items-center gap-2">
              <Checkbox checked={features.includes(feature)} onCheckedChange={() => toggleFeature(feature)} />
              <span className="text-sm">{feature}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
