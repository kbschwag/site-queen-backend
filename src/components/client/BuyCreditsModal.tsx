import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown, Coins, ArrowUp } from "lucide-react";
import { toast } from "sonner";

interface BuyCreditsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  currentBalance: number;
  currentPlan: string;
  onPurchased?: () => void;
}

export function BuyCreditsModal({ open, onOpenChange, clientId, currentBalance, currentPlan, onPurchased }: BuyCreditsModalProps) {
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const { data: packages = [] } = useQuery({
    queryKey: ["credit-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_packages")
        .select("*")
        .eq("active", true)
        .order("credits", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const handlePurchase = async (pkg: any) => {
    setPurchasing(pkg.id);
    try {
      // For now, add credits directly (Stripe integration to be wired later)
      const newBalance = currentBalance + pkg.credits;
      await supabase.from("clients").update({ credits_balance: newBalance } as any).eq("id", clientId);
      await supabase.from("credits_transactions").insert({
        client_id: clientId,
        transaction_type: "purchase",
        credits_amount: pkg.credits,
        credits_balance_after: newBalance,
        description: `Purchased ${pkg.name} for $${(pkg.price_cents / 100).toFixed(2)}`,
      } as any);
      toast.success(`${pkg.credits} credits added to your balance!`);
      onPurchased?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPurchasing(null);
    }
  };

  const bestFor: Record<number, string> = {
    10: "Best for one quick fix",
    30: "Best for ongoing updates",
    100: "Best for heavy monthly use",
  };

  const plans = [
    { name: "Starter", price: "$79/mo", credits: 10, rollover: 20 },
    { name: "Growth", price: "$129/mo", credits: 30, rollover: 60 },
    { name: "Pro", price: "$199/mo", credits: 100, rollover: 200 },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Coins className="h-5 w-5 text-primary" /> Buy Credits</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {packages.map((pkg: any) => (
            <Card key={pkg.id} className="text-center hover:border-primary/50 transition-colors">
              <CardContent className="pt-5 pb-4 space-y-2">
                <p className="text-2xl font-bold">{pkg.credits}</p>
                <p className="text-sm text-muted-foreground">credits</p>
                <p className="text-lg font-semibold">${(pkg.price_cents / 100).toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">{bestFor[pkg.credits] || ""}</p>
                <Button
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => handlePurchase(pkg)}
                  disabled={purchasing === pkg.id}
                >
                  {purchasing === pkg.id ? "Processing..." : "Buy now"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="border-t pt-4 mt-2">
          <p className="text-sm text-muted-foreground flex items-center gap-2 mb-3">
            <ArrowUp className="h-4 w-4" /> Or upgrade your plan for more monthly credits
          </p>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {plans.map((p) => (
              <div key={p.name} className={`rounded-lg border p-2 ${currentPlan === p.name.toLowerCase() ? "border-primary bg-primary/5" : ""}`}>
                <p className="font-semibold">{p.name}</p>
                <p className="text-muted-foreground">{p.price}</p>
                <p className="font-medium">{p.credits} credits/mo</p>
                {currentPlan === p.name.toLowerCase() && <Badge variant="outline" className="text-[10px] mt-1">Current</Badge>}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
