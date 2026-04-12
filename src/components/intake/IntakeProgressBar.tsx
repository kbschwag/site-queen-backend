import { Progress } from "@/components/ui/progress";
import { INTAKE_STEPS, TOTAL_STEPS } from "./types";
import { Check, Save } from "lucide-react";
import { format } from "date-fns";

interface IntakeProgressBarProps {
  currentStep: number;
  completedSteps: number[];
  saving: boolean;
  lastSaved: Date | null;
}

export function IntakeProgressBar({ currentStep, completedSteps, saving, lastSaved }: IntakeProgressBarProps) {
  const percent = Math.round((completedSteps.length / TOTAL_STEPS) * 100);

  return (
    <div className="sticky top-0 z-20 bg-card border-b px-4 py-3">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-primary">
              Step {currentStep} of {TOTAL_STEPS}
            </span>
            <span className="text-sm text-muted-foreground">— {INTAKE_STEPS[currentStep - 1]}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {saving ? (
              <span className="flex items-center gap-1 text-primary animate-pulse">
                <Save className="h-3 w-3" /> Saving...
              </span>
            ) : lastSaved ? (
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3 text-emerald-600" /> Saved {format(lastSaved, "h:mm a")}
              </span>
            ) : null}
          </div>
        </div>
        <Progress value={percent} className="h-2" />
        <div className="flex justify-between mt-1">
          {INTAKE_STEPS.map((name, i) => (
            <div
              key={name}
              className={`w-2 h-2 rounded-full ${
                completedSteps.includes(i + 1)
                  ? "bg-primary"
                  : i + 1 === currentStep
                  ? "bg-primary/50"
                  : "bg-muted"
              }`}
              title={name}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
