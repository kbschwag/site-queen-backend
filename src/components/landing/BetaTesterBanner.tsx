import { useEffect, useState } from "react";
import { Crown, X } from "lucide-react";

const STORAGE_KEY = "sq_beta_banner_dismissed_v1";

export function BetaTesterBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  return (
    <div className="w-full bg-amber-200 text-amber-950 border-b border-amber-300">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Crown className="w-4 h-4 shrink-0" />
          <p>
            <span className="font-semibold">You're a SiteQueen beta tester</span> — thank you for helping us launch.{" "}
            <a href="#beta-guide" className="underline underline-offset-2 font-semibold hover:text-amber-800">
              Read our tester guide below
            </a>{" "}
            before applying.
          </p>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/10 hover:bg-amber-950/20 text-xs font-semibold transition-colors"
          aria-label="Dismiss banner"
        >
          Got it <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
