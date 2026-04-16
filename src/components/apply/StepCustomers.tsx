import { ApplicationFormData } from "./types";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  form: ApplicationFormData;
  update: (field: string, value: any) => void;
}

export default function StepCustomers({ form, update }: Props) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Tell us about your customers ♛</h2>
        <p className="text-muted-foreground">Great websites speak directly to the right people. Help us understand yours.</p>
      </div>

      {/* Q6 — Ideal customer */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Who is your ideal customer? *</Label>
        <p className="text-sm text-muted-foreground">Be as specific as you can — the more detail the better</p>
        <Textarea
          value={form.ideal_customer}
          onChange={(e) => update("ideal_customer", e.target.value)}
          placeholder="e.g. Homeowners in the Phoenix area, typically 35-60 years old, who own their home and need reliable trade work done. They value quality and reliability over price and usually find us through Google or neighbor recommendations..."
          rows={6}
          className="text-base resize-y min-h-[140px]"
          maxLength={2000}
        />
      </div>

      {/* Q7 — Google search terms */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">What do people search on Google to find a business like yours? *</Label>
        <p className="text-sm text-muted-foreground">Think about what your customers type when they need what you offer</p>
        <Textarea
          value={form.google_search_terms}
          onChange={(e) => update("google_search_terms", e.target.value)}
          placeholder="e.g. emergency plumber Phoenix, 24 hour plumber near me, water heater replacement Phoenix, best plumber in Scottsdale..."
          rows={4}
          className="text-base resize-y min-h-[100px]"
          maxLength={1000}
        />
      </div>
    </div>
  );
}
