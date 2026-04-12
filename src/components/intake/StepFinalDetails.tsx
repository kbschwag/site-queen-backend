import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { IntakeData } from "./types";

interface Props {
  data: IntakeData;
  onChange: (updates: Partial<IntakeData>) => void;
}

const FINAL_FEATURES = [
  "Live chat widget",
  "Cookie consent banner",
  "Multiple languages",
  "Blog section",
  "Popup / announcement bar",
  "Sticky header",
  "Smooth scroll animations",
  "Back to top button",
];

const FINAL_CHECKLIST = [
  "Make the phone number click-to-call on mobile",
  "Add a WhatsApp button",
  "Make sure the site loads fast — speed matters",
  "Make sure the site looks great on phones",
  "Add social media links in the footer",
  "Add a Google Maps link to my address",
  "Set up basic SEO",
  "Connect my Google Analytics if I have it",
];

export function StepFinalDetails({ data, onChange }: Props) {
  const features = data.final_features || [];
  const checklist = data.final_checklist || [];

  const toggleFeature = (item: string) => {
    if (features.includes(item)) {
      onChange({ final_features: features.filter((f) => f !== item) });
    } else {
      onChange({ final_features: [...features, item] });
    }
  };

  const toggleChecklist = (item: string) => {
    if (checklist.includes(item)) {
      onChange({ final_checklist: checklist.filter((c) => c !== item) });
    } else {
      onChange({ final_checklist: [...checklist, item] });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold mb-1">Final Details</h2>
        <p className="text-sm text-muted-foreground">Almost done! Just a few finishing touches.</p>
      </div>

      <div className="space-y-3">
        <Label className="text-base font-semibold">Special Features</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FINAL_FEATURES.map((f) => (
            <div key={f} className="flex items-center gap-2">
              <Checkbox checked={features.includes(f)} onCheckedChange={() => toggleFeature(f)} />
              <span className="text-sm">{f}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-base font-semibold">Common Requests</Label>
        <div className="space-y-2">
          {FINAL_CHECKLIST.map((item) => (
            <div key={item} className="flex items-center gap-2">
              <Checkbox checked={checklist.includes(item)} onCheckedChange={() => toggleChecklist(item)} />
              <span className="text-sm">{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-base font-semibold">Final Notes</Label>
        <p className="text-xs text-muted-foreground mb-2">Anything else you want us to know? Special requests, things to avoid, important details.</p>
        <Textarea
          value={data.final_notes || ""}
          onChange={(e) => onChange({ final_notes: e.target.value.slice(0, 1000) })}
          maxLength={1000}
          rows={5}
          placeholder="Type anything else here..."
        />
        <p className="text-xs text-muted-foreground text-right">{(data.final_notes || "").length}/1000</p>
      </div>
    </div>
  );
}
