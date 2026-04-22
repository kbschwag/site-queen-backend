import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Mic, MicOff, Plus, Trash2, CheckCircle2, Pencil, Loader2, Sparkles, Save
} from "lucide-react";

interface Props {
  applicationId: string;
  businessName: string;
  callScheduled?: boolean;
}

interface InspirationSite {
  url: string;
  notes: string;
}

interface AgreedPage {
  name: string;
  description: string;
}

const WEBSITE_GOALS = [
  { value: "phone_calls", label: "They just want people to call — phone number is everything, minimal friction, click to call everywhere" },
  { value: "lead_form", label: "They want leads through a contact form — form is the hero, trust signals heavy, clear value proposition" },
  { value: "professional_presence", label: "They already have enough clients, just need a professional presence — credibility and portfolio focused" },
  { value: "booking", label: "They want people to book appointments online — booking integration is the primary CTA" },
  { value: "sell", label: "They want to sell something — product or service focused with pricing prominent" },
  { value: "other", label: "Other" },
];

const CONTACT_OPTIONS = [
  { value: "phone", label: "Phone calls — show large click to call button" },
  { value: "form", label: "Contact form — include a contact form" },
  { value: "email", label: "Email — show email address" },
  { value: "whatsapp", label: "WhatsApp — add WhatsApp chat button" },
  { value: "booking", label: "Online booking — add booking link" },
  { value: "none", label: "They'll contact clients, not the other way around — remove contact section entirely" },
];

const TONE_OPTIONS = [
  { value: "casual", label: "Very casual and conversational — like talking to a friend" },
  { value: "professional_warm", label: "Professional but approachable — business-like but warm" },
  { value: "formal", label: "Formal and authoritative — they're an expert and want to project that" },
  { value: "fun", label: "Fun and playful — lots of personality" },
  { value: "direct", label: "No-nonsense — just the facts, very direct" },
  { value: "custom", label: "I'll describe it" },
];

const TEMPLATE_OPTIONS = [
  { id: "professional", name: "The Professional", desc: "Clean, corporate, trustworthy" },
  { id: "trades", name: "The Trades Hero", desc: "Bold, rugged, action-oriented" },
  { id: "warm", name: "The Warm Welcome", desc: "Friendly, inviting, personal" },
  { id: "local", name: "The Local Favorite", desc: "Community-focused, approachable" },
  { id: "modern", name: "The Modern Business", desc: "Sleek, minimal, contemporary" },
];

export function CallNotesTab({ applicationId, businessName, callScheduled = true }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [completing, setCompleting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const savedFadeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const buildPayloadRef = useRef<(() => any) | null>(null);
  const callNotesIdRef = useRef<string | null>(null);

  // Form state
  const [theirStory, setTheirStory] = useState("");
  const [idealCustomer, setIdealCustomer] = useState("");
  const [inspirationSites, setInspirationSites] = useState<InspirationSite[]>([{ url: "", notes: "" }]);
  const [instagramHandle, setInstagramHandle] = useState("");
  const [googleSearchTerms, setGoogleSearchTerms] = useState("");
  const [websiteGoal, setWebsiteGoal] = useState("");
  const [websiteGoalOther, setWebsiteGoalOther] = useState("");
  const [contactPreferences, setContactPreferences] = useState<string[]>([]);
  const [bookingUrl, setBookingUrl] = useState("");
  const [pagesAgreed, setPagesAgreed] = useState<AgreedPage[]>([{ name: "", description: "" }]);
  const [templateSelected, setTemplateSelected] = useState("");
  const [colorDirection, setColorDirection] = useState("");
  const [vibeNotes, setVibeNotes] = useState("");
  const [toneOfVoice, setToneOfVoice] = useState("");
  const [toneCustom, setToneCustom] = useState("");
  const [expertAdditions, setExpertAdditions] = useState("");
  const [expertAvoid, setExpertAvoid] = useState("");
  const [exactPhrases, setExactPhrases] = useState("");
  const [finalNotes, setFinalNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const { data: callNotes, isLoading } = useQuery({
    queryKey: ["call-notes", applicationId],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("call_notes")
        .select("*") as any)
        .eq("application_id", applicationId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: applicationData } = useQuery({
    queryKey: ["application-status", applicationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("status, call_notes_completed" as any)
        .eq("id", applicationId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  // Load existing notes into form
  useEffect(() => {
    if (callNotes) {
      setTheirStory(callNotes.their_story || "");
      setIdealCustomer(callNotes.ideal_customer || "");
      setInspirationSites(
        (callNotes.inspiration_sites as InspirationSite[])?.length
          ? (callNotes.inspiration_sites as InspirationSite[])
          : [{ url: "", notes: "" }]
      );
      setInstagramHandle(callNotes.instagram_handle || "");
      setGoogleSearchTerms(callNotes.google_search_terms || "");
      setWebsiteGoal(callNotes.website_goal || "");
      setContactPreferences(callNotes.contact_preferences || []);
      setBookingUrl(callNotes.booking_url || "");
      setPagesAgreed(
        (callNotes.pages_agreed as AgreedPage[])?.length
          ? (callNotes.pages_agreed as AgreedPage[])
          : [{ name: "", description: "" }]
      );
      setTemplateSelected(callNotes.template_selected || "");
      setColorDirection(callNotes.color_direction || "");
      setVibeNotes(callNotes.vibe_notes || "");
      setToneOfVoice(callNotes.tone_of_voice || "");
      setToneCustom(callNotes.tone_custom || "");
      setExpertAdditions(callNotes.expert_additions || "");
      setExpertAvoid(callNotes.expert_avoid || "");
      setExactPhrases(callNotes.exact_phrases || "");
      setFinalNotes(callNotes.final_notes || "");
      setInternalNotes(callNotes.internal_notes || "");
    }
  }, [callNotes]);

  const buildPayload = useCallback(() => ({
    application_id: applicationId,
    their_story: theirStory || null,
    ideal_customer: idealCustomer || null,
    inspiration_sites: inspirationSites.filter(s => s.url || s.notes),
    instagram_handle: instagramHandle || null,
    google_search_terms: googleSearchTerms || null,
    website_goal: websiteGoal === "other" ? `other: ${websiteGoalOther}` : websiteGoal || null,
    contact_preferences: contactPreferences,
    booking_url: bookingUrl || null,
    pages_agreed: pagesAgreed.filter(p => p.name),
    template_selected: templateSelected || null,
    color_direction: colorDirection || null,
    vibe_notes: vibeNotes || null,
    tone_of_voice: toneOfVoice || null,
    tone_custom: toneCustom || null,
    expert_additions: expertAdditions || null,
    expert_avoid: expertAvoid || null,
    exact_phrases: exactPhrases || null,
    final_notes: finalNotes || null,
    internal_notes: internalNotes || null,
  }), [theirStory, idealCustomer, inspirationSites, instagramHandle, googleSearchTerms, websiteGoal, websiteGoalOther, contactPreferences, bookingUrl, pagesAgreed, templateSelected, colorDirection, vibeNotes, toneOfVoice, toneCustom, expertAdditions, expertAvoid, exactPhrases, finalNotes, internalNotes, applicationId]);

  // Keep refs in sync so unmount-flush uses the latest values
  useEffect(() => { buildPayloadRef.current = buildPayload; }, [buildPayload]);
  useEffect(() => { callNotesIdRef.current = callNotes?.id ?? null; }, [callNotes]);

  const performSave = useCallback(async () => {
    const payloadFn = buildPayloadRef.current;
    if (!payloadFn) return;
    setSaveStatus("saving");
    try {
      const payload = payloadFn();
      const existingId = callNotesIdRef.current;
      if (existingId) {
        const { error } = await supabase.from("call_notes").update(payload as any).eq("id", existingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("call_notes").insert(payload as any).select("id").single();
        if (error) throw error;
        if (data?.id) callNotesIdRef.current = data.id;
        queryClient.invalidateQueries({ queryKey: ["call-notes", applicationId] });
      }
      hasUnsavedChangesRef.current = false;
      setHasUnsavedChanges(false);
      setSaveStatus("saved");
      if (savedFadeTimerRef.current) clearTimeout(savedFadeTimerRef.current);
      savedFadeTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err) {
      console.error("Call notes auto-save failed:", err);
      setSaveStatus("error");
    }
  }, [applicationId, queryClient]);

  const triggerAutoSave = useCallback(() => {
    hasUnsavedChangesRef.current = true;
    setHasUnsavedChanges(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(performSave, 1000);
  }, [performSave]);

  // On unmount: flush any pending save instead of dropping it (prevents data loss when switching tabs)
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        if (hasUnsavedChangesRef.current) {
          // Fire-and-forget — component is unmounting but the request will complete
          void performSave();
        }
      }
      if (savedFadeTimerRef.current) clearTimeout(savedFadeTimerRef.current);
    };
  }, [performSave]);

  // Warn before closing tab / navigating away with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Speech recognition
  const startListening = (fieldGetter: () => string, fieldSetter: (val: string) => void, fieldName: string) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition not supported in this browser");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalTranscript = "";
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      const base = fieldGetter();
      const newVal = base ? `${base} ${finalTranscript}${interim}`.trim() : `${finalTranscript}${interim}`.trim();
      fieldSetter(newVal);
    };

    recognition.onerror = () => { setListening(false); setActiveField(null); };
    recognition.onend = () => { setListening(false); setActiveField(null); triggerAutoSave(); };

    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
    setActiveField(fieldName);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
    setActiveField(null);
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const payload = buildPayload();
      if (callNotes?.id) {
        await supabase.from("call_notes").update({ ...payload, completed: true, completed_at: new Date().toISOString(), completed_by: user!.id } as any).eq("id", callNotes.id);
      } else {
        await supabase.from("call_notes").insert({ ...payload, completed: true, completed_at: new Date().toISOString(), completed_by: user!.id } as any);
      }
      await supabase.from("applications").update({ call_notes_completed: true, call_notes_completed_at: new Date().toISOString() } as any).eq("id", applicationId);
      queryClient.invalidateQueries({ queryKey: ["call-notes", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["application-status", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["operator-applications"] });
      toast.success("Call notes saved ♛ — Claude will use these alongside the client's intake form");
      setEditMode(false);
    } catch {
      toast.error("Failed to save call notes");
    } finally {
      setCompleting(false);
    }
  };

  const handleRegenerate = async () => {
    setSaving(true);
    try {
      // Find the client record linked to this application
      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .eq("application_id", applicationId)
        .maybeSingle();
      if (!client) {
        toast.error("Client not yet created — convert the application first");
        setSaving(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke("generate-website", {
        body: { client_id: client.id },
      });
      if (error) throw error;
      toast.success("Website regeneration started with updated call notes!");
    } catch {
      toast.error("Failed to trigger regeneration");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  // State 1: Call not scheduled
  if (!callScheduled && !callNotes) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <p className="text-sm">Discovery call not yet scheduled — this form will be available after the call</p>
      </div>
    );
  }

  // State 3: Completed (read-only)
  if (callNotes?.completed && !editMode) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h3 className="font-semibold">Call notes complete</h3>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditMode(true)} className="gap-1">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button size="sm" onClick={handleRegenerate} disabled={saving} className="gap-1 bg-primary">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Regenerate website
            </Button>
          </div>
        </div>
        <Separator />
        <div className="space-y-4 text-sm">
          <ReadOnlyField label="Their Story" value={callNotes.their_story} />
          <ReadOnlyField label="Ideal Customer" value={callNotes.ideal_customer} />
          {(callNotes.inspiration_sites as InspirationSite[])?.filter((s: any) => s.url).map((s: any, i: number) => (
            <ReadOnlyField key={i} label={`Inspiration ${i + 1}`} value={`${s.url} — ${s.notes}`} />
          ))}
          <ReadOnlyField label="Instagram" value={callNotes.instagram_handle ? `@${callNotes.instagram_handle}` : undefined} />
          <ReadOnlyField label="Google Search Terms" value={callNotes.google_search_terms} />
          <ReadOnlyField label="Website Goal" value={callNotes.website_goal} />
          <ReadOnlyField label="Contact Preferences" value={callNotes.contact_preferences?.join(", ")} />
          {callNotes.booking_url && <ReadOnlyField label="Booking URL" value={callNotes.booking_url} />}
          {(callNotes.pages_agreed as AgreedPage[])?.filter((p: any) => p.name).map((p: any, i: number) => (
            <ReadOnlyField key={i} label={p.name} value={p.description} />
          ))}
          <ReadOnlyField label="Template" value={callNotes.template_selected} />
          <ReadOnlyField label="Color Direction" value={callNotes.color_direction} />
          <ReadOnlyField label="Vibe Notes" value={callNotes.vibe_notes} />
          <ReadOnlyField label="Tone" value={callNotes.tone_of_voice} />
          <Separator />
          <div className="border-l-4 border-primary bg-primary/5 p-4 rounded-r-lg space-y-2">
            <h4 className="font-semibold text-primary">Expert Recommendations ♛</h4>
            <ReadOnlyField label="Claude should ADD" value={callNotes.expert_additions} />
            <ReadOnlyField label="Claude should NOT" value={callNotes.expert_avoid} />
            <ReadOnlyField label="Exact phrases" value={callNotes.exact_phrases} />
          </div>
          <ReadOnlyField label="Final Notes" value={callNotes.final_notes} />
          {callNotes.internal_notes && (
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Internal Notes (not sent to Claude)</p>
              <p className="italic text-muted-foreground">{callNotes.internal_notes}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // State 2: Form (editable)
  const MicButton = ({ field, getter, setter }: { field: string; getter: () => string; setter: (v: string) => void }) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={`h-8 w-8 shrink-0 ${listening && activeField === field ? "text-destructive" : "text-muted-foreground"}`}
      onClick={() => listening && activeField === field ? stopListening() : startListening(getter, setter, field)}
    >
      {listening && activeField === field ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </Button>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Discovery call notes ♛</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Fill this out during or right after your call. Combined with the client's intake form it tells Claude everything needed to build an exceptional website.
          </p>
        </div>
        {saveStatus === "saving" && <Badge variant="outline" className="gap-1 text-xs"><Loader2 className="h-3 w-3 animate-spin" />Saving</Badge>}
        {saveStatus === "saved" && <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200 gap-1 text-xs"><Save className="h-3 w-3" />Saved</Badge>}
      </div>

      {/* Section 1 — Their Story */}
      <FormSection title="Their Story">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label>Tell me about your business</Label>
            <MicButton field="theirStory" getter={() => theirStory} setter={setTheirStory} />
          </div>
          <p className="text-xs text-muted-foreground mb-2">What did they say when you asked them this? Capture their words not yours.</p>
          <Textarea
            value={theirStory}
            onChange={(e) => { setTheirStory(e.target.value); triggerAutoSave(); }}
            rows={6}
            placeholder="e.g. They've been doing HVAC for 22 years, started in their garage, now have 8 trucks. Third generation family business. Father started it, now the son runs it with his wife doing the books..."
          />
        </div>
      </FormSection>

      {/* Section 2 — Ideal Customer */}
      <FormSection title="Their Ideal Customer">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label>Who is their ideal customer?</Label>
            <MicButton field="idealCustomer" getter={() => idealCustomer} setter={setIdealCustomer} />
          </div>
          <p className="text-xs text-muted-foreground mb-2">Be specific — age, situation, problem they have, what they're looking for</p>
          <Textarea
            value={idealCustomer}
            onChange={(e) => { setIdealCustomer(e.target.value); triggerAutoSave(); }}
            rows={4}
            placeholder="e.g. Homeowners in the Phoenix suburbs, typically 35-60, own their home, have a problem that needs fixing fast, value reliability over price..."
          />
        </div>
      </FormSection>

      {/* Section 3 — Website Inspiration */}
      <FormSection title="Website Inspiration">
        <div>
          <Label>What websites do they love and why?</Label>
          <p className="text-xs text-muted-foreground mb-3">Add up to 3 URLs with a note on what they liked about each</p>
          {inspirationSites.map((site, i) => (
            <div key={i} className="space-y-2 mb-4">
              <div className="flex gap-2">
                <Input
                  value={site.url}
                  onChange={(e) => {
                    const updated = [...inspirationSites];
                    updated[i] = { ...updated[i], url: e.target.value };
                    setInspirationSites(updated);
                    triggerAutoSave();
                  }}
                  placeholder="Website URL"
                />
                {inspirationSites.length > 1 && (
                  <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground h-10 w-10" onClick={() => {
                    setInspirationSites(inspirationSites.filter((_, j) => j !== i));
                    triggerAutoSave();
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <Textarea
                value={site.notes}
                onChange={(e) => {
                  const updated = [...inspirationSites];
                  updated[i] = { ...updated[i], notes: e.target.value };
                  setInspirationSites(updated);
                  triggerAutoSave();
                }}
                rows={2}
                placeholder="What do they love about it?"
              />
            </div>
          ))}
          {inspirationSites.length < 3 && (
            <Button variant="outline" size="sm" onClick={() => setInspirationSites([...inspirationSites, { url: "", notes: "" }])} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Add another website
            </Button>
          )}
        </div>
        <Separator className="my-4" />
        <div>
          <Label>Their Instagram handle</Label>
          <p className="text-xs text-muted-foreground mb-2">Pull their Instagram to get a feel for their vibe and aesthetic</p>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">@</span>
            <Input
              value={instagramHandle}
              onChange={(e) => { setInstagramHandle(e.target.value.replace(/^@/, "")); triggerAutoSave(); }}
              placeholder="username"
            />
          </div>
          {instagramHandle && (
            <p className="text-xs text-primary mt-2">✓ Check their Instagram before building — their grid tells you everything about their brand</p>
          )}
        </div>
      </FormSection>

      {/* Section 4 — How Customers Find Them */}
      <FormSection title="How Customers Find Them">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label>What do people search on Google to find them?</Label>
            <MicButton field="googleSearch" getter={() => googleSearchTerms} setter={setGoogleSearchTerms} />
          </div>
          <p className="text-xs text-muted-foreground mb-2">Their exact words — this tells you their keywords, their customer's language</p>
          <Textarea
            value={googleSearchTerms}
            onChange={(e) => { setGoogleSearchTerms(e.target.value); triggerAutoSave(); }}
            rows={4}
            placeholder="e.g. They said people search 'emergency plumber Phoenix', '24 hour plumber near me', 'water heater replacement Phoenix'..."
          />
        </div>
      </FormSection>

      {/* Section 5 — Website Goal */}
      <FormSection title="Website Goal">
        <div>
          <Label>What is the primary goal of this website?</Label>
          <p className="text-xs text-muted-foreground mb-3">This changes everything about how the site is structured</p>
          <RadioGroup value={websiteGoal} onValueChange={(v) => { setWebsiteGoal(v); triggerAutoSave(); }} className="space-y-2">
            {WEBSITE_GOALS.map((g) => (
              <div key={g.value} className="flex items-start gap-2">
                <RadioGroupItem value={g.value} id={`goal-${g.value}`} className="mt-0.5" />
                <label htmlFor={`goal-${g.value}`} className="text-sm cursor-pointer leading-tight">{g.label}</label>
              </div>
            ))}
          </RadioGroup>
          {websiteGoal === "other" && (
            <Input
              value={websiteGoalOther}
              onChange={(e) => { setWebsiteGoalOther(e.target.value); triggerAutoSave(); }}
              placeholder="Describe their goal..."
              className="mt-2"
            />
          )}
        </div>
        <Separator className="my-4" />
        <div>
          <Label>How do they want people to contact them?</Label>
          <p className="text-xs text-muted-foreground mb-3">Select all that apply</p>
          <div className="space-y-2">
            {CONTACT_OPTIONS.map((opt) => (
              <div key={opt.value} className="flex items-start gap-2">
                <Checkbox
                  id={`contact-${opt.value}`}
                  checked={contactPreferences.includes(opt.value)}
                  onCheckedChange={(checked) => {
                    const updated = checked
                      ? [...contactPreferences, opt.value]
                      : contactPreferences.filter(v => v !== opt.value);
                    setContactPreferences(updated);
                    triggerAutoSave();
                  }}
                  className="mt-0.5"
                />
                <label htmlFor={`contact-${opt.value}`} className="text-sm cursor-pointer leading-tight">{opt.label}</label>
              </div>
            ))}
          </div>
          {contactPreferences.includes("booking") && (
            <div className="mt-3">
              <Label className="text-xs">Booking URL</Label>
              <Input
                value={bookingUrl}
                onChange={(e) => { setBookingUrl(e.target.value); triggerAutoSave(); }}
                placeholder="https://calendly.com/..."
                className="mt-1"
              />
            </div>
          )}
        </div>
      </FormSection>

      {/* Section 6 — Pages */}
      <FormSection title="Pages We Agreed On">
        <div>
          <Label>Pages decided on during the call</Label>
          <p className="text-xs text-muted-foreground mb-3">List every page — this overrides the client's page selection in their intake form</p>
          {pagesAgreed.map((page, i) => (
            <div key={i} className="flex gap-2 mb-3">
              <div className="flex-1 space-y-1.5">
                <Input
                  value={page.name}
                  onChange={(e) => {
                    const updated = [...pagesAgreed];
                    updated[i] = { ...updated[i], name: e.target.value };
                    setPagesAgreed(updated);
                    triggerAutoSave();
                  }}
                  placeholder="e.g. Home, About, Services..."
                />
                <Textarea
                  value={page.description}
                  onChange={(e) => {
                    const updated = [...pagesAgreed];
                    updated[i] = { ...updated[i], description: e.target.value };
                    setPagesAgreed(updated);
                    triggerAutoSave();
                  }}
                  rows={2}
                  placeholder="What goes on this page..."
                />
              </div>
              {pagesAgreed.length > 1 && (
                <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground h-10 w-10" onClick={() => {
                  setPagesAgreed(pagesAgreed.filter((_, j) => j !== i));
                  triggerAutoSave();
                }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {pagesAgreed.length < 10 && (
            <Button variant="outline" size="sm" onClick={() => setPagesAgreed([...pagesAgreed, { name: "", description: "" }])} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Add page
            </Button>
          )}
          <p className="text-xs text-muted-foreground mt-3">Standard pages automatically included — Home, About, Services, Contact. Add extras above.</p>
        </div>
      </FormSection>

      {/* Section 7 — Design Direction */}
      <FormSection title="Design Direction">
        <div>
          <Label>Template selected on call</Label>
          <p className="text-xs text-muted-foreground mb-3">Which template did the client choose?</p>
          <div className="grid grid-cols-1 gap-2">
            {TEMPLATE_OPTIONS.map((t) => (
              <div
                key={t.id}
                onClick={() => { setTemplateSelected(t.id); triggerAutoSave(); }}
                className={`border rounded-lg p-3 cursor-pointer transition-all ${templateSelected === t.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/40"}`}
              >
                <p className="font-medium text-sm">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.desc}</p>
              </div>
            ))}
          </div>
          {!templateSelected && <p className="text-xs text-muted-foreground mt-2">Client will select from intake form</p>}
        </div>
        <Separator className="my-4" />
        <div>
          <Label>Color direction</Label>
          <p className="text-xs text-muted-foreground mb-2">Any color preferences or direction from the call</p>
          <Textarea
            value={colorDirection}
            onChange={(e) => { setColorDirection(e.target.value); triggerAutoSave(); }}
            rows={3}
            placeholder="e.g. They specifically said they hate blue, their work trucks are red and black so those are their brand colors..."
          />
        </div>
        <div>
          <Label>Vibe and aesthetic notes</Label>
          <p className="text-xs text-muted-foreground mb-2">Your read on their brand after seeing their Instagram and talking to them</p>
          <Textarea
            value={vibeNotes}
            onChange={(e) => { setVibeNotes(e.target.value); triggerAutoSave(); }}
            rows={3}
            placeholder="e.g. Very masculine trade business, no-nonsense, blue collar pride, dark and bold will work perfectly..."
          />
        </div>
        <div>
          <Label>How they communicate — their tone of voice</Label>
          <p className="text-xs text-muted-foreground mb-3">How did they actually talk on the call? Claude will match this in the copy.</p>
          <RadioGroup value={toneOfVoice} onValueChange={(v) => { setToneOfVoice(v); triggerAutoSave(); }} className="space-y-2">
            {TONE_OPTIONS.map((t) => (
              <div key={t.value} className="flex items-start gap-2">
                <RadioGroupItem value={t.value} id={`tone-${t.value}`} className="mt-0.5" />
                <label htmlFor={`tone-${t.value}`} className="text-sm cursor-pointer leading-tight">{t.label}</label>
              </div>
            ))}
          </RadioGroup>
          {toneOfVoice === "custom" && (
            <Textarea
              value={toneCustom}
              onChange={(e) => { setToneCustom(e.target.value); triggerAutoSave(); }}
              rows={2}
              placeholder="Describe their tone..."
              className="mt-2"
            />
          )}
        </div>
      </FormSection>

      {/* Section 8 — Expert Recommendations */}
      <div className="border-l-4 border-primary bg-primary/5 rounded-r-xl p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-primary">Your expert recommendations ♛</h3>
          <p className="text-sm text-muted-foreground mt-1">
            This is where your expertise gets encoded into Claude's output. Tell Claude what this website needs that the client didn't think to mention.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label>What should Claude ADD that the client didn't mention?</Label>
            <MicButton field="expertAdditions" getter={() => expertAdditions} setter={setExpertAdditions} />
          </div>
          <p className="text-xs text-muted-foreground mb-2">Think about what great websites in this industry always have.</p>
          <Textarea
            value={expertAdditions}
            onChange={(e) => { setExpertAdditions(e.target.value); triggerAutoSave(); }}
            rows={8}
            className="resize-y"
            placeholder={`Tell Claude what to include beyond what the client said. Examples:\n— They have a 5 step process — create a visual how it works section\n— They mentioned they're licensed and insured — make credentials prominent\n— They have 200+ Google reviews — showcase social proof aggressively\n— They do emergency services — create an emergency callout banner\n— They've been in business 22 years — use throughout for credibility\n— They offer free estimates — make this a CTA button\n— Their photos are professional quality — use large hero imagery\n— They work with residential and commercial — create two pathways`}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label>What should Claude NOT do?</Label>
            <MicButton field="expertAvoid" getter={() => expertAvoid} setter={setExpertAvoid} />
          </div>
          <p className="text-xs text-muted-foreground mb-2">Avoid these mistakes for this specific client</p>
          <Textarea
            value={expertAvoid}
            onChange={(e) => { setExpertAvoid(e.target.value); triggerAutoSave(); }}
            rows={4}
            placeholder="e.g. Don't use corporate language — they're a family business. Don't make it look feminine — this is a male-dominated trade. Don't focus on price — they're premium..."
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label>Exact phrases from the call to use in the copy</Label>
            <MicButton field="exactPhrases" getter={() => exactPhrases} setter={setExactPhrases} />
          </div>
          <p className="text-xs text-muted-foreground mb-2">Words they actually said that should appear in headlines and copy</p>
          <Textarea
            value={exactPhrases}
            onChange={(e) => { setExactPhrases(e.target.value); triggerAutoSave(); }}
            rows={3}
            placeholder={`e.g. They kept saying 'we show up when we say we will' — use as tagline. They said 'we treat your home like it's our own' — use in about section.`}
          />
        </div>
      </div>

      {/* Section 9 — Final Notes */}
      <FormSection title="Final Notes">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label>Anything else Claude needs to know?</Label>
            <MicButton field="finalNotes" getter={() => finalNotes} setter={setFinalNotes} />
          </div>
          <Textarea
            value={finalNotes}
            onChange={(e) => { setFinalNotes(e.target.value); triggerAutoSave(); }}
            rows={4}
            placeholder="Any other context, nuances, or instructions for Claude..."
          />
        </div>
        <div>
          <Label>Internal notes — not sent to Claude</Label>
          <p className="text-xs text-muted-foreground mb-2">Private notes for your records only</p>
          <Textarea
            value={internalNotes}
            onChange={(e) => { setInternalNotes(e.target.value); triggerAutoSave(); }}
            rows={3}
            className="bg-muted/50 italic"
            placeholder="e.g. Client seemed hesitant about the 12 month commitment — follow up in a week..."
          />
        </div>
      </FormSection>

      {/* Complete button */}
      <Button
        onClick={handleComplete}
        disabled={completing}
        className="w-full gap-2 h-12 text-base"
        size="lg"
      >
        {completing ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
        Mark call notes as complete and ready to build ♛
      </Button>

      {/* Status messages */}
      {applicationData?.status === "converted" && (
        <p className="text-sm text-emerald-600 text-center">
          ✓ Application converted — call notes will be used when generating the website
        </p>
      )}
      {applicationData?.status !== "converted" && (
        <p className="text-sm text-muted-foreground text-center">
          Call notes will be used alongside the intake form when the website is generated after conversion
        </p>
      )}
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
      <Separator />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  );
}
