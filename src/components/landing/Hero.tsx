import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-accent/5 py-20 md:py-32">
      <div className="container mx-auto px-4 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-6">
          <Sparkles className="h-4 w-4" />
          Done-for-you websites for local businesses
        </div>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-foreground max-w-4xl mx-auto leading-tight">
          Your Dream Website,{" "}
          <span className="text-primary">Built & Managed</span>{" "}
          For You
        </h1>
        <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Stop struggling with DIY website builders. We design, build, and maintain your professional website — so you can focus on running your business.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button asChild size="lg" className="text-lg px-8 py-6 rounded-full">
            <Link to="/apply">
              Apply Now <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="text-lg px-8 py-6 rounded-full">
            <a href="#pricing">View Pricing</a>
          </Button>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          No contracts • Cancel anytime • Live in 48 hours
        </p>
      </div>
      {/* Decorative blobs */}
      <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
    </section>
  );
}
