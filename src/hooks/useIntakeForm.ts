import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { IntakeData } from "@/components/intake/types";

export function useIntakeForm(clientId: string | undefined) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [localData, setLocalData] = useState<IntakeData>({});
  const [initialized, setInitialized] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const localDataRef = useRef<IntakeData>({});

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

  // Initialize local data from DB once
  useEffect(() => {
    if (siteRecord && !initialized) {
      const dbData = (siteRecord.intake_data as IntakeData) || {};
      setLocalData(dbData);
      localDataRef.current = dbData;
      setInitialized(true);
    }
  }, [siteRecord, initialized]);

  const currentStep = localData.current_step ?? 1;

  const persistToDb = useCallback(
    async (data: IntakeData) => {
      if (!clientId) return;
      setSaving(true);
      try {
        if (siteRecord) {
          await supabase
            .from("sites")
            .update({ intake_data: data as any, last_updated: new Date().toISOString() })
            .eq("id", siteRecord.id);
        } else {
          await supabase.from("sites").insert({
            client_id: clientId,
            intake_data: data as any,
          });
          queryClient.invalidateQueries({ queryKey: ["intake-site", clientId] });
        }
        setLastSaved(new Date());
      } catch (e) {
        console.error("Save failed:", e);
        toast.error("Failed to save progress");
      } finally {
        setSaving(false);
      }
    },
    [clientId, siteRecord, queryClient]
  );

  const updateData = useCallback(
    (updates: Partial<IntakeData>) => {
      const merged = { ...localDataRef.current, ...updates };
      setLocalData(merged);
      localDataRef.current = merged;

      // Debounced save to DB
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => persistToDb(merged), 2000);
    },
    [persistToDb]
  );

  const immediateSave = useCallback(
    (updates: Partial<IntakeData>) => {
      const merged = { ...localDataRef.current, ...updates };
      setLocalData(merged);
      localDataRef.current = merged;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      persistToDb(merged);
    },
    [persistToDb]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const setStep = useCallback(
    (step: number) => {
      immediateSave({ current_step: step });
    },
    [immediateSave]
  );

  const completedStepsCount = (localData.completed_steps || []).length;
  const progressPercent = Math.round((completedStepsCount / 9) * 100);

  return {
    intakeData: localData,
    currentStep,
    setStep,
    saveData: immediateSave,
    debouncedSave: updateData,
    saving,
    lastSaved,
    isLoading,
    progressPercent,
    siteRecord,
  };
}
