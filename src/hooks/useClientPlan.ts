import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Single source of truth for the current user's plan tier.
//
// `isPremium` is an ALLOW-LIST against known free/entry tiers, not a
// single-value equality check. Any plan value that isn't null/starter/
// free/growth is treated as Premium. This means future paid tiers
// ('agency', 'enterprise', etc.) unlock Premium features automatically.
export function useClientPlan() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["my-client-plan", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, plan")
        .eq("user_id", user!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const plan = query.data?.plan ?? null;
  const clientId = query.data?.id ?? null;
  const FREE_TIERS = new Set([null, "", "starter", "free", "growth"]);
  const isPremium = !FREE_TIERS.has(plan as any);

  return {
    plan,
    clientId,
    isPremium,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
