import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Facebook, Instagram, Linkedin, Youtube, Globe } from "lucide-react";
import type { IntakeData } from "./types";

interface Props {
  data: IntakeData;
  onChange: (updates: Partial<IntakeData>) => void;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const SOCIAL_FIELDS = [
  { key: "facebook", label: "Facebook", icon: Facebook },
  { key: "instagram", label: "Instagram", icon: Instagram },
  { key: "tiktok", label: "TikTok", icon: Globe },
  { key: "linkedin", label: "LinkedIn", icon: Linkedin },
  { key: "youtube", label: "YouTube", icon: Youtube },
  { key: "pinterest", label: "Pinterest", icon: Globe },
  { key: "yelp", label: "Yelp", icon: Globe },
  { key: "other", label: "Other", icon: Globe },
] as const;

export function StepBusinessBasics({ data, onChange }: Props) {
  const hours = data.business_hours || {};
  const social = data.social_links || {};

  const updateHours = (day: string, field: string, value: any) => {
    const updated = { ...hours, [day]: { ...hours[day], [field]: value } };
    onChange({ business_hours: updated });
  };

  const updateSocial = (key: string, value: string) => {
    onChange({ social_links: { ...social, [key]: value } });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold mb-1">Business Basics</h2>
        <p className="text-sm text-muted-foreground">Let's start with the fundamentals. This information will appear across your website.</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Business Name</Label>
          <Input value={data.business_name || ""} onChange={(e) => onChange({ business_name: e.target.value })} />
        </div>

        <div>
          <Label>Tagline or Slogan</Label>
          <p className="text-xs text-muted-foreground mb-1">A short phrase that describes what you do. Example: "Fast. Reliable. Local."</p>
          <Input value={data.tagline || ""} onChange={(e) => onChange({ tagline: e.target.value.slice(0, 100) })} maxLength={100} />
          <p className="text-xs text-muted-foreground text-right mt-1">{(data.tagline || "").length}/100</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Primary Phone *</Label>
            <Input value={data.primary_phone || ""} onChange={(e) => onChange({ primary_phone: e.target.value })} placeholder="(555) 123-4567" />
          </div>
          <div>
            <Label>Secondary Phone</Label>
            <Input value={data.secondary_phone || ""} onChange={(e) => onChange({ secondary_phone: e.target.value })} />
          </div>
        </div>

        <div>
          <Label>Business Email</Label>
          <Input type="email" value={data.business_email || ""} onChange={(e) => onChange({ business_email: e.target.value })} />
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Do you serve customers at a physical location?</Label>
          <Select value={data.location_type || ""} onValueChange={(v) => onChange({ location_type: v as any })}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="physical">Yes</SelectItem>
              <SelectItem value="mobile">No — I come to them</SelectItem>
              <SelectItem value="both">Both</SelectItem>
              <SelectItem value="online">I work fully online</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {data.location_type && data.location_type !== "online" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>Street Address {data.location_type === "online" ? "(optional)" : ""}</Label>
              <Input value={data.street_address || ""} onChange={(e) => onChange({ street_address: e.target.value })} />
            </div>
            <div><Label>City</Label><Input value={data.city || ""} onChange={(e) => onChange({ city: e.target.value })} /></div>
            <div><Label>State/Province</Label><Input value={data.state_province || ""} onChange={(e) => onChange({ state_province: e.target.value })} /></div>
            <div><Label>ZIP Code</Label><Input value={data.zip_code || ""} onChange={(e) => onChange({ zip_code: e.target.value })} /></div>
            <div><Label>Country</Label><Input value={data.country || ""} onChange={(e) => onChange({ country: e.target.value })} /></div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <Label className="text-base font-semibold">Business Hours</Label>
        <div className="flex items-center gap-2 mb-2">
          <Switch checked={data.appointment_only || false} onCheckedChange={(v) => onChange({ appointment_only: v })} />
          <span className="text-sm">By appointment only</span>
        </div>
        {!data.appointment_only && (
          <div className="space-y-2">
            {DAYS.map((day) => {
              const dayHours = hours[day] || { open: "09:00", close: "17:00", closed: false };
              return (
                <div key={day} className="flex items-center gap-3">
                  <span className="w-24 text-sm font-medium">{day}</span>
                  <Switch checked={!dayHours.closed} onCheckedChange={(v) => updateHours(day, "closed", !v)} />
                  {!dayHours.closed ? (
                    <div className="flex items-center gap-2">
                      <Input type="time" value={dayHours.open || "09:00"} onChange={(e) => updateHours(day, "open", e.target.value)} className="w-32" />
                      <span className="text-sm text-muted-foreground">to</span>
                      <Input type="time" value={dayHours.close || "17:00"} onChange={(e) => updateHours(day, "close", e.target.value)} className="w-32" />
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <Label className="text-base font-semibold">Social Media Links</Label>
        <p className="text-xs text-muted-foreground">All optional — add the ones you use.</p>
        {SOCIAL_FIELDS.map(({ key, label, icon: Icon }) => (
          <div key={key} className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder={`${label} URL`}
              value={(social as any)[key] || ""}
              onChange={(e) => updateSocial(key, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
