import { ApplicationFormData, YEARS_OPTIONS, MONTHLY_CLIENTS, DECISION_MAKER, RESTRICTED_NICHES, UPDATE_FREQUENCY } from "./types";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";

interface Props {
  form: ApplicationFormData;
  update: (field: string, value: any) => void;
}

export default function StepBusinessHealth({ form, update }: Props) {
  const toggleNiche = (niche: string) => {
    if (niche === "None of the above") {
      update("restricted_niches", form.restricted_niches.includes(niche) ? [] : ["None of the above"]);
      return;
    }
    const filtered = form.restricted_niches.filter((n) => n !== "None of the above");
    if (filtered.includes(niche)) {
      update("restricted_niches", filtered.filter((n) => n !== niche));
    } else {
      update("restricted_niches", [...filtered, niche]);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Your business health</h2>
        <p className="text-muted-foreground">This helps us understand where you are and how we can best support you.</p>
      </div>

      {/* Q6 */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">How long have you been in business? *</Label>
        <RadioGroup value={form.years_in_business} onValueChange={(v) => update("years_in_business", v)} className="space-y-2">
          {YEARS_OPTIONS.map((o) => (
            <label key={o.value} className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${form.years_in_business === o.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
              <RadioGroupItem value={o.value} />
              <span className="font-medium">{o.label}</span>
            </label>
          ))}
        </RadioGroup>
      </div>

      {/* Q7 */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Roughly how many clients or customers do you serve per month? *</Label>
        <RadioGroup value={form.monthly_clients} onValueChange={(v) => update("monthly_clients", v)} className="space-y-2">
          {MONTHLY_CLIENTS.map((o) => (
            <label key={o.value} className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${form.monthly_clients === o.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
              <RadioGroupItem value={o.value} />
              <span className="font-medium">{o.label}</span>
            </label>
          ))}
        </RadioGroup>
      </div>

      {/* Q8 */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Are you the person who makes decisions about business expenses? *</Label>
        <RadioGroup value={form.decision_maker_status} onValueChange={(v) => update("decision_maker_status", v)} className="space-y-2">
          {DECISION_MAKER.map((o) => (
            <label key={o.value} className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${form.decision_maker_status === o.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
              <RadioGroupItem value={o.value} />
              <span className="font-medium">{o.label}</span>
            </label>
          ))}
        </RadioGroup>
      </div>

      {/* Q9 */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Does your business involve any of the following? *</Label>
        <p className="text-sm text-muted-foreground">Select all that apply</p>
        <div className="space-y-2">
          {RESTRICTED_NICHES.map((niche) => (
            <label
              key={niche}
              className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                form.restricted_niches.includes(niche)
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <Checkbox
                checked={form.restricted_niches.includes(niche)}
                onCheckedChange={() => toggleNiche(niche)}
              />
              <span className="font-medium">{niche}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Q10 */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">How would you describe your need for website updates? *</Label>
        <RadioGroup value={form.update_frequency} onValueChange={(v) => update("update_frequency", v)} className="space-y-2">
          {UPDATE_FREQUENCY.map((o) => (
            <label key={o.value} className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${form.update_frequency === o.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
              <RadioGroupItem value={o.value} />
              <span className="font-medium">{o.label}</span>
            </label>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}
