import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Upload, X } from "lucide-react";

async function uploadProspectPhoto(file: File, folder: string): Promise<string | null> {
  try {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `prospects-temp/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("client-uploads").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("client-uploads").getPublicUrl(path);
    return data.publicUrl;
  } catch (e: any) {
    toast.error(`Upload failed: ${e.message}`);
    return null;
  }
}

const TEMPLATE_BY_CATEGORY: Record<string, string> = {
  trades: "trades",
  beauty: "feminine",
  wellness: "warm",
  restaurant: "local",
  professional: "professional",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}

export function AddProspectModal({ open, onOpenChange, onCreated }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    business_name: "",
    category: "trades",
    city: "",
    services: "",
    brand_color: "#534AB7",
    use_default_color: true,
    phone: "",
    email: "",
    existing_url: "",
    notes: "",
  });

  const [heroPhoto, setHeroPhoto] = useState<string | null>(null);
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const sessionFolder = useState(() => Math.random().toString(36).slice(2))[0];

  const update = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const pickAndUpload = (multiple: boolean, onDone: (urls: string[]) => void) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = multiple;
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (!files.length) return;
      setUploading(true);
      const urls: string[] = [];
      for (const f of files) {
        const url = await uploadProspectPhoto(f, sessionFolder);
        if (url) urls.push(url);
      }
      setUploading(false);
      if (urls.length) onDone(urls);
    };
    input.click();
  };

  const handleSubmit = async () => {
    if (!form.business_name.trim() || !form.city.trim()) {
      toast.error("Business name and city are required");
      return;
    }
    setSubmitting(true);
    try {
      const template = TEMPLATE_BY_CATEGORY[form.category] || "trades";
      const intake_data: any = {
        business_name: form.business_name,
        business_city: form.city,
        primary_color: form.use_default_color ? null : form.brand_color,
        services: form.services
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((name) => ({ name })),
        template_selected: template,
        business_phone: form.phone,
        business_email: form.email,
        hero_photo_url: heroPhoto || undefined,
        portfolio_photos: galleryPhotos,
        logo_url: logoUrl || undefined,
        use_stock_photos: !heroPhoto && galleryPhotos.length === 0,
      };
        services: form.services
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((name) => ({ name })),
        template_selected: template,
        business_phone: form.phone,
        business_email: form.email,
      };

      const { data: client, error: cErr } = await supabase
        .from("clients")
        .insert({
          business_name: form.business_name,
          business_type: form.category,
          plan: "starter",
          lifecycle_stage: "prospect",
          prospect_category: form.category,
          prospect_city: form.city,
          prospect_services: form.services,
          prospect_notes: form.notes,
          prospect_existing_url: form.existing_url || null,
          prospect_email: form.email || null,
          prospect_brand_color: form.use_default_color ? null : form.brand_color,
          phone_number: form.phone || null,
          subscription_status: "prospect",
          site_status: "building",
        } as any)
        .select("id")
        .single();
      if (cErr) throw cErr;

      const clientId = (client as any).id;

      await supabase.from("sites").insert({
        client_id: clientId,
        intake_data,
        generation_status: "pending",
      } as any);

      // Fire generation (don't await — show in list with spinner)
      supabase.functions.invoke("generate-website", { body: { client_id: clientId } }).catch((e) => {
        console.error("generate-website invoke error", e);
      });

      toast.success("Prospect created — generating demo site");
      onCreated(clientId);
      onOpenChange(false);
      setForm({
        business_name: "",
        category: "trades",
        city: "",
        services: "",
        brand_color: "#534AB7",
        use_default_color: true,
        phone: "",
        email: "",
        existing_url: "",
        notes: "",
      });
    } catch (e: any) {
      toast.error(e.message || "Failed to create prospect");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Prospect</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Business name *</Label>
              <Input value={form.business_name} onChange={(e) => update("business_name", e.target.value)} />
            </div>
            <div>
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={(v) => update("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trades">Trades / Home Services</SelectItem>
                  <SelectItem value="beauty">Beauty / Salon</SelectItem>
                  <SelectItem value="wellness">Wellness / Coach / Therapist</SelectItem>
                  <SelectItem value="restaurant">Restaurant / Food</SelectItem>
                  <SelectItem value="professional">Professional Services</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>City *</Label>
              <Input value={form.city} onChange={(e) => update("city", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Services (one per line)</Label>
              <Textarea rows={3} value={form.services} onChange={(e) => update("services", e.target.value)} />
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <Label>Brand color</Label>
              <input
                type="color"
                value={form.brand_color}
                onChange={(e) => update("brand_color", e.target.value)}
                disabled={form.use_default_color}
                className="h-9 w-14 rounded border"
              />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.use_default_color} onCheckedChange={(v) => update("use_default_color", !!v)} />
                Use category default
              </label>
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Existing website URL</Label>
              <Input value={form.existing_url} onChange={(e) => update("existing_url", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create and Generate Demo Site
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
