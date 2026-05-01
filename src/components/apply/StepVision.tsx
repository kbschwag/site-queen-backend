import { ApplicationFormData, WEBSITE_GOALS, LOGO_OPTIONS, SUPPORT_LEVELS, RESTRICTED_NICHES, READINESS_OPTIONS } from "./types";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Crown } from "lucide-react";

interface Props {
  form: ApplicationFormData;
  update: (field: string, value: any) => void;
}

export default function StepVision({ form, update }: Props) {
  const toggleNiche = (niche: string, checked: boolean) => {
    let next = [...form.restricted_niches];
    if (niche === "None of the above") {
      next = checked ? ["None of the above"] : [];
    } else {
      if (checked) {
        next = next.filter((n) => n !== "None of the above");
        if (!next.includes(niche)) next.push(niche);
      } else {
        next = next.filter((n) => n !== niche);
      }
      if (next.length === 0) next = ["None of the above"];
    }
    update("restricted_niches", next);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Your website vision ♛</h2>
        <p className="text-muted-foreground">Help us understand what we'd be building together.</p>
      </div>

      {/* Q8 — Website goal */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">What is the main goal of your new website? *</Label>
        <p className="text-sm text-muted-foreground">Select all that apply</p>
        <div className="space-y-2">
          {WEBSITE_GOALS.map((g) => {
            const checked = form.website_goal.includes(g.value);
            return (
              <label
                key={g.value}
                className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  checked ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                }`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => {
                    const next = v
                      ? [...form.website_goal, g.value]
                      : form.website_goal.filter((x: string) => x !== g.value);
                    update("website_goal", next);
                  }}
                />
                <span className="font-medium">{g.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Q9 — Logo */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Does your business have a logo? *</Label>
        <RadioGroup value={form.has_logo} onValueChange={(v) => update("has_logo", v)} className="space-y-2">
          {LOGO_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                form.has_logo === opt.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <RadioGroupItem value={opt.value} />
              <span className="font-medium">{opt.label}</span>
            </label>
          ))}
        </RadioGroup>
        {form.has_logo === "want_addon" && (
          <div className="mt-3 rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Crown className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Logo add-on — $75 one time ♛</p>
                <p className="text-sm text-muted-foreground">
                  Our designer will create a professional AI-generated logo reviewed and polished by hand. You'll receive your logo before your website is built.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Q10 — Support level */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">What level of support are you looking for? *</Label>
        <p className="text-sm text-muted-foreground">No right or wrong answer — we just want to understand what you need</p>
        <RadioGroup value={form.support_level} onValueChange={(v) => update("support_level", v)} className="space-y-2">
          {SUPPORT_LEVELS.map((s) => (
            <label
              key={s.value}
              className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                form.support_level === s.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <RadioGroupItem value={s.value} />
              <span className="font-medium">{s.label}</span>
            </label>
          ))}
        </RadioGroup>
      </div>

      {/* Q11 — Sensitive niches */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Is your business in any of these industries?</Label>
        <p className="text-sm text-muted-foreground">Select all that apply</p>
        <div className="space-y-2">
          {RESTRICTED_NICHES.map((niche) => {
            const checked = form.restricted_niches.includes(niche);
            return (
              <label
                key={niche}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  checked ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                }`}
              >
                <Checkbox checked={checked} onCheckedChange={(v) => toggleNiche(niche, !!v)} />
                <span className="text-sm font-medium">{niche}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Q12 — Readiness */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">When are you looking to get started? *</Label>
        <RadioGroup value={form.readiness} onValueChange={(v) => update("readiness", v)} className="space-y-2">
          {READINESS_OPTIONS.map((r) => (
            <label
              key={r.value}
              className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                form.readiness === r.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <RadioGroupItem value={r.value} />
              <span className="font-medium">{r.label}</span>
            </label>
          ))}
        </RadioGroup>
      </div>

      {/* Q13 — Anything else */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Anything else you want us to know about your business? ♛</Label>
        <p className="text-sm text-muted-foreground">This is your chance to tell us something that makes your business special. We read every word.</p>
        <Textarea
          value={form.anything_else}
          onChange={(e) => update("anything_else", e.target.value)}
          placeholder="Tell us something about your business that doesn't fit neatly into a form field. What are you proud of? What makes you different? What's the story behind what you do?"
          rows={6}
          className="text-base resize-y min-h-[140px]"
          maxLength={3000}
        />
      </div>
    </div>
  );
}
