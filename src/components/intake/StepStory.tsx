import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Sparkles, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { IntakeData } from "./types";

interface Props {
  data: IntakeData;
  onChange: (updates: Partial<IntakeData>) => void;
  onUpload: (file: File, category: string) => Promise<string | null>;
}

export function StepStory({ data, onChange, onUpload }: Props) {
  const [generatingAbout, setGeneratingAbout] = useState(false);
  const [generatingBio, setGeneratingBio] = useState(false);

  const generateAbout = async () => {
    setGeneratingAbout(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("generate-intake-content", {
        body: {
          type: "about",
          inputs: {
            started: data.story_started,
            different: data.story_different,
            ideal_customer: data.story_ideal_customer,
            problem: data.story_problem,
            business_name: data.business_name,
          },
        },
      });
      if (error) throw error;
      onChange({ about_section_generated: result.content });
      toast.success("About section generated!");
    } catch (e) {
      toast.error("Failed to generate content. Try again.");
    } finally {
      setGeneratingAbout(false);
    }
  };

  const generateBio = async () => {
    setGeneratingBio(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("generate-intake-content", {
        body: {
          type: "bio",
          inputs: {
            name: data.owner_name,
            title: data.owner_title,
            bio_raw: data.owner_bio_raw,
            business_name: data.business_name,
          },
        },
      });
      if (error) throw error;
      onChange({ owner_bio_generated: result.content });
      toast.success("Bio generated!");
    } catch (e) {
      toast.error("Failed to generate content. Try again.");
    } finally {
      setGeneratingBio(false);
    }
  };

  const team = data.team_members || [];
  const addTeamMember = () => {
    if (team.length >= 5) return;
    onChange({ team_members: [...team, { name: "", title: "", bio: "" }] });
  };
  const updateTeam = (idx: number, field: string, value: string) => {
    const updated = [...team];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange({ team_members: updated });
  };
  const removeTeam = (idx: number) => {
    onChange({ team_members: team.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold mb-1">Your Story</h2>
        <p className="text-sm text-muted-foreground">People buy from people they know and trust. Let's tell your story.</p>
      </div>

      <div className="space-y-4">
        <Label className="text-base font-semibold">About Your Business</Label>
        <div>
          <Label className="text-sm">How long have you been in business and how did you get started?</Label>
          <Textarea value={data.story_started || ""} onChange={(e) => onChange({ story_started: e.target.value.slice(0, 500) })} maxLength={500} rows={3} />
          <p className="text-xs text-muted-foreground text-right">{(data.story_started || "").length}/500</p>
        </div>
        <div>
          <Label className="text-sm">What makes your business different from competitors?</Label>
          <Textarea value={data.story_different || ""} onChange={(e) => onChange({ story_different: e.target.value.slice(0, 500) })} maxLength={500} rows={3} />
          <p className="text-xs text-muted-foreground text-right">{(data.story_different || "").length}/500</p>
        </div>
        <div>
          <Label className="text-sm">Who is your ideal customer?</Label>
          <Textarea value={data.story_ideal_customer || ""} onChange={(e) => onChange({ story_ideal_customer: e.target.value.slice(0, 300) })} maxLength={300} rows={2} />
          <p className="text-xs text-muted-foreground text-right">{(data.story_ideal_customer || "").length}/300</p>
        </div>
        <div>
          <Label className="text-sm">What problem do you solve for your customers?</Label>
          <Textarea value={data.story_problem || ""} onChange={(e) => onChange({ story_problem: e.target.value.slice(0, 300) })} maxLength={300} rows={2} />
          <p className="text-xs text-muted-foreground text-right">{(data.story_problem || "").length}/300</p>
        </div>

        {data.story_started && data.story_different && (
          <Button onClick={generateAbout} disabled={generatingAbout} className="gap-2">
            {generatingAbout ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate my About section with AI ♛
          </Button>
        )}

        {data.about_section_generated && (
          <div>
            <Label className="text-sm">Your AI-Generated About Section (edit it until it sounds like you)</Label>
            <Textarea value={data.about_section_generated} onChange={(e) => onChange({ about_section_generated: e.target.value })} rows={6} />
          </div>
        )}
      </div>

      <div className="space-y-4">
        <Label className="text-base font-semibold">Owner / Team Bio</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><Label className="text-sm">Your Name</Label><Input value={data.owner_name || ""} onChange={(e) => onChange({ owner_name: e.target.value })} /></div>
          <div><Label className="text-sm">Your Title</Label><Input value={data.owner_title || ""} onChange={(e) => onChange({ owner_title: e.target.value })} placeholder="e.g. Founder, Owner, Lead Stylist" /></div>
        </div>
        <div>
          <Label className="text-sm">Tell us about yourself, your experience, and why you love what you do</Label>
          <Textarea value={data.owner_bio_raw || ""} onChange={(e) => onChange({ owner_bio_raw: e.target.value.slice(0, 400) })} maxLength={400} rows={3} />
          <p className="text-xs text-muted-foreground text-right">{(data.owner_bio_raw || "").length}/400</p>
        </div>

        {data.owner_bio_raw && (
          <Button variant="outline" onClick={generateBio} disabled={generatingBio} className="gap-2">
            {generatingBio ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate my bio with AI
          </Button>
        )}

        {data.owner_bio_generated && (
          <div>
            <Label className="text-sm">Your AI-Generated Bio</Label>
            <Textarea value={data.owner_bio_generated} onChange={(e) => onChange({ owner_bio_generated: e.target.value })} rows={4} />
          </div>
        )}

        <div>
          <Label className="text-sm">Owner Photo</Label>
          <p className="text-xs text-muted-foreground mb-2">Sites with a real photo of the owner convert 40% better ✨</p>
          {data.owner_photo_url ? (
            <div className="flex items-center gap-3">
              <img src={data.owner_photo_url} alt="" className="h-16 w-16 rounded-full object-cover border" />
              <Button variant="ghost" size="sm" onClick={() => onChange({ owner_photo_url: undefined })}><X className="h-4 w-4" /></Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*";
              input.onchange = async (e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) {
                  const url = await onUpload(f, "owner");
                  if (url) onChange({ owner_photo_url: url });
                }
              };
              input.click();
            }}>
              <Upload className="h-4 w-4" /> Upload Photo
            </Button>
          )}
        </div>
      </div>

      {/* Team */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">Team Members</Label>
        {team.map((member, i) => (
          <div key={i} className="border rounded-lg p-4 space-y-3 relative">
            <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6" onClick={() => removeTeam(i)}><X className="h-4 w-4" /></Button>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-sm">Name</Label><Input value={member.name} onChange={(e) => updateTeam(i, "name", e.target.value)} /></div>
              <div><Label className="text-sm">Title</Label><Input value={member.title} onChange={(e) => updateTeam(i, "title", e.target.value)} /></div>
            </div>
            <div><Label className="text-sm">Bio</Label><Textarea value={member.bio} onChange={(e) => updateTeam(i, "bio", e.target.value.slice(0, 300))} rows={2} maxLength={300} /></div>
          </div>
        ))}
        {team.length < 5 && (
          <Button variant="outline" size="sm" className="gap-2" onClick={addTeamMember}>
            <Plus className="h-4 w-4" /> Add Team Member
          </Button>
        )}
      </div>
    </div>
  );
}
