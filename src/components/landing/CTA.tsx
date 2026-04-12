import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function CTA() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-16 md:px-16 md:py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground">
            Ready to Get Your Dream Website?
          </h2>
          <p className="mt-4 text-lg text-primary-foreground/80 max-w-xl mx-auto">
            Apply today and have your professional website live within 48 hours. No tech skills needed — we handle everything.
          </p>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="mt-8 text-lg px-8 py-6 rounded-full"
          >
            <Link to="/apply">
              Apply Now — It's Free <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
          <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-primary-foreground/10 blur-2xl" />
          <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-primary-foreground/10 blur-2xl" />
        </div>
      </div>
    </section>
  );
}
