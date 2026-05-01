import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { sanitizeInput } from "@/lib/sanitize";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  ApplicationFormData,
  initialFormData,
  calculateScore,
  checkInstantDecline,
  checkFlags,
  mapSupportToPlan,
  STEP_LABELS,
} from "@/components/apply/types";
import IntroScreen from "@/components/apply/IntroScreen";
import StepBusiness from "@/components/apply/StepBusiness";
import StepCustomers from "@/components/apply/StepCustomers";
import StepVision from "@/components/apply/StepVision";
import StepConnect from "@/components/apply/StepConnect";
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
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showIntro, setShowIntro] = useState(true);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<ApplicationFormData>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const update = (field: string, value: any) => setForm((p) => ({ ...p, [field]: value }));

  const validateStep = (): string | null => {
    switch (step) {
      case 1:
        if (!form.business_type) return "Please tell us what kind of business you're running.";
        if (!form.business_name.trim()) return "Please enter your business name.";
        if (!form.industry) return "Please select your industry.";
        if (!form.city.trim() || !form.state_province.trim() || !form.country.trim()) return "Please fill out your location.";
        return null;
      case 2:
        if (!form.ideal_customer.trim()) return "Tell us a bit about your ideal customer.";
        if (!form.google_search_terms.trim()) return "Tell us what people search on Google to find you.";
        return null;
      case 3:
        if (!form.website_goal || form.website_goal.length === 0) return "Please pick at least one goal for your website.";
        if (!form.has_logo) return "Let us know about your logo.";
        if (!form.support_level) return "Pick the level of support you're looking for.";
        if (!form.readiness) return "Let us know when you'd like to get started.";
        return null;
      case 4:
        if (!form.name.trim()) return "Please enter your full name.";
        if (!form.email.trim()) return "Please enter your email address.";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Please enter a valid email address.";
        if (!form.phone.trim()) return "Please enter your phone number.";
        if (!form.referral_source) return "Let us know how you heard about SiteQueen.";
        return null;
      default:
        return null;
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNext = () => {
    const error = validateStep();
    if (error) {
      toast({ title: "Hold on", description: error, variant: "destructive" });
      return;
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
    scrollToTop();
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 1));
    scrollToTop();
  };

  const submitDecline = async (reason: string) => {
    try {
      await anonClient.from("applications").insert([{
        business_type: form.business_type || "unknown",
        business_name: sanitizeInput(form.business_name) || "Declined",
        industry: form.industry || null,
        has_website: null,
        city: sanitizeInput(form.city) || null,
        state_province: sanitizeInput(form.state_province) || null,
        country: sanitizeInput(form.country) || null,
        city_state: [form.city, form.state_province].filter(Boolean).map(sanitizeInput).join(", "),
        ideal_customer: sanitizeInput(form.ideal_customer) || null,
        google_search_terms: sanitizeInput(form.google_search_terms) || null,
        website_goal: form.website_goal.length > 0 ? form.website_goal.join(", ") : null,
        has_logo: form.has_logo || null,
        support_level: form.support_level || null,
        readiness: form.readiness || null,
        anything_else: sanitizeInput(form.anything_else) || null,
        business_instagram: sanitizeInput(form.business_instagram) || null,
        business_facebook: sanitizeInput(form.business_facebook) || null,
        referral_source: form.referral_source || null,
        restricted_niches: form.restricted_niches.join(", "),
        name: sanitizeInput(form.name) || "Declined Applicant",
        email: sanitizeInput(form.email) || "declined@placeholder.com",
        phone: sanitizeInput(form.phone) || null,
        status: "declined",
        decline_reason: reason,
        ai_score: 0,
        lead_temperature: "COLD",
      }]);

      if (form.email) {
        supabase.functions.invoke("send-email", {
          body: { to: form.email, template: "application_declined", data: { name: form.name || "there" } },
        }).catch(console.error);
      }
    } catch (e) {
      console.error("Decline submission error:", e);
    }
  };

  const handleSubmit = async () => {
    const error = validateStep();
    if (error) {
      toast({ title: "Hold on", description: error, variant: "destructive" });
      return;
    }

    setLoading(true);

    // Rate limit check
    const rl = checkRateLimit("apply_form", 3, 60 * 60 * 1000);
    if (!rl.allowed) {
      toast({ title: "Too many applications", description: "Please try again later.", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Instant decline check (silent — doesn't reveal reasons)
    const declineReason = checkInstantDecline(form);
    if (declineReason) {
      await submitDecline(declineReason);
      setDeclined(true);
      setLoading(false);
      return;
    }

    try {
      const { score, temperature } = calculateScore(form);
      const flags = checkFlags(form);
      const isAutoApproved = flags.length === 0;
      const status = isAutoApproved ? "approved" : "needs_review";

      const applicationId = crypto.randomUUID();
      const bookingUrl = `${window.location.origin}/book-call?name=${encodeURIComponent(form.name)}`;
      const niches = form.restricted_niches.filter((n) => n !== "None of the above");

      const { error: insertError } = await anonClient.from("applications").insert([{
        id: applicationId,
        business_type: sanitizeInput(form.business_type),
        business_name: sanitizeInput(form.business_name),
        industry: sanitizeInput(form.industry),
        city: sanitizeInput(form.city),
        state_province: sanitizeInput(form.state_province),
        country: sanitizeInput(form.country),
        city_state: [form.city, form.state_province].filter(Boolean).map(sanitizeInput).join(", "),
        business_instagram: sanitizeInput(form.business_instagram) || null,
        business_facebook: sanitizeInput(form.business_facebook) || null,
        ideal_customer: sanitizeInput(form.ideal_customer),
        google_search_terms: sanitizeInput(form.google_search_terms),
        website_goal: form.website_goal.join(", "),
        has_logo: form.has_logo,
        logo_addon_requested: form.has_logo === "want_addon",
        support_level: form.support_level,
        plan_interest: mapSupportToPlan(form.support_level),
        readiness: form.readiness,
        restricted_niches: niches.length > 0 ? niches.join(", ") : "None",
        anything_else: sanitizeInput(form.anything_else) || null,
        name: sanitizeInput(form.name),
        email: sanitizeInput(form.email),
        phone: sanitizeInput(form.phone),
        referral_source: form.referral_source,
        ai_score: score,
        lead_temperature: temperature,
        status,
        notes: flags.length > 0 ? `FLAGS: ${flags.join(", ")}` : null,
      }]);

      if (insertError) {
        console.error(insertError);
        toast({ title: "Error", description: insertError.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      // Trigger AI scoring
      supabase.functions.invoke("score-lead", { body: { applicationId } }).catch(console.error);

      // Operator notification
      supabase.functions.invoke("send-email", {
        body: {
          to: "hello@sitequeen.ai",
          template: temperature === "HOT" ? "operator_hot_lead" : "operator_new_application",
          data: {
            business_name: form.business_name,
            business_type: form.business_type,
            score,
            temperature,
            plan_interest: mapSupportToPlan(form.support_level),
            applicant_name: form.name,
            applicant_email: form.email,
            phone: form.phone,
          },
          applicationId,
        },
      }).catch(console.error);

      if (isAutoApproved) {
        supabase.functions.invoke("send-email", {
          body: {
            to: form.email,
            template: "hot_auto_approved",
            data: {
              name: form.name,
              first_name: form.name.split(" ")[0],
              business_name: form.business_name,
              booking_url: bookingUrl,
            },
            applicationId,
          },
        }).catch(console.error);

        navigate(`/book-call?name=${encodeURIComponent(form.name)}`);
      } else {
        supabase.functions.invoke("send-email", {
          body: {
            to: form.email,
            template: "application_received",
            data: {
              name: form.name,
              first_name: form.name.split(" ")[0],
              business_name: form.business_name,
            },
            applicationId,
          },
        }).catch(console.error);

        setSubmitted(true);
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    }

    setLoading(false);
  };

  if (declined) return <DeclineScreen />;
  if (submitted) return <SuccessScreen name={form.name} email={form.email} />;
  if (showIntro) return <IntroScreen onStart={() => setShowIntro(false)} />;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-muted-foreground">
              Step {step} of {TOTAL_STEPS}
            </p>
            <p className="text-sm text-muted-foreground">{STEP_LABELS[step - 1]}</p>
          </div>
          <Progress value={(step / TOTAL_STEPS) * 100} className="h-2" />
        </div>
      </div>

      {/* Form content */}
      <div className="max-w-2xl mx-auto px-4 py-8 pb-32">
        <div className="transition-opacity duration-300">
          {step === 1 && <StepBusiness form={form} update={update} />}
          {step === 2 && <StepCustomers form={form} update={update} />}
          {step === 3 && <StepVision form={form} update={update} />}
          {step === 4 && <StepConnect form={form} update={update} />}
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
            <div className="flex flex-col items-end gap-1">
              <Button onClick={handleSubmit} disabled={loading} className="gap-2">
                {loading ? "Submitting..." : <>Submit my application ♛ <Send className="w-4 h-4" /></>}
              </Button>
              <p className="text-xs text-muted-foreground">We review every application personally and will be in touch within 24 hours. ♛</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
