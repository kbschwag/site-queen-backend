import { ApplicationFormData, BUSINESS_TYPES, INDUSTRIES, WEBSITE_STATUS } from "./types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  form: ApplicationFormData;
  update: (field: string, value: any) => void;
}

export default function StepAboutBusiness({ form, update }: Props) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Tell us about your business</h2>
        <p className="text-muted-foreground">Let's start with the basics so we can understand what you need.</p>
      </div>

      {/* Q1 */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">What best describes your business? *</Label>
        <RadioGroup value={form.business_type} onValueChange={(v) => update("business_type", v)} className="space-y-2">
          {BUSINESS_TYPES.map((bt) => (
            <label
              key={bt.value}
              className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                form.business_type === bt.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <RadioGroupItem value={bt.value} className="mt-0.5" />
              <div>
                <span className="font-medium">{bt.label}</span>
                {bt.desc && <p className="text-sm text-muted-foreground mt-0.5">{bt.desc}</p>}
              </div>
            </label>
          ))}
        </RadioGroup>
      </div>

      {/* Q2 */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">What is your business name? *</Label>
        <Input
          value={form.business_name}
          onChange={(e) => update("business_name", e.target.value)}
          placeholder="e.g. Bella's Beauty Studio"
          className="text-base"
        />
      </div>

      {/* Q3 */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">What industry are you in? *</Label>
        <Select value={form.industry} onValueChange={(v) => update("industry", v)}>
          <SelectTrigger className="text-base"><SelectValue placeholder="Select your industry..." /></SelectTrigger>
          <SelectContent>
            {INDUSTRIES.map((ind) => (
              <SelectItem key={ind} value={ind.toLowerCase().replace(/ /g, "_")}>{ind}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Q4 */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Where are you based?</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="City" />
          <Input value={form.state_province} onChange={(e) => update("state_province", e.target.value)} placeholder="State / Province" />
          <Input value={form.country} onChange={(e) => update("country", e.target.value)} placeholder="Country *" />
        </div>
      </div>

      {/* Q5 */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Do you currently have a website? *</Label>
        <RadioGroup value={form.has_website} onValueChange={(v) => update("has_website", v)} className="space-y-2">
          {WEBSITE_STATUS.map((ws) => (
            <label
              key={ws.value}
              className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                form.has_website === ws.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <RadioGroupItem value={ws.value} />
              <span className="font-medium">{ws.label}</span>
            </label>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}
