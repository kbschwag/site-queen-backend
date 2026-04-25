import { useState, useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, X, ImageIcon, AlertCircle } from "lucide-react";
import type { IntakeData } from "./types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { countIntakePhotos } from "@/lib/photo-utils";

interface Props {
  data: IntakeData;
  onChange: (updates: Partial<IntakeData>) => void;
  onUploadMultiple: (files: File[], category: string) => Promise<string[]>;
  onUpload: (file: File, category: string) => Promise<string | null>;
  rightsError?: boolean;
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

export function StepPhotos({ data, onChange, onUploadMultiple, onUpload, rightsError }: Props) {
  const photoCount = countIntakePhotos(data);
  const hasAnyPhotos = photoCount > 0;

  // Keep a ref to the latest data so async upload handlers append against
  // the freshest array — prevents concurrent uploads from clobbering each
  // other when two batches finish back-to-back.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // If photos are removed back to zero, clear the rights confirmation
  useEffect(() => {
    if (!hasAnyPhotos && data.photo_rights_confirmed) {
      onChange({ photo_rights_confirmed: false });
    }
  }, [hasAnyPhotos, data.photo_rights_confirmed, onChange]);

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

  const appendTo = (
    key: "portfolio_photos" | "team_photos" | "location_photos" | "extra_photos",
    urls: string[],
  ) => {
    const current = (dataRef.current[key] as string[] | undefined) || [];
    onChange({ [key]: [...current, ...urls] } as Partial<IntakeData>);
  };

  const removeFrom = (
    key: "portfolio_photos" | "team_photos" | "location_photos" | "extra_photos",
    idx: number,
  ) => {
    const current = (dataRef.current[key] as string[] | undefined) || [];
    onChange({ [key]: current.filter((_, i) => i !== idx) } as Partial<IntakeData>);
  };

  return (
    <div className="space-y-8" id="step-photos-root">
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
        onAdd={() => openPicker("portfolio", true, (urls) => appendTo("portfolio_photos", urls))}
        onRemove={(i) => removeFrom("portfolio_photos", i)}
      />

      <PhotoSection
        label="Team Photos"
        description="Photos of you and your team (up to 10)"
        photos={data.team_photos || []}
        maxPhotos={10}
        onAdd={() => openPicker("team", true, (urls) => appendTo("team_photos", urls))}
        onRemove={(i) => removeFrom("team_photos", i)}
      />

      <PhotoSection
        label="Location Photos"
        description="Your storefront, office, studio, or workspace (optional, up to 10)"
        photos={data.location_photos || []}
        maxPhotos={10}
        onAdd={() => openPicker("location", true, (urls) => appendTo("location_photos", urls))}
        onRemove={(i) => removeFrom("location_photos", i)}
      />

      <PhotoSection
        label="General Extras"
        description="Any other photos you want us to have — we'll use the best ones (up to 30)"
        photos={data.extra_photos || []}
        maxPhotos={30}
        onAdd={() => openPicker("extras", true, (urls) => appendTo("extra_photos", urls))}
        onRemove={(i) => removeFrom("extra_photos", i)}
      />

      <div className="flex items-center gap-2">
        <Checkbox checked={data.use_stock_photos || false} onCheckedChange={(v) => onChange({ use_stock_photos: !!v })} />
        <span className="text-sm">I don't have professional photos yet — use beautiful stock photos as placeholders</span>
      </div>

      {/* Photo rights confirmation — only when at least one photo uploaded */}
      {hasAnyPhotos && (
        <div
          id="photo-rights-confirm"
          className={`rounded-xl border p-4 transition-colors ${
            rightsError
              ? "border-destructive/40 bg-destructive/5"
              : "border-border bg-secondary/30"
          }`}
        >
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={!!data.photo_rights_confirmed}
              onCheckedChange={(v) => onChange({ photo_rights_confirmed: !!v })}
              className="mt-0.5"
            />
            <span className="text-sm leading-relaxed">
              I confirm that I own or have the legal right to use all photos I am
              uploading. I understand that SiteQueen will use these photos to
              build my website. ♛
            </span>
          </label>
          {rightsError && (
            <div className="mt-3 flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Please confirm you have the rights to your uploaded photos before continuing.</span>
            </div>
          )}
        </div>
      )}

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
