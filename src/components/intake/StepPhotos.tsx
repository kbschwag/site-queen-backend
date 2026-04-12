import { useRef } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, X, ImageIcon } from "lucide-react";
import type { IntakeData } from "./types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Props {
  data: IntakeData;
  onChange: (updates: Partial<IntakeData>) => void;
  onUploadMultiple: (files: File[], category: string) => Promise<string[]>;
  onUpload: (file: File, category: string) => Promise<string | null>;
}

function PhotoSection({
  label,
  description,
  photos,
  maxPhotos,
  onAdd,
  onRemove,
}: {
  label: string;
  description: string;
  photos: string[];
  maxPhotos: number;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {photos.map((url, i) => (
          <div key={i} className="relative group aspect-square rounded-lg border overflow-hidden">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              onClick={() => onRemove(i)}
              className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {photos.length < maxPhotos && (
          <button
            onClick={onAdd}
            className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 hover:border-primary/50 transition-colors"
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Add</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function StepPhotos({ data, onChange, onUploadMultiple, onUpload }: Props) {
  const openPicker = (category: string, multiple: boolean, onDone: (urls: string[]) => void) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = multiple;
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (multiple) {
        const urls = await onUploadMultiple(files, category);
        onDone(urls);
      } else if (files[0]) {
        const url = await onUpload(files[0], category);
        if (url) onDone([url]);
      }
    };
    input.click();
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold mb-1">Your Photos</h2>
        <p className="text-sm text-muted-foreground">Photos make or break a website. Upload the best ones you have — we'll make them look stunning.</p>
      </div>

      {/* Hero */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Hero Photo</Label>
        <p className="text-xs text-muted-foreground">Your main hero image — the first thing visitors see. Landscape orientation works best.</p>
        {data.hero_photo_url ? (
          <div className="relative w-full max-w-md aspect-video rounded-lg border overflow-hidden">
            <img src={data.hero_photo_url} alt="" className="w-full h-full object-cover" />
            <button onClick={() => onChange({ hero_photo_url: undefined })} className="absolute top-2 right-2 bg-background/80 rounded-full p-1">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Button variant="outline" className="gap-2" onClick={() => openPicker("hero", false, ([url]) => onChange({ hero_photo_url: url }))}>
            <Upload className="h-4 w-4" /> Upload Hero Photo
          </Button>
        )}
        <div className="flex items-center gap-2">
          <Checkbox checked={data.hero_use_stock || false} onCheckedChange={(v) => onChange({ hero_use_stock: !!v })} />
          <span className="text-sm">Use a professional stock photo for now</span>
        </div>
      </div>

      <PhotoSection
        label="Work & Portfolio Photos"
        description="Photos of your work, services, products, or results (up to 20)"
        photos={data.portfolio_photos || []}
        maxPhotos={20}
        onAdd={() => openPicker("portfolio", true, (urls) => onChange({ portfolio_photos: [...(data.portfolio_photos || []), ...urls] }))}
        onRemove={(i) => onChange({ portfolio_photos: (data.portfolio_photos || []).filter((_, idx) => idx !== i) })}
      />

      <PhotoSection
        label="Team Photos"
        description="Photos of you and your team (up to 10)"
        photos={data.team_photos || []}
        maxPhotos={10}
        onAdd={() => openPicker("team", true, (urls) => onChange({ team_photos: [...(data.team_photos || []), ...urls] }))}
        onRemove={(i) => onChange({ team_photos: (data.team_photos || []).filter((_, idx) => idx !== i) })}
      />

      <PhotoSection
        label="Location Photos"
        description="Your storefront, office, studio, or workspace (optional, up to 10)"
        photos={data.location_photos || []}
        maxPhotos={10}
        onAdd={() => openPicker("location", true, (urls) => onChange({ location_photos: [...(data.location_photos || []), ...urls] }))}
        onRemove={(i) => onChange({ location_photos: (data.location_photos || []).filter((_, idx) => idx !== i) })}
      />

      <PhotoSection
        label="General Extras"
        description="Any other photos you want us to have — we'll use the best ones (up to 30)"
        photos={data.extra_photos || []}
        maxPhotos={30}
        onAdd={() => openPicker("extras", true, (urls) => onChange({ extra_photos: [...(data.extra_photos || []), ...urls] }))}
        onRemove={(i) => onChange({ extra_photos: (data.extra_photos || []).filter((_, idx) => idx !== i) })}
      />

      <div className="flex items-center gap-2">
        <Checkbox checked={data.use_stock_photos || false} onCheckedChange={(v) => onChange({ use_stock_photos: !!v })} />
        <span className="text-sm">I don't have professional photos yet — use beautiful stock photos as placeholders</span>
      </div>

      <Collapsible>
        <CollapsibleTrigger className="text-sm text-primary hover:underline flex items-center gap-1">
          <ImageIcon className="h-4 w-4" /> Tips for great website photos
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 text-sm text-muted-foreground space-y-1 bg-secondary/50 rounded-lg p-4">
          <p>📸 Use natural lighting whenever possible</p>
          <p>📐 Landscape orientation works best for hero images</p>
          <p>🖼️ Higher resolution is better — we'll optimize for web</p>
          <p>🧹 Clean, uncluttered backgrounds make photos pop</p>
          <p>😊 Show real people — authenticity builds trust</p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
