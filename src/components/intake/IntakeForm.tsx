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
import { ArrowLeft, ArrowRight, Crown, Loader2, Send } from "lucide-react";
import { TOTAL_STEPS } from "./types";
import type { IntakeData } from "./types";

interface Props {
  clientId: string;
  userId: string;
  plan: string;
  businessName: string;
  onComplete: () => void;
}

export function IntakeForm({ clientId, userId, plan, businessName, onComplete }: Props) {
  const { intakeData, currentStep, setStep, debouncedSave, saving, lastSaved, immediateSave } = useIntakeFormHook(clientId);
  const { uploadFile, uploadMultiple, uploading } = useFileUpload(userId);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = useCallback(
    (updates: Partial<IntakeData>) => {
      debouncedSave({ ...intakeData, ...updates });
    },
    [debouncedSave, intakeData]
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

  const goNext = () => {
    if (currentStep < TOTAL_STEPS) {
      const completed = markStepComplete(currentStep);
      debouncedSave({ ...intakeData, current_step: currentStep + 1, completed_steps: completed });
      setStep(currentStep + 1);
    }
  };

  const goPrev = () => {
    if (currentStep > 1) setStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const completed = markStepComplete(currentStep);
      const finalData = { ...intakeData, completed_steps: completed, current_step: TOTAL_STEPS };

      // Save final data
      await supabase
        .from("sites")
        .update({ intake_data: finalData as any, last_updated: new Date().toISOString() })
        .eq("client_id", clientId);

      // Mark client as intake completed
      await supabase
        .from("clients")
        .update({ intake_completed: true } as any)
        .eq("id", clientId);

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
        {currentStep === 5 && <StepPhotos data={intakeData} onChange={handleChange} onUpload={(f, c) => uploadFile(f, c)} onUploadMultiple={(f, c) => uploadMultiple(f, c)} />}
        {currentStep === 6 && <StepSocialProof data={intakeData} onChange={handleChange} onUpload={(f, c) => uploadFile(f, c)} onUploadMultiple={(f, c) => uploadMultiple(f, c)} />}
        {currentStep === 7 && <StepPages data={intakeData} onChange={handleChange} />}
        {currentStep === 8 && <StepStyle data={intakeData} onChange={handleChange} />}
        {currentStep === 9 && <StepFinalDetails data={intakeData} onChange={handleChange} />}

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
