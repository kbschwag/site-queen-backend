import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Sparkles, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { IntakeData } from "./types";

interface Props {
  data: IntakeData;
  onChange: (updates: Partial<IntakeData>) => void;
  onUpload: (file: File, category: string) => Promise<string | null>;
}

export function StepServices({ data, onChange, onUpload }: Props) {
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null);
  const [generatingIntro, setGeneratingIntro] = useState(false);
  const services = data.services || [];

  const addService = () => {
    if (services.length >= 20) return;
    onChange({ services: [...services, { name: "", description: "", price_type: "call" }] });
  };

  const updateService = (idx: number, field: string, value: any) => {
    const updated = [...services];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange({ services: updated });
  };

  const removeService = (idx: number) => {
    onChange({ services: services.filter((_, i) => i !== idx) });
  };

  const generateDescription = async (idx: number) => {
    setGeneratingIdx(idx);
    try {
      const svc = services[idx];
      const { data: result, error } = await supabase.functions.invoke("generate-intake-content", {
        body: {
          type: "service",
          inputs: { name: svc.name, description: svc.description, business_name: data.business_name },
        },
      });
      if (error) throw error;
      updateService(idx, "description_generated", result.content);
      toast.success("Description generated!");
    } catch {
      toast.error("Generation failed. Try again.");
    } finally {
      setGeneratingIdx(null);
    }
  };

  const generateIntro = async () => {
    setGeneratingIntro(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("generate-intake-content", {
        body: {
          type: "services_intro",
          inputs: { services: services.map((s) => s.name).join(", "), business_name: data.business_name },
        },
      });
      if (error) throw error;
      onChange({ services_intro_generated: result.content });
      toast.success("Intro generated!");
    } catch {
      toast.error("Generation failed. Try again.");
    } finally {
      setGeneratingIntro(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold mb-1">Your Services</h2>
        <p className="text-sm text-muted-foreground">What do you offer? Be as specific as possible — this is what helps customers decide to contact you.</p>
      </div>

      {services.map((svc, i) => (
        <div key={i} className="border rounded-lg p-4 space-y-3 relative">
          <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6" onClick={() => removeService(i)}>
            <X className="h-4 w-4" />
          </Button>
          <div className="font-medium text-sm text-muted-foreground">Service {i + 1}</div>
          <div>
            <Label className="text-sm">Service Name *</Label>
            <Input value={svc.name} onChange={(e) => updateService(i, "name", e.target.value)} placeholder="e.g. Deep Cleaning" />
          </div>
          <div>
            <Label className="text-sm">Short Description</Label>
            <Textarea value={svc.description} onChange={(e) => updateService(i, "description", e.target.value.slice(0, 200))} maxLength={200} rows={2} placeholder="What is this service and who is it for?" />
            <p className="text-xs text-muted-foreground text-right">{(svc.description || "").length}/200</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Pricing</Label>
              <Select value={svc.price_type || "call"} onValueChange={(v) => updateService(i, "price_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="exact">Exact price</SelectItem>
                  <SelectItem value="range">Price range</SelectItem>
                  <SelectItem value="starting">Starting from</SelectItem>
                  <SelectItem value="call">Call for pricing</SelectItem>
                  <SelectItem value="free">Free consultation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {svc.price_type && !["call", "free"].includes(svc.price_type) && (
              <div>
                <Label className="text-sm">Price</Label>
                <Input value={svc.price_value || ""} onChange={(e) => updateService(i, "price_value", e.target.value)} placeholder="e.g. $50 or $50-$100" />
              </div>
            )}
          </div>
          {svc.name && svc.description && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => generateDescription(i)} disabled={generatingIdx === i}>
              {generatingIdx === i ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate description with AI
            </Button>
          )}
          {svc.description_generated && (
            <div>
              <Label className="text-sm">AI-Generated Description</Label>
              <Textarea value={svc.description_generated} onChange={(e) => updateService(i, "description_generated", e.target.value)} rows={3} />
            </div>
          )}
        </div>
      ))}

      <div className="flex gap-3">
        {services.length < 20 && (
          <Button variant="outline" className="gap-2" onClick={addService}>
            <Plus className="h-4 w-4" /> Add Service
          </Button>
        )}
      </div>

      {services.length > 0 && services.some((s) => s.name) && (
        <Button onClick={generateIntro} disabled={generatingIntro} className="gap-2">
          {generatingIntro ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Generate a services intro paragraph with AI ♛
        </Button>
      )}

      {data.services_intro_generated && (
        <div>
          <Label className="text-sm">Services Intro Paragraph</Label>
          <Textarea value={data.services_intro_generated} onChange={(e) => onChange({ services_intro_generated: e.target.value })} rows={3} />
        </div>
      )}

      {services.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">Add at least one service to continue.</p>
      )}
    </div>
  );
}
