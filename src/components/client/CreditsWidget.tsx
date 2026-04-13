import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Crown, Coins } from "lucide-react";

interface CreditsWidgetProps {
  balance: number;
  monthlyAllowance: number;
  rolloverCap: number;
  lastReset: string | null;
  onBuyCredits: () => void;
}

export function CreditsWidget({ balance, monthlyAllowance, rolloverCap, lastReset, onBuyCredits }: CreditsWidgetProps) {
  const usedThisMonth = Math.max(monthlyAllowance - balance, 0);
  const usedPercent = monthlyAllowance > 0 ? Math.min((usedThisMonth / monthlyAllowance) * 100, 100) : 0;

  const nextReset = lastReset
    ? new Date(new Date(lastReset).setMonth(new Date(lastReset).getMonth() + 1))
    : new Date(new Date().setMonth(new Date().getMonth() + 1));

  const rolloverCredits = Math.max(balance - monthlyAllowance, 0);

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Coins className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-3xl font-bold">{balance}</p>
              <p className="text-sm text-muted-foreground">credits remaining</p>
            </div>
          </div>
          <Button onClick={onBuyCredits} size="sm" className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5">
            <Crown className="h-3.5 w-3.5" /> Buy more
          </Button>
        </div>
        <Progress value={100 - usedPercent} className="h-2.5 mb-2" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{balance} of {monthlyAllowance} credits remaining this month</span>
          {rolloverCredits > 0 && <span>+{rolloverCredits} rolled over</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Credits refresh on {nextReset.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
        </p>
      </CardContent>
    </Card>
  );
}
