import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { format } from "date-fns";
import { CheckCircle2, CreditCard, Crown, Download } from "lucide-react";
import { useState } from "react";
import { BuyCreditsModal } from "@/components/client/BuyCreditsModal";
import { useQueryClient } from "@tanstack/react-query";

const plans = [
  {
    name: "Starter",
    key: "starter",
    price: "$79/mo",
    credits: "10/mo",
    rollover: "up to 20",
    backups: "Monthly",
    security: "Basic",
    branding: "—",
    support: "Standard",
  },
  {
    name: "Growth",
    key: "growth",
    price: "$129/mo",
    credits: "30/mo",
    rollover: "up to 60",
    backups: "Weekly",
    security: "Advanced",
    branding: "—",
    support: "Priority",
    popular: true,
  },
  {
    name: "Pro",
    key: "pro",
    price: "$199/mo",
    credits: "100/mo",
    rollover: "up to 200",
    backups: "Daily",
    security: "Advanced",
    branding: "Included",
    support: "Dedicated",
  },
];

export default function ClientBilling() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
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

  const { data: transactions = [] } = useQuery({
    queryKey: ["my-transactions"],
    queryFn: async () => {
      if (!client) return [];
      const { data, error } = await supabase
        .from("credits_transactions")
        .select("*")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!client,
  });

  if (!client) return null;

  const planInfo = plans.find((p) => p.key === client.plan) || plans[0];
  const nextResetDate = client.credits_last_reset
    ? format(new Date(new Date(client.credits_last_reset).setMonth(new Date(client.credits_last_reset).getMonth() + 1)), "MMM d, yyyy")
    : "—";

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      <h1 className="text-xl font-bold">Billing</h1>

      {/* Current plan */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-5">
            <p className="text-xs text-muted-foreground">Current Plan</p>
            <p className="text-xl font-bold">{planInfo.name} Plan</p>
            <p className="text-muted-foreground text-sm">{planInfo.price}</p>
            <div className="flex items-center gap-1 mt-2">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              <span className="text-xs text-emerald-600">Active</span>
            </div>
            {client.next_billing_date && (
              <p className="text-xs text-muted-foreground mt-1">
                Renews {format(new Date(client.next_billing_date), "MMM d, yyyy")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <p className="text-xs text-muted-foreground">Credits</p>
            <p className="text-xl font-bold">{client.credits_balance ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              {client.credits_monthly_allowance ?? 10}/mo • Cap {client.credits_rollover_cap ?? 20}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Refresh on {nextResetDate}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <p className="text-xs text-muted-foreground">Payment Method</p>
            <div className="flex items-center gap-2 mt-1">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm">•••• •••• •••• ——</span>
            </div>
            <Button variant="outline" size="sm" className="mt-3 text-xs">
              Update payment method
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Billing history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Your billing history will appear here after your first payment
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                  <TableHead className="text-right">Balance After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx: any) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-sm">
                      {format(new Date(tx.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-sm">{tx.description || tx.transaction_type}</TableCell>
                    <TableCell className={`text-sm text-right font-medium ${tx.credits_amount > 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {tx.credits_amount > 0 ? "+" : ""}{tx.credits_amount}
                    </TableCell>
                    <TableCell className="text-sm text-right">{tx.credits_balance_after}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Plan comparison */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Compare Plans</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isCurrent = plan.key === client.plan;
              return (
                <div
                  key={plan.key}
                  className={`rounded-lg border p-4 ${isCurrent ? "border-primary bg-primary/5" : ""} ${plan.popular ? "ring-2 ring-primary" : ""}`}
                >
                  {plan.popular && (
                    <Badge className="bg-primary text-primary-foreground mb-2">Most Popular</Badge>
                  )}
                  <h3 className="font-bold text-lg">{plan.name}</h3>
                  <p className="text-2xl font-bold mt-1">{plan.price}</p>
                  <Separator className="my-3" />
                  <ul className="space-y-1.5 text-sm">
                    <li>Credits: {plan.credits}</li>
                    <li>Rollover: {plan.rollover}</li>
                    <li>Backups: {plan.backups}</li>
                    <li>Security: {plan.security}</li>
                    <li>Branding: {plan.branding}</li>
                    <li>Support: {plan.support}</li>
                  </ul>
                  {isCurrent ? (
                    <Badge variant="outline" className="w-full justify-center mt-4">Current Plan</Badge>
                  ) : (
                    <Button variant="outline" className="w-full mt-4" size="sm">
                      {plans.indexOf(plan) > plans.findIndex((p) => p.key === client.plan) ? "Upgrade" : "Downgrade"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Buy credits */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Buy Extra Credits</CardTitle>
          <CardDescription>Credits purchased never expire</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { credits: 10, price: "$15", desc: "Best for one quick fix" },
              { credits: 30, price: "$35", desc: "Best for ongoing updates" },
              { credits: 100, price: "$99", desc: "Best for heavy use" },
            ].map((pkg) => (
              <div key={pkg.credits} className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold">{pkg.credits} credits</p>
                <p className="text-lg font-semibold text-primary">{pkg.price}</p>
                <p className="text-xs text-muted-foreground mt-1">{pkg.desc}</p>
                <Button size="sm" className="mt-3 w-full" onClick={() => setShowBuyCredits(true)}>
                  Buy now
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <BuyCreditsModal
        open={showBuyCredits}
        onOpenChange={setShowBuyCredits}
        clientId={client.id}
        currentBalance={client.credits_balance ?? 0}
        currentPlan={client.plan}
        onPurchased={() => queryClient.invalidateQueries({ queryKey: ["my-client"] })}
      />

      {/* Cancellation */}
      <div className="text-center text-sm text-muted-foreground pb-8">
        Need to cancel?{" "}
        <button className="text-primary hover:underline">
          We're sorry to see you go
        </button>
      </div>
    </div>
  );
}
