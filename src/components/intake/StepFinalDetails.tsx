import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Crown, ImageIcon } from "lucide-react";
import type { IntakeData } from "./types";
import { countIntakePhotos } from "@/lib/photo-utils";

interface Props {
  data: IntakeData;
  onChange: (updates: Partial<IntakeData>) => void;
  onJumpToPhotos?: () => void;
  onAcceptStock?: () => void;
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

export function StepFinalDetails({ data, onChange, onJumpToPhotos, onAcceptStock }: Props) {
  const features = data.final_features || [];
  const checklist = data.final_checklist || [];
  const photoCount = countIntakePhotos(data);
  const hasNoPhotos = photoCount === 0;

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

      {/* Gentle no-photos reminder — only if zero photos uploaded */}
      {hasNoPhotos && (
        <div
          className="rounded-xl border-2 p-5 space-y-3"
          style={{ backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }}
        >
          <div className="flex items-start gap-2">
            <Crown className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "#92400E" }} />
            <h3 className="font-bold text-base" style={{ color: "#78350F" }}>
              One quick thing before you submit
            </h3>
          </div>
          <div className="space-y-2 text-sm leading-relaxed" style={{ color: "#78350F" }}>
            <p>
              We noticed you haven't uploaded any photos yet. Real photos of your
              business, your work, and your team make a huge difference in how your
              website looks and converts.
            </p>
            <p>Even a few good iPhone photos are better than stock imagery.</p>
            <p>
              If you have any photos handy please add them now — it only takes a
              minute and your website will be significantly better for it.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button
              type="button"
              onClick={onJumpToPhotos}
              className="gap-2 flex-1 text-white border-0"
              style={{ backgroundColor: "#F59E0B" }}
            >
              <ImageIcon className="h-4 w-4" /> Add photos now
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onAcceptStock}
              className="flex-1 bg-transparent"
              style={{ borderColor: "#F59E0B", color: "#78350F" }}
            >
              Continue without photos
            </Button>
          </div>
          {data.use_stock_photos && (
            <p className="text-xs italic" style={{ color: "#78350F" }}>
              ✓ You've chosen to continue with stock photography. You can still
              add photos before submitting if you change your mind.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
