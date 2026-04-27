import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, Crown, Sparkles, Heart } from "lucide-react";
import heroImg from "@/assets/website-queen-hero.jpg";

const benefits = [
  "Professional website built completely free in ~48 hours — fully done-for-you, no DIY.",
  "$39/month founder rate — locked in for life, this price will never increase for you.",
  "Full access to the SiteQueen platform plus ongoing monthly maintenance.",
];

const steps = [
  { n: "1", title: "Apply below", desc: "Tell us about your business in a quick form." },
  { n: "2", title: "I review personally", desc: "I read every application myself." },
  { n: "3", title: "15-min discovery call", desc: "We chat about your vision." },
  { n: "4", title: "We build & launch", desc: "Your site goes live in ~48 hours." },
];

const tiers = [
  { name: "Starter", price: "$79" },
  { name: "Growth", price: "$129" },
  { name: "Pro", price: "$199" },
];

export function BetaLanding() {
  return (
    <div className="min-h-screen bg-[#FBF7FB] text-[#2C1F3D]">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-purple-100 bg-[#FBF7FB]/90 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold text-lg">
            <Crown className="h-5 w-5 text-[#9B7EBD]" />
            <span>SiteQueen</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/login" className="text-[#5B4B7A] hover:text-[#2C1F3D] transition-colors">
              Login
            </Link>
            <Button
              asChild
              size="sm"
              className="rounded-full bg-[#7C5DB8] hover:bg-[#6A4DA6] text-white shadow-sm"
            >
              <Link to="/apply">Apply</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-[#E9D5F5]/50 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-[#F5E9D6]/50 blur-3xl" />
        <div className="container mx-auto px-4 py-16 md:py-24 text-center relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#D4B896]/40 bg-[#F5E9D6]/50 px-3 py-1 text-xs font-medium text-[#8A6A2E] mb-5">
            <Sparkles className="h-3.5 w-3.5" />
            Beta launch — limited spots
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-medium leading-tight tracking-tight text-[#2C1F3D]">
            You're one of the first.
          </h1>
          <p className="mt-5 text-lg text-[#5B4B7A] leading-relaxed max-w-xl mx-auto">
            Join SiteQueen as a Beta Tester and get a professional website
            built for free + special founder pricing.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-[#7C5DB8] hover:bg-[#6A4DA6] text-white text-base px-8 py-6 shadow-lg shadow-[#7C5DB8]/20 ring-1 ring-[#D4B896]/40"
            >
              <Link to="/apply">
                Apply to Become a Beta Tester
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <p className="text-xs text-[#8A7AA0]">
              Limited to 8 serious small business owners
            </p>
          </div>
        </div>
      </section>

      {/* Beta Offer */}
      <section className="py-16 md:py-20 bg-white border-y border-purple-100">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="font-serif text-3xl md:text-4xl font-medium text-[#2C1F3D]">
              What Beta Testers Get
            </h2>
            <div className="mx-auto mt-4 h-px w-12 bg-[#C9A961]" />
          </div>
          <div className="mt-12 grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {benefits.map((b, i) => (
              <div
                key={i}
                className="rounded-2xl bg-[#FBF7FB] border border-purple-100 p-7 text-center"
              >
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#7C5DB8] text-white mb-4">
                  <Check className="h-5 w-5" />
                </div>
                <p className="text-[#3D2F52] leading-relaxed">{b}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-sm text-[#8A7AA0] italic max-w-xl mx-auto">
            In return, we ask for honest feedback and a short video testimonial after launch.
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="font-serif text-3xl md:text-4xl font-medium text-[#2C1F3D]">
              How It Works
            </h2>
            <div className="mx-auto mt-4 h-px w-12 bg-[#C9A961]" />
          </div>
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {steps.map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white border border-[#D4B896]/40 text-[#7C5DB8] font-serif text-2xl shadow-sm">
                  {s.n}
                </div>
                <h3 className="mt-4 font-serif text-xl text-[#2C1F3D]">{s.title}</h3>
                <p className="mt-1 text-sm text-[#5B4B7A]">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 md:py-20 bg-gradient-to-b from-[#F5EEFB] to-[#FBF7FB]">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="font-serif text-3xl md:text-4xl font-medium text-[#2C1F3D]">
              Pricing
            </h2>
            <div className="mx-auto mt-4 h-px w-12 bg-[#C9A961]" />
            <p className="mt-4 text-[#5B4B7A]">
              Standard plans are shown below — but as a beta tester, you skip them entirely.
            </p>
          </div>

          {/* Standard tiers — faded */}
          <div className="mt-10 grid grid-cols-3 gap-3 sm:gap-6 max-w-3xl mx-auto opacity-50">
            {tiers.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-purple-100 bg-white/60 p-4 sm:p-6 text-center"
              >
                <div className="text-sm text-[#5B4B7A]">{t.name}</div>
                <div className="mt-1 font-serif text-xl sm:text-2xl text-[#2C1F3D] line-through decoration-[#9B7EBD]/60">
                  {t.price}
                </div>
                <div className="text-xs text-[#8A7AA0]">/month</div>
              </div>
            ))}
          </div>

          {/* Beta highlight */}
          <div className="mt-8 max-w-2xl mx-auto">
            <div className="relative rounded-3xl bg-white border-2 border-[#C9A961] p-8 sm:p-10 text-center shadow-xl shadow-[#C9A961]/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#C9A961] px-4 py-1 text-xs font-semibold text-white tracking-wide">
                Beta Tester Rate
              </div>
              <p className="font-serif text-xl text-[#5B4B7A]">As a Beta Tester →</p>
              <div className="mt-3 flex items-baseline justify-center gap-1">
                <span className="font-serif text-5xl sm:text-6xl font-semibold text-[#7C5DB8]">
                  $39
                </span>
                <span className="text-[#5B4B7A]">/month</span>
              </div>
              <p className="mt-3 text-sm text-[#8A7AA0]">
                This special rate is locked in for life for our first beta users.
              </p>
              <Button
                asChild
                size="lg"
                className="mt-6 rounded-full bg-[#7C5DB8] hover:bg-[#6A4DA6] text-white px-8"
              >
                <Link to="/apply">
                  Claim My Founder Rate <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Founder note + final CTA */}
      <section className="py-16 md:py-20 bg-[#2C1F3D] text-white">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <Heart className="h-6 w-6 text-[#C9A961] mx-auto" />
          <p className="mt-5 font-serif text-xl sm:text-2xl italic leading-relaxed text-[#F5EEFB]">
            "Hi, I'm the Website Queen. I'm personally building the first few sites
            and want your real feedback to make SiteQueen amazing."
          </p>
          <Button
            asChild
            size="lg"
            className="mt-10 rounded-full bg-[#C9A961] hover:bg-[#B5964F] text-[#2C1F3D] font-semibold text-base px-8 py-6 shadow-lg"
          >
            <Link to="/apply">
              Apply to Join the Beta <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="py-8 text-center text-sm text-[#8A7AA0] bg-[#FBF7FB]">
        <div className="flex items-center justify-center gap-2">
          <Crown className="h-4 w-4 text-[#9B7EBD]" />
          <span>SiteQueen ♛ — built with love for small businesses</span>
        </div>
      </footer>
    </div>
  );
}
