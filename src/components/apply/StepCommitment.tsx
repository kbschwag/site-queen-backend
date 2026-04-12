import { ApplicationFormData, PLAN_OPTIONS, COMMITMENT_OPTIONS } from "./types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Crown } from "lucide-react";

interface Props {
  form: ApplicationFormData;
  update: (field: string, value: any) => void;
}

export default function StepCommitment({ form, update }: Props) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Almost there!</h2>
        <p className="text-muted-foreground">Pick your plan, share your details, and we'll take it from here.</p>
      </div>

      {/* Q16 - Plan cards */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Which plan are you most interested in? *</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PLAN_OPTIONS.map((plan) => (
            <button
              key={plan.value}
              type="button"
              onClick={() => update("plan_interest", plan.value)}
              className={`relative rounded-xl border-2 p-5 transition-all text-left ${
                form.plan_interest === plan.value
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border hover:border-primary/40"
              }`}
            >
              {"popular" in plan && plan.popular && (
                <span className="absolute -top-3 left-4 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                  <Crown className="w-3 h-3" /> MOST POPULAR
                </span>
              )}
              <p className="font-bold text-lg text-foreground">{plan.label}</p>
              <p className="text-primary font-semibold text-xl mt-1">{plan.price}</p>
              <ul className="mt-3 space-y-1">
                {plan.features.map((f) => (
                  <li key={f} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span> {f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      </div>

      {/* Q17 */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">
          SiteQueen builds your website for free in exchange for a 12-month subscription commitment. How do you feel about that? *
        </Label>
        <RadioGroup value={form.accepts_commitment} onValueChange={(v) => update("accepts_commitment", v)} className="space-y-2">
          {COMMITMENT_OPTIONS.map((o) => (
            <label key={o.value} className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${form.accepts_commitment === o.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
              <RadioGroupItem value={o.value} />
              <span className="font-medium">{o.label}</span>
            </label>
          ))}
        </RadioGroup>
      </div>

      {/* Q18-20 Contact info */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">Your contact details</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Full name *</Label>
            <Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Jane Smith" className="text-base" />
          </div>
          <div className="space-y-2">
            <Label>Email address *</Label>
            <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="jane@mybusiness.com" className="text-base" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Phone number (optional)</Label>
            <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="(555) 123-4567" className="text-base" />
          </div>
        </div>
      </div>

      {/* Q21 */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Anything else you want us to know about your business?</Label>
        <p className="text-sm text-muted-foreground">Optional — max 500 characters</p>
        <Textarea
          value={form.additional_notes}
          onChange={(e) => {
            if (e.target.value.length <= 500) update("additional_notes", e.target.value);
          }}
          placeholder="Tell us anything that might help us understand your business better..."
          rows={4}
          className="text-base"
        />
        <p className="text-xs text-muted-foreground text-right">{form.additional_notes.length}/500</p>
      </div>
    </div>
  );
}
