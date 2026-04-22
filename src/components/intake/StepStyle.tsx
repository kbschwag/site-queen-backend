import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { IntakeData } from "./types";

interface Props {
  data: IntakeData;
  onChange: (updates: Partial<IntakeData>) => void;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const previewUrl = (slug: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/templates/${slug}-preview.png`;

const TEMPLATES = [
  {
    id: "professional",
    name: "The Professional",
    description: "Clean, minimal, trust-forward.",
    bestFor: "Lawyers, accountants, consultants, financial advisors",
    color: "from-slate-600 to-slate-800",
    preview: previewUrl("professional"),
  },
  {
    id: "trades",
    name: "The Trades Hero",
    description: "Bold, action-oriented, built to get calls.",
    bestFor: "Plumbers, electricians, HVAC, contractors",
    color: "from-amber-500 to-orange-600",
    preview: previewUrl("trades-hero"),
  },
  {
    id: "warm",
    name: "The Warm Welcome",
    description: "Soft, inviting, relationship-driven.",
    bestFor: "Salons, spas, coaches, therapists, trainers",
    color: "from-rose-400 to-pink-500",
    preview: previewUrl("warm-welcome"),
  },
  {
    id: "local",
    name: "The Local Favorite",
    description: "Vibrant, appetite-forward, community feel.",
    bestFor: "Restaurants, caterers, bakeries, food businesses",
    color: "from-red-500 to-yellow-500",
    preview: previewUrl("local-favorite"),
  },
  {
    id: "modern",
    name: "The Modern Business",
    description: "Versatile, contemporary, growth-focused.",
    bestFor: "Any service business, general use",
    color: "from-primary to-accent",
    preview: previewUrl("modern-business"),
  },
];

export function StepStyle({ data, onChange }: Props) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold mb-1">Website Style</h2>
        <p className="text-sm text-muted-foreground">Choose the template that feels most like your business.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange({ template_selected: t.id })}
            className={`text-left rounded-xl border-2 overflow-hidden transition-all ${
              data.template_selected === t.id
                ? "border-primary ring-2 ring-primary/20 shadow-lg"
                : "border-border hover:border-primary/50"
            }`}
          >
            <div className={`relative aspect-[16/9] bg-gradient-to-br ${t.color} flex items-center justify-center overflow-hidden`}>
              <img
                src={t.preview}
                alt={`${t.name} template preview`}
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
                className="absolute inset-0 w-full h-full object-cover object-top"
              />
              <span className="relative text-2xl font-bold text-white/90 drop-shadow">♛</span>
            </div>
            <div className="p-4 space-y-1">
              <p className="font-semibold text-sm">{t.name}</p>
              <p className="text-xs text-muted-foreground">{t.description}</p>
              <p className="text-xs text-primary">Best for: {t.bestFor}</p>
            </div>
          </button>
        ))}
      </div>

      {data.template_selected && (
        <div>
          <Label className="text-sm">Anything extra about the style?</Label>
          <p className="text-xs text-muted-foreground mb-1">Describe any specific design preferences, things you love or hate.</p>
          <Textarea
            value={data.style_notes || ""}
            onChange={(e) => onChange({ style_notes: e.target.value.slice(0, 500) })}
            maxLength={500}
            rows={3}
          />
          <p className="text-xs text-muted-foreground text-right">{(data.style_notes || "").length}/500</p>
        </div>
      )}

      <div className="bg-secondary/50 rounded-lg p-4">
        <p className="text-sm font-medium mb-2">Not sure which template to pick?</p>
        <Input
          value={data.template_help_request || ""}
          onChange={(e) => onChange({ template_help_request: e.target.value })}
          placeholder="Tell us about your business and we'll recommend one..."
        />
      </div>
    </div>
  );
}
