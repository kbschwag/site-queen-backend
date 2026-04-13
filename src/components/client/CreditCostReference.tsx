import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Info } from "lucide-react";
import { useState } from "react";

const categories = [
  {
    label: "Micro changes — 5 credits",
    items: "Phone number, email, hours, typo fix, address, social link",
    color: "text-emerald-600",
  },
  {
    label: "Content changes — 15 credits",
    items: "Photo swap, service update, add/remove service, about us edit, testimonial, team member info",
    color: "text-blue-600",
  },
  {
    label: "Medium changes — 30 credits",
    items: "Multiple photos, new team member, section rewrite, new full service, FAQ update, multiple sections",
    color: "text-purple-600",
  },
  {
    label: "Large changes — 60 credits",
    items: "New page section, major overhaul, new feature, navigation update",
    color: "text-orange-600",
  },
  {
    label: "Urgent surcharge — +10 credits",
    items: "Processed within 4 hours instead of 24-48 hours",
    color: "text-amber-600",
  },
  {
    label: "Not sure? — 0 credits now",
    items: "Submit and we will assess the cost before starting",
    color: "text-muted-foreground",
  },
];

export function CreditCostReference() {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-2">
        <Info className="h-4 w-4" />
        <span>Credit cost reference guide</span>
        <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="rounded-lg border bg-card p-4 space-y-3 mt-1">
          {categories.map((cat) => (
            <div key={cat.label}>
              <p className={`text-sm font-semibold ${cat.color}`}>{cat.label}</p>
              <p className="text-xs text-muted-foreground ml-2">{cat.items}</p>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
