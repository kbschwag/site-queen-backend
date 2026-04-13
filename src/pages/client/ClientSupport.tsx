import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CreditsWidget } from "@/components/client/CreditsWidget";
import { CreditCostReference } from "@/components/client/CreditCostReference";
import { SubmitTicket } from "@/components/client/SubmitTicket";
import { MyTickets } from "@/components/client/MyTickets";
import { BuyCreditsModal } from "@/components/client/BuyCreditsModal";

export default function ClientSupport() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [supportTab, setSupportTab] = useState("submit");
  const [showBuyCredits, setShowBuyCredits] = useState(false);

  const { data: client } = useQuery({
    queryKey: ["my-client"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: changeRequests = [] } = useQuery({
    queryKey: ["my-change-requests"],
    queryFn: async () => {
      if (!client) return [];
      const { data, error } = await supabase
        .from("change_requests")
        .select("*")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!client,
  });

  if (!client) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
      <h1 className="text-xl font-bold">Support Tickets</h1>

      <CreditsWidget
        balance={client.credits_balance ?? 0}
        monthlyAllowance={client.credits_monthly_allowance ?? 10}
        rolloverCap={client.credits_rollover_cap ?? 20}
        lastReset={client.credits_last_reset}
        onBuyCredits={() => setShowBuyCredits(true)}
      />

      <CreditCostReference />

      <Tabs value={supportTab} onValueChange={setSupportTab}>
        <TabsList className="w-full">
          <TabsTrigger value="submit" className="flex-1">Submit a Request</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">My Requests ({changeRequests.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="submit" className="mt-4">
          <SubmitTicket
            clientId={client.id}
            userId={user!.id}
            creditsBalance={client.credits_balance ?? 0}
            onBuyCredits={() => setShowBuyCredits(true)}
            onSubmitted={() => {
              queryClient.invalidateQueries({ queryKey: ["my-client"] });
              queryClient.invalidateQueries({ queryKey: ["my-change-requests"] });
            }}
          />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <MyTickets changeRequests={changeRequests} clientId={client?.id} />
        </TabsContent>
      </Tabs>

      <BuyCreditsModal
        open={showBuyCredits}
        onOpenChange={setShowBuyCredits}
        clientId={client.id}
        currentBalance={client.credits_balance ?? 0}
        currentPlan={client.plan}
        onPurchased={() => queryClient.invalidateQueries({ queryKey: ["my-client"] })}
      />
    </div>
  );
}
