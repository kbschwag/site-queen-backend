import { Crown, Camera, Sparkles, Check } from "lucide-react";

const TIPS = [
  "Tell us your real story — not the polished version. Why did you start this business? What drives you? That authenticity is what makes websites feel real.",
  "Describe your ideal customer in detail — age, situation, problem they have, what they care about. The more specific you are the better your copy will speak to them.",
  "Share what people search to find you — your exact Google keywords. This shapes your headlines, your copy, and your SEO.",
  "Tell us what makes you different — not just what you do but why you're better than the alternatives. What do your best customers say about you?",
  "Upload as many photos as you can — hero shots, work photos, team photos, before and afters, your space. We will always use real photos over stock.",
  "Share websites you love — even outside your industry. If you love the vibe of a site paste the URL. It tells us more about your aesthetic than any description could.",
  "Be specific about your services — name, description, price if you share it, who it's for. Each service gets its own card on your site.",
  "Tell us what you DON'T want — just as valuable as what you do want. Hate corporate language? Tell us. Don't want it to look feminine? Tell us. Hate blue? Tell us.",
];

const CARDS = [
  {
    icon: Crown,
    title: "How it works",
    body: "Fill out the application form and tell us about your business. If you're a good fit we'll reach out within 24 hours to schedule a quick call. After our call you'll receive a link to your personal dashboard where you complete your website brief. We build your site within 24 hours of receiving your brief and share it with you for feedback before going live.",
  },
  {
    icon: Camera,
    title: "More detail = better website",
    body: "The intake form is where the magic happens. The more information and photos you give us the better your website will be. Claude uses everything you share to write your copy, choose your layout, and build your pages. Vague answers produce generic websites. Specific answers produce something you'll actually be proud of.",
  },
  {
    icon: Sparkles,
    title: "Photos are everything",
    body: "The single biggest difference between a good website and a great one is photography. If you have professional photos please upload them. If not — even well-lit iPhone photos make a huge difference. Photos of you, your work, your team, your space, your products. The more the better. Stock photos are always a last resort.",
  },
];

export function BetaTesterGuide() {
  return (
    <section id="beta-guide" className="py-20 bg-amber-50/70 border-y border-amber-100">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-200/60 text-amber-900 text-xs font-semibold mb-4">
            <Crown className="w-3.5 h-3.5" /> Beta tester guidance
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            A note for our beta testers ♛
          </h2>
          <p className="text-lg text-muted-foreground">
            Before you apply — here's everything you need to know to get the most out of this experience and help us improve SiteQueen.
          </p>
        </div>

        {/* Three cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {CARDS.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.title} className="bg-card border border-amber-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-amber-700" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">{c.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{c.body}</p>
              </div>
            );
          })}
        </div>

        {/* Tips section */}
        <div className="bg-card border border-amber-100 rounded-3xl p-8 sm:p-10 mb-12 shadow-sm">
          <h3 className="text-2xl sm:text-3xl font-bold text-foreground mb-6">
            Tips for getting the best results ♛
          </h3>
          <ul className="space-y-4">
            {TIPS.map((tip, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <div className="shrink-0 w-6 h-6 rounded-full bg-amber-200 flex items-center justify-center mt-0.5">
                  <Check className="w-3.5 h-3.5 text-amber-800" strokeWidth={3} />
                </div>
                <p className="text-foreground/80 leading-relaxed">{tip}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Feedback section */}
        <div className="bg-amber-100/60 border border-amber-200 rounded-3xl p-8 sm:p-10 text-center">
          <h3 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
            Help us improve ♛
          </h3>
          <p className="text-foreground/80 leading-relaxed max-w-3xl mx-auto">
            You're part of something new. As a beta tester your feedback is incredibly valuable. After your website is built we'll ask you a few questions about the experience. Please be honest — what worked, what didn't, what confused you, what impressed you. Your feedback shapes SiteQueen for everyone who comes after you.
          </p>
        </div>
      </div>
    </section>
  );
}
