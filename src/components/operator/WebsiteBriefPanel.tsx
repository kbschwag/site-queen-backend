import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ExternalLink, FileText, Sparkles, Copy, Check } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import type { IntakeData } from "@/components/intake/types";
import { INTAKE_STEPS } from "@/components/intake/types";

interface Props {
  clientId: string;
  businessName: string;
}

const TEMPLATE_NAMES: Record<string, string> = {
  professional: "The Professional",
  trades: "The Trades Hero",
  warm: "The Warm Welcome",
  local: "The Local Favorite",
  modern: "The Modern Business",
};

export function WebsiteBriefPanel({ clientId, businessName }: Props) {
  const [buildNotes, setBuildNotes] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: site, isLoading } = useQuery({
    queryKey: ["operator-site-brief", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>;
  if (!site?.intake_data) return <div className="py-8 text-center text-sm text-muted-foreground">No intake data yet.</div>;

  const d = site.intake_data as IntakeData;
  const completedSteps = d.completed_steps || [];
  const completionPercent = Math.round((completedSteps.length / 9) * 100);

  const generatePrompt = () => {
    const sections = [
      `# Website Build Brief: ${businessName}`,
      `Template: ${TEMPLATE_NAMES[d.template_selected || ""] || d.template_selected || "Not selected"}`,
      "",
      "## Business Info",
      `- Name: ${d.business_name}`,
      `- Tagline: ${d.tagline || "N/A"}`,
      `- Phone: ${d.primary_phone || "N/A"}`,
      `- Email: ${d.business_email || "N/A"}`,
      `- Location type: ${d.location_type || "N/A"}`,
      d.street_address ? `- Address: ${d.street_address}, ${d.city}, ${d.state_province} ${d.zip_code}` : "",
      "",
      "## Brand",
      `- Primary color: ${d.primary_color || "N/A"}`,
      `- Secondary color: ${d.secondary_color || "N/A"}`,
      `- Color palette: ${d.color_palette || "Custom"}`,
      `- Heading font: ${d.heading_font || "N/A"}`,
      `- Body font: ${d.body_font || "N/A"}`,
      "",
      "## About / Story",
      d.about_section_generated ? `About section:\n${d.about_section_generated}` : "",
      d.owner_name ? `Owner: ${d.owner_name} — ${d.owner_title || ""}` : "",
      d.owner_bio_generated ? `Owner bio:\n${d.owner_bio_generated}` : "",
      "",
      "## Services",
      ...(d.services || []).map((s, i) => `${i + 1}. ${s.name} — ${s.description_generated || s.description || ""} ${s.price_type !== "call" && s.price_value ? `($${s.price_value})` : ""}`),
      d.services_intro_generated ? `\nServices intro:\n${d.services_intro_generated}` : "",
      "",
      "## Pages",
      ...(d.custom_pages || []).map((p) => `- ${p.name}: ${p.description}`),
      d.special_features?.length ? `\nSpecial features: ${d.special_features.join(", ")}` : "",
      "",
      "## Style Notes",
      d.style_notes || "None",
      "",
      "## Final Requests",
      d.final_features?.length ? `Features: ${d.final_features.join(", ")}` : "",
      d.final_checklist?.length ? `Checklist: ${d.final_checklist.join(", ")}` : "",
      d.final_notes || "",
    ].filter(Boolean);

    const text = sections.join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Build prompt copied to clipboard!");
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="space-y-6 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Badge className="bg-primary/10 text-primary">{TEMPLATE_NAMES[d.template_selected || ""] || "No template"}</Badge>
          <p className="text-xs text-muted-foreground mt-1">{completionPercent}% complete · {site.last_updated ? format(new Date(site.last_updated), "MMM d, yyyy h:mm a") : "—"}</p>
        </div>
        <Button size="sm" className="gap-2" onClick={generatePrompt}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied!" : "Generate website prompt"}
        </Button>
      </div>

      <Separator />

      {/* Step 1 */}
      <Section title="Business Basics">
        <Field label="Business Name" value={d.business_name} />
        <Field label="Tagline" value={d.tagline} />
        <Field label="Phone" value={d.primary_phone} />
        <Field label="Email" value={d.business_email} />
        <Field label="Location Type" value={d.location_type} />
        {d.street_address && <Field label="Address" value={`${d.street_address}, ${d.city}, ${d.state_province} ${d.zip_code}`} />}
        {d.social_links && Object.entries(d.social_links).filter(([, v]) => v).map(([k, v]) => (
          <Field key={k} label={k} value={v} isLink />
        ))}
      </Section>

      {/* Step 2 */}
      <Section title="Brand">
        <div className="flex gap-3">
          {d.logo_url && <img src={d.logo_url} alt="Logo" className="h-12 object-contain rounded border p-1" />}
          {d.logo_dark_url && <img src={d.logo_dark_url} alt="Dark logo" className="h-12 object-contain rounded border p-1 bg-foreground" />}
          {d.logo_white_url && <img src={d.logo_white_url} alt="White logo" className="h-12 object-contain rounded border p-1 bg-foreground" />}
        </div>
        <div className="flex items-center gap-3">
          {d.primary_color && <div className="flex items-center gap-2"><div className="w-6 h-6 rounded border" style={{ backgroundColor: d.primary_color }} /><span>{d.primary_color}</span></div>}
          {d.secondary_color && <div className="flex items-center gap-2"><div className="w-6 h-6 rounded border" style={{ backgroundColor: d.secondary_color }} /><span>{d.secondary_color}</span></div>}
        </div>
        <Field label="Heading Font" value={d.heading_font} />
        <Field label="Body Font" value={d.body_font} />
      </Section>

      {/* Step 3 */}
      <Section title="Story">
        {d.about_section_generated && <div className="bg-secondary/50 rounded-lg p-3"><p className="whitespace-pre-wrap">{d.about_section_generated}</p></div>}
        <Field label="Owner" value={d.owner_name ? `${d.owner_name} — ${d.owner_title || ""}` : undefined} />
        {d.owner_bio_generated && <div className="bg-secondary/50 rounded-lg p-3"><p>{d.owner_bio_generated}</p></div>}
        {d.owner_photo_url && <img src={d.owner_photo_url} alt="Owner" className="h-16 w-16 rounded-full object-cover border" />}
      </Section>

      {/* Step 4 */}
      <Section title="Services">
        {(d.services || []).map((s, i) => (
          <div key={i} className="border rounded-lg p-3 space-y-1">
            <p className="font-medium">{s.name}</p>
            <p className="text-muted-foreground">{s.description_generated || s.description}</p>
            {s.price_value && <p className="text-xs">{s.price_type}: {s.price_value}</p>}
          </div>
        ))}
      </Section>

      {/* Step 5 - Photos */}
      <Section title="Photos">
        {d.hero_photo_url && <div><Label className="text-xs">Hero</Label><img src={d.hero_photo_url} alt="" className="h-24 rounded border object-cover" /></div>}
        {(d.portfolio_photos || []).length > 0 && (
          <div>
            <Label className="text-xs">Portfolio ({d.portfolio_photos?.length})</Label>
            <div className="flex flex-wrap gap-1">{d.portfolio_photos?.map((url, i) => <img key={i} src={url} alt="" className="h-12 w-12 rounded border object-cover" />)}</div>
          </div>
        )}
      </Section>

      {/* Step 6 */}
      <Section title="Social Proof">
        <Field label="Google Business" value={d.google_business_url} isLink />
        {(d.testimonials || []).map((t, i) => (
          <div key={i} className="border rounded-lg p-3">
            <p className="font-medium">{t.name} {t.title && <span className="text-muted-foreground">— {t.title}</span>}</p>
            <p className="text-muted-foreground">"{t.text}"</p>
          </div>
        ))}
      </Section>

      {/* Step 7-9 */}
      <Section title="Pages & Features">
        {(d.custom_pages || []).map((p, i) => <Field key={i} label={p.name} value={p.description} />)}
        {d.special_features?.length ? <Field label="Special Features" value={d.special_features.join(", ")} /> : null}
      </Section>

      <Section title="Style & Final">
        <Field label="Template" value={TEMPLATE_NAMES[d.template_selected || ""]} />
        <Field label="Style Notes" value={d.style_notes} />
        {d.final_features?.length ? <Field label="Final Features" value={d.final_features.join(", ")} /> : null}
        {d.final_checklist?.length ? <Field label="Checklist" value={d.final_checklist.join(", ")} /> : null}
        <Field label="Final Notes" value={d.final_notes} />
      </Section>

      <Separator />
      <div>
        <Label className="text-xs text-muted-foreground">Internal Build Notes (clients can't see this)</Label>
        <Textarea value={buildNotes} onChange={(e) => setBuildNotes(e.target.value)} rows={3} placeholder="Add build notes..." />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm text-primary">{title}</h3>
      {children}
      <Separator />
    </div>
  );
}

function Field({ label, value, isLink }: { label: string; value?: string | null; isLink?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      {isLink ? (
        <a href={value} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate flex items-center gap-1">
          {value} <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <span className="text-right">{value}</span>
      )}
    </div>
  );
}
