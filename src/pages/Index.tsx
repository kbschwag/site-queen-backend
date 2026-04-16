import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Pricing } from "@/components/landing/Pricing";
import { Testimonials } from "@/components/landing/Testimonials";
import { CTA } from "@/components/landing/CTA";
import { Footer } from "@/components/landing/Footer";
import { BetaTesterBanner } from "@/components/landing/BetaTesterBanner";
import { BetaTesterGuide } from "@/components/landing/BetaTesterGuide";

// Toggle this single flag to false at public launch to remove all beta tester UI.
const BETA_MODE = true;

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      {BETA_MODE && <BetaTesterBanner />}
      <Navbar />
      <Hero />
      <HowItWorks />
      {BETA_MODE && <BetaTesterGuide />}
      <Pricing />
      <Testimonials />
      <CTA />
      <Footer />
    </div>
  );
}
