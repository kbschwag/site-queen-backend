import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { IntakeData } from "@/components/intake/types";

export function useIntakeForm(clientId: string | undefined) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const { data: siteRecord, isLoading } = useQuery({
    queryKey: ["intake-site", clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const intakeData: IntakeData = (siteRecord?.intake_data as IntakeData) || {};
  const currentStep = intakeData.current_step ?? 1;

  const saveData = useCallback(
    async (updates: Partial<IntakeData>) => {
      if (!clientId) return;
      setSaving(true);
      try {
        const merged = { ...intakeData, ...updates };

        if (siteRecord) {
          await supabase
            .from("sites")
            .update({ intake_data: merged as any, last_updated: new Date().toISOString() })
            .eq("id", siteRecord.id);
        } else {
          await supabase.from("sites").insert({
            client_id: clientId,
            intake_data: merged as any,
          });
        }

        setLastSaved(new Date());
        queryClient.invalidateQueries({ queryKey: ["intake-site", clientId] });
      } catch (e) {
        console.error("Save failed:", e);
        toast.error("Failed to save progress");
      } finally {
        setSaving(false);
      }
    },
    [clientId, intakeData, siteRecord, queryClient]
  );

  const debouncedSave = useCallback(
    (updates: Partial<IntakeData>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => saveData(updates), 2000);
    },
    [saveData]
  );

  const immediateSave = useCallback(
    (updates: Partial<IntakeData>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      saveData(updates);
    },
    [saveData]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const setStep = useCallback(
    (step: number) => {
      immediateSave({ ...intakeData, current_step: step });
    },
    [immediateSave, intakeData]
  );

  const completedStepsCount = (intakeData.completed_steps || []).length;
  const progressPercent = Math.round((completedStepsCount / 9) * 100);

  return {
    intakeData,
    currentStep,
    setStep,
    saveData: immediateSave,
    debouncedSave,
    saving,
    lastSaved,
    isLoading,
    progressPercent,
    siteRecord,
  };
}
