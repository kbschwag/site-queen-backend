import { ApplicationFormData, REFERRAL_SOURCES } from "./types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  form: ApplicationFormData;
  update: (field: string, value: any) => void;
}

export default function StepConnect({ form, update }: Props) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Almost there ♛</h2>
        <p className="text-muted-foreground">Last step. Tell us how to reach you and how you found us. We'll be in touch within 24 hours.</p>
      </div>

      {/* Q14 — Full name */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Your full name *</Label>
        <Input
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Your full name"
          className="text-base"
          maxLength={120}
        />
      </div>

      {/* Q15 — Email */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Your email address *</Label>
        <Input
          type="email"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          placeholder="you@example.com"
          className="text-base"
          maxLength={255}
        />
        <p className="text-sm text-muted-foreground">This is where we'll send your application decision</p>
      </div>

      {/* Q16 — Phone */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Your phone number *</Label>
        <Input
          type="tel"
          value={form.phone}
          onChange={(e) => update("phone", e.target.value)}
          placeholder="(555) 123-4567"
          className="text-base"
          maxLength={30}
        />
        <p className="text-sm text-muted-foreground">We may give you a quick call if you're a great fit ♛</p>
      </div>

      {/* Q17 — Referral source */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">How did you hear about SiteQueen? *</Label>
        <Select value={form.referral_source} onValueChange={(v) => update("referral_source", v)}>
          <SelectTrigger className="text-base"><SelectValue placeholder="Select an option..." /></SelectTrigger>
          <SelectContent>
            {REFERRAL_SOURCES.map((src) => (
              <SelectItem key={src} value={src}>{src}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
