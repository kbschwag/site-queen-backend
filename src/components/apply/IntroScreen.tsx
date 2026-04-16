import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface Props {
  onStart: () => void;
}

export default function IntroScreen({ onStart }: Props) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="max-w-xl w-full text-center space-y-8">
        <div className="text-6xl mb-2">♛</div>
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight">
          Apply to work with SiteQueen ♛
        </h1>
        <div className="space-y-4 text-muted-foreground text-base sm:text-lg leading-relaxed text-left sm:text-center">
          <p>
            SiteQueen works with a limited number of businesses each month. We pour real time, expertise, and creative energy into every website we build — so we're selective about who we work with.
          </p>
          <p>
            Tell us about your business. If we think we can build something incredible together we'll be in touch within 24 hours.
          </p>
          <p className="text-foreground font-medium">
            We review every application personally. ♛
          </p>
        </div>
        <Button onClick={onStart} size="lg" className="w-full gap-2 text-base">
          Tell us about your business <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
