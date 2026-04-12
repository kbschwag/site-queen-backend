import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { ApplicationFormData, initialFormData, calculateScore, checkInstantDecline, checkFlags } from "@/components/apply/types";
import StepAboutBusiness from "@/components/apply/StepAboutBusiness";
import StepBusinessHealth from "@/components/apply/StepBusinessHealth";
import StepWebsiteVision from "@/components/apply/StepWebsiteVision";
import StepCommitment from "@/components/apply/StepCommitment";
import DeclineScreen from "@/components/apply/DeclineScreen";
import SuccessScreen from "@/components/apply/SuccessScreen";
import { ArrowLeft, ArrowRight, Send } from "lucide-react";

const anonClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const TOTAL_STEPS = 4;

export default function Apply() {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<ApplicationFormData>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const update = (field: string, value: any) => setForm((p) => ({ ...p, [field]: value }));

  const validateStep = (): string | null => {
    switch (step) {
      case 1:
        if (!form.business_type) return "Please select your business type.";
        if (!form.business_name.trim()) return "Please enter your business name.";
        if (!form.industry) return "Please select your industry.";
        if (!form.has_website) return "Please tell us about your current website.";
        return null;
      case 2:
        if (!form.years_in_business) return "Please select how long you've been in business.";
        if (!form.monthly_clients) return "Please select your monthly client range.";
        if (!form.decision_maker_status) return "Please tell us about decision-making.";
        if (form.restricted_niches.length === 0) return "Please select at least one option for restricted niches.";
        if (!form.update_frequency) return "Please select your update frequency preference.";
        return null;
      case 3:
        if (!form.website_goal) return "Please select your website goal.";
        if (!form.brand_vibe) return "Please pick a brand vibe.";
        if (!form.has_logo) return "Please tell us about your logo.";
        return null;
      case 4:
        if (!form.plan_interest) return "Please select a plan.";
        if (!form.accepts_commitment) return "Please answer the commitment question.";
        if (!form.name.trim()) return "Please enter your full name.";
        if (!form.email.trim()) return "Please enter your email address.";
        if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Please enter a valid email address.";
        return null;
      default:
        return null;
    }
  };

  const handleNext = () => {
    const error = validateStep();
    if (error) {
      toast({ title: "Hold on", description: error, variant: "destructive" });
      return;
    }

    // Check instant decline after step 1
    if (step === 1) {
      const declineReason = checkInstantDecline(form);
      if (declineReason) {
        // Submit decline silently
        submitDecline(declineReason);
        setDeclined(true);
        return;
      }
    }

    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await anonClient.storage.from("application-uploads").upload(path, file);
    if (error) {
      console.error("Upload error:", error);
      return null;
    }
    const { data } = anonClient.storage.from("application-uploads").getPublicUrl(path);
    return data.publicUrl;
  };

  const submitDecline = async (reason: string) => {
    await anonClient.from("applications").insert([{
      business_type: form.business_type,
      business_name: form.business_name || "Declined - Ecommerce",
      industry: form.industry,
      has_website: form.has_website || "none",
      city_state: form.city || "",
      city: form.city,
      state_province: form.state_province,
      country: form.country,
      years_in_business: "N/A",
      monthly_clients: "N/A",
      email: "declined@placeholder.com",
      name: "Declined Applicant",
      status: "declined",
      decline_reason: reason,
      ai_score: 0,
      lead_temperature: "COLD",
    }]);

    // Send decline email if we have contact info
    if (form.email) {
      supabase.functions.invoke("send-email", {
        body: { to: form.email, template: "application_declined", data: { name: form.name || "there" } },
      }).catch(console.error);
    }
  };

  const handleSubmit = async () => {
    const error = validateStep();
    if (error) {
      toast({ title: "Hold on", description: error, variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      // Upload files
      let logoUrl: string | null = null;
      let inspirationUrls: string[] = [];

      if (form.logo_file) {
        logoUrl = await uploadFile(form.logo_file, "logos");
      }
      for (const file of form.inspiration_files) {
        const url = await uploadFile(file, "inspiration");
        if (url) inspirationUrls.push(url);
      }

      const { score, temperature } = calculateScore(form);
      const flags = checkFlags(form);
      const status = flags.length > 0 ? "needs_review" : "pending";

      const applicationId = crypto.randomUUID();

      const { error: insertError } = await anonClient.from("applications").insert([{
        id: applicationId,
        business_type: form.business_type,
        business_name: form.business_name,
        industry: form.industry,
        city: form.city,
        state_province: form.state_province,
        country: form.country,
        city_state: [form.city, form.state_province].filter(Boolean).join(", "),
        has_website: form.has_website,
        years_in_business: form.years_in_business,
        monthly_clients: form.monthly_clients,
        decision_maker_status: form.decision_maker_status,
        is_decision_maker: form.decision_maker_status === "yes",
        restricted_niches: form.restricted_niches.join(", "),
        update_frequency: form.update_frequency,
        website_goal: form.website_goal,
        brand_vibe: form.brand_vibe,
        has_logo: form.has_logo,
        logo_url: logoUrl,
        logo_file_url: logoUrl,
        inspiration_urls: inspirationUrls.join(", "),
        plan_interest: form.plan_interest,
        accepts_commitment: form.accepts_commitment,
        name: form.name,
        email: form.email,
        phone: form.phone,
        additional_notes: form.additional_notes,
        ai_score: score,
        lead_temperature: temperature,
        status,
        notes: flags.length > 0 ? `FLAGS: ${flags.join(", ")}` : null,
      }]);

      if (insertError) {
        toast({ title: "Error", description: insertError.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      // Trigger AI scoring (enhances the basic score)
      supabase.functions.invoke("score-lead", { body: { applicationId } }).catch(console.error);

      // Trigger confirmation email
      supabase.functions.invoke("send-email", {
        body: {
          to: form.email,
          template: "application_received",
          data: { name: form.name, business_name: form.business_name },
          applicationId,
        },
      }).catch(console.error);

      setSubmitted(true);
    } catch (err) {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    }

    setLoading(false);
  };

  if (declined) return <DeclineScreen />;
  if (submitted) return <SuccessScreen name={form.name} email={form.email} />;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-muted-foreground">
              Step {step} of {TOTAL_STEPS}
            </p>
            <p className="text-sm text-muted-foreground">
              {step === 1 && "About Your Business"}
              {step === 2 && "Business Health"}
              {step === 3 && "Website Vision"}
              {step === 4 && "Commitment & Contact"}
            </p>
          </div>
          <Progress value={(step / TOTAL_STEPS) * 100} className="h-2" />
        </div>
      </div>

      {/* Form content */}
      <div className="max-w-2xl mx-auto px-4 py-8 pb-32">
        <div className="transition-opacity duration-300">
          {step === 1 && <StepAboutBusiness form={form} update={update} />}
          {step === 2 && <StepBusinessHealth form={form} update={update} />}
          {step === 3 && <StepWebsiteVision form={form} update={update} />}
          {step === 4 && <StepCommitment form={form} update={update} />}
        </div>
      </div>

      {/* Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          {step > 1 ? (
            <Button variant="ghost" onClick={handleBack} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          ) : (
            <div />
          )}
          {step < TOTAL_STEPS ? (
            <Button onClick={handleNext} className="gap-2">
              Continue <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading} className="gap-2">
              {loading ? "Submitting..." : <>Submit Application <Send className="w-4 h-4" /></>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
