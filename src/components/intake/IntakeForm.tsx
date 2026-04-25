import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { IntakeProgressBar } from "./IntakeProgressBar";
import { StepBusinessBasics } from "./StepBusinessBasics";
import { StepBrand } from "./StepBrand";
import { StepStory } from "./StepStory";
import { StepServices } from "./StepServices";
import { StepPhotos } from "./StepPhotos";
import { StepSocialProof } from "./StepSocialProof";
import { StepPages } from "./StepPages";
import { StepStyle } from "./StepStyle";
import { StepFinalDetails } from "./StepFinalDetails";
import { useIntakeForm } from "@/hooks/useIntakeForm";
import { useFileUpload } from "@/hooks/useFileUpload";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Crown, Loader2 } from "lucide-react";
import { TOTAL_STEPS } from "./types";
import type { IntakeData } from "./types";
import { countIntakePhotos } from "@/lib/photo-utils";

interface Props {
  clientId: string;
  userId: string;
  plan: string;
  businessName: string;
  onComplete: () => void;
}

export function IntakeForm({ clientId, userId, plan, businessName, onComplete }: Props) {
  const { intakeData, currentStep, setStep, debouncedSave, saving, lastSaved } = useIntakeFormHook(clientId);
  // Upload under the client record id so paths match the rest of the pipeline
  // (generated-sites, deploy-to-hostinger, operator tooling all key off clientId).
  const { uploadFile, uploadMultiple, uploading } = useFileUpload(clientId);
  const [submitting, setSubmitting] = useState(false);
  const [rightsError, setRightsError] = useState(false);

  const handleChange = useCallback(
    (updates: Partial<IntakeData>) => {
      // Pass only the delta — useIntakeForm merges against its latest ref so
      // concurrent updates (e.g. two photo uploads finishing back-to-back)
      // don't clobber each other with stale snapshots.
      debouncedSave(updates);
    },
    [debouncedSave]
  );

  const markStepComplete = useCallback(
    (step: number) => {
      const completed = intakeData.completed_steps || [];
      if (!completed.includes(step)) {
        return [...completed, step];
      }
      return completed;
    },
    [intakeData]
  );

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goNext = () => {
    // Step 5 → 6: enforce photo-rights checkbox if photos were uploaded
    if (currentStep === 5) {
      const photoCount = countIntakePhotos(intakeData);
      if (photoCount > 0 && !intakeData.photo_rights_confirmed) {
        setRightsError(true);
        // scroll to the rights box for visibility
        setTimeout(() => {
          document.getElementById("photo-rights-confirm")?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 50);
        return;
      }
    }
    setRightsError(false);

    if (currentStep < TOTAL_STEPS) {
      const completed = markStepComplete(currentStep);
      debouncedSave({ ...intakeData, current_step: currentStep + 1, completed_steps: completed });
      setStep(currentStep + 1);
      scrollToTop();
    }
  };

  const goPrev = () => {
    setRightsError(false);
    if (currentStep > 1) {
      setStep(currentStep - 1);
      scrollToTop();
    }
  };

  const jumpToPhotos = () => {
    setStep(5);
    scrollToTop();
  };

  const acceptStockPhotos = () => {
    handleChange({ use_stock_photos: true });
    toast.message("Got it — we'll use professional stock photos for your build.");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const completed = markStepComplete(currentStep);
      const photoCount = countIntakePhotos(intakeData);
      const photosProvided = photoCount > 0;
      const usingStock = !photosProvided || !!intakeData.use_stock_photos;

      const finalData = { ...intakeData, completed_steps: completed, current_step: TOTAL_STEPS };

      // Save final data + photo flags
      await supabase
        .from("sites")
        .update({
          intake_data: finalData as any,
          last_updated: new Date().toISOString(),
          photos_provided: photosProvided,
          photo_count: photoCount,
          using_stock_photos: usingStock,
          photo_rights_confirmed: !!intakeData.photo_rights_confirmed,
        } as any)
        .eq("client_id", clientId);

      // Mark client as intake completed + persist brand/font/addon selections
      const clientUpdate: Record<string, any> = { intake_completed: true };
      if (intakeData.primary_color) clientUpdate.primary_color = intakeData.primary_color;
      if (intakeData.accent_color) clientUpdate.accent_color = intakeData.accent_color;
      if (intakeData.logo_addon_requested !== undefined)
        clientUpdate.logo_addon_requested = !!intakeData.logo_addon_requested;
      if (intakeData.blog_addon_requested !== undefined)
        clientUpdate.blog_addon_requested = !!intakeData.blog_addon_requested;
      if (intakeData.booking_addon_requested !== undefined)
        clientUpdate.booking_addon_requested = !!intakeData.booking_addon_requested;
      if (intakeData.font_choice_mode === "list" && intakeData.preferred_font) {
        clientUpdate.preferred_font = intakeData.preferred_font;
      }
      if (intakeData.font_choice_mode === "upload") {
        if (intakeData.custom_font_url) clientUpdate.custom_font_url = intakeData.custom_font_url;
        if (intakeData.custom_font_name) clientUpdate.custom_font_name = intakeData.custom_font_name;
      }

      await supabase
        .from("clients")
        .update(clientUpdate as any)
        .eq("id", clientId);

      // Operator notifications for add-on interest
      const addonNotifications: { type: string; message: string; client_id: string; target_role: string }[] = [];
      if (intakeData.blog_addon_requested) {
        addonNotifications.push({
          type: "addon_interest",
          target_role: "operator",
          client_id: clientId,
          message: `${businessName} is interested in Blog as an add-on — follow up after site launch`,
        });
      }
      if (intakeData.booking_addon_requested) {
        addonNotifications.push({
          type: "addon_interest",
          target_role: "operator",
          client_id: clientId,
          message: `${businessName} is interested in Booking as an add-on — follow up after site launch`,
        });
      }
      if (addonNotifications.length > 0) {
        supabase.from("notifications").insert(addonNotifications as any).then(({ error }) => {
          if (error) console.error("addon notification error:", error);
        });
      }

      // Fire and forget — trigger website generation in background
      supabase.functions.invoke("generate-website", {
        body: { client_id: clientId },
      }).catch((err) => console.error("generate-website trigger error:", err));

      // Send confirmation email
      supabase.functions.invoke("send-email", {
        body: {
          to: intakeData.business_email,
          template: "intake_completed",
          data: { business_name: businessName },
          clientId,
        },
      }).catch(console.error);

      toast.success("Website brief submitted! ♛");
      onComplete();
    } catch (e) {
      toast.error("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <IntakeProgressBar
        currentStep={currentStep}
        completedSteps={intakeData.completed_steps || []}
        saving={saving}
        lastSaved={lastSaved}
      />

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        {currentStep === 1 && <StepBusinessBasics data={intakeData} onChange={handleChange} />}
        {currentStep === 2 && <StepBrand data={intakeData} onChange={handleChange} onUpload={(f, c) => uploadFile(f, c)} uploading={uploading} plan={plan} />}
        {currentStep === 3 && <StepStory data={intakeData} onChange={handleChange} onUpload={(f, c) => uploadFile(f, c)} />}
        {currentStep === 4 && <StepServices data={intakeData} onChange={handleChange} onUpload={(f, c) => uploadFile(f, c)} />}
        {currentStep === 5 && (
          <StepPhotos
            data={intakeData}
            onChange={handleChange}
            onUpload={(f, c) => uploadFile(f, c)}
            onUploadMultiple={(f, c) => uploadMultiple(f, c)}
            rightsError={rightsError}
          />
        )}
        {currentStep === 6 && <StepSocialProof data={intakeData} onChange={handleChange} onUpload={(f, c) => uploadFile(f, c)} onUploadMultiple={(f, c) => uploadMultiple(f, c)} />}
        {currentStep === 7 && <StepPages data={intakeData} onChange={handleChange} />}
        {currentStep === 8 && <StepStyle data={intakeData} onChange={handleChange} />}
        {currentStep === 9 && (
          <StepFinalDetails
            data={intakeData}
            onChange={handleChange}
            onJumpToPhotos={jumpToPhotos}
            onAcceptStock={acceptStockPhotos}
          />
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center mt-10 pt-6 border-t">
          <Button variant="outline" onClick={goPrev} disabled={currentStep === 1} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>

          {currentStep < TOTAL_STEPS ? (
            <Button onClick={goNext} className="gap-2">
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2 bg-primary hover:bg-primary/90">
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>
              ) : (
                <><Crown className="h-4 w-4" /> Submit my website brief ♛</>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Wrapper to use the hook with proper naming
function useIntakeFormHook(clientId: string) {
  const result = useIntakeForm(clientId);
  return { ...result, immediateSave: result.saveData };
}
