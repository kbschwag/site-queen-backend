import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const sections: { id: string; title: string }[] = [
  { id: "s1", title: "1. Introduction & Acceptance" },
  { id: "s2", title: "2. Definitions" },
  { id: "s3", title: "3. The Service We Provide" },
  { id: "s4", title: "4. The Free Build Process" },
  { id: "s5", title: "5. Subscriptions, Billing & Auto-Renewal" },
  { id: "s6", title: "6. Founding 25 Program" },
  { id: "s7", title: "7. Add-Ons" },
  { id: "s8", title: "8. Credits System" },
  { id: "s9", title: "9. Refunds, Cancellation & Money-Back Guarantee" },
  { id: "s10", title: "10. Domain Ownership" },
  { id: "s11", title: "11. Website Ownership & Export" },
  { id: "s12", title: "12. Customer Content & Responsibilities" },
  { id: "s13", title: "13. Acceptable Use Policy" },
];

export default function Terms() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-brand-purple"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Site Queen
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-sm uppercase tracking-widest text-brand-gold font-semibold">
          SiteQueen LLC
        </p>
        <h1 className="font-serif text-5xl md:text-6xl text-ink mt-2 mb-4">
          Terms of Service
        </h1>
        <p className="text-muted-foreground italic">
          An Arizona Limited Liability Company · Version 1.0 · Last revised: May 2026
        </p>

        <div className="bg-brand-purple-soft/40 border border-border rounded-card p-6 my-10">
          <h2 className="font-serif text-2xl text-ink mb-3">
            What this document is, in plain English
          </h2>
          <p className="text-foreground/80 mb-4">
            This is the agreement between you and SiteQueen — the rules for how our
            service works, what we do for you, what we expect from you, and what happens
            if something goes wrong.
          </p>
          <ul className="space-y-2 text-foreground/80 list-disc list-inside">
            <li>You don't pay anything until you approve your finished website.</li>
            <li>Cancel anytime from your dashboard — no phone call, no retention specialist.</li>
            <li>30-day money-back guarantee on your first subscription.</li>
            <li>Your domain is always yours. We transfer it back free if you leave.</li>
            <li>Your website files are yours to take with you, on the terms in Section 11.</li>
          </ul>
        </div>

        <nav className="bg-surface border border-border rounded-card p-6 mb-12">
          <h2 className="font-serif text-xl text-ink mb-4">Table of Contents</h2>
          <ol className="space-y-1.5 text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-brand-purple hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="prose-content space-y-8 text-foreground/85 leading-relaxed">
          <Section id="s1" title="1. Introduction & Acceptance">
            <Sub title="1.1 Who you're agreeing with" />
            <p>
              This Agreement is between SiteQueen LLC, an Arizona limited liability
              company ("SiteQueen," "we," "us," or "our"), and you — either as an
              individual or as the business or other legal entity you represent ("you,"
              "your," or "Customer"). If you're agreeing to these terms on behalf of a
              business, you represent that you have the authority to bind that business to
              this Agreement.
            </p>
            <Sub title="1.2 What this Agreement covers" />
            <p>This Agreement governs your use of:</p>
            <Ul
              items={[
                "The SiteQueen website at sitequeen.ai and any related subdomains;",
                "The client dashboard where you manage your account, request changes, and view analytics;",
                "The website we build and host for you under your active subscription;",
                "The AI tools, analytics, and content services included in your subscription tier;",
                "The support and change-request services we provide through credits.",
              ]}
            />
            <p>Together, these are called the "Service" throughout this Agreement.</p>
            <Sub title="1.3 How you accept this Agreement" />
            <p>
              You accept this Agreement by clicking a button or checking a box that says
              "I agree," "Subscribe," or similar; by entering payment information to begin
              your subscription; or by using any part of the Service after we've delivered
              access to you. We record your customer ID, timestamp, IP address, the
              version accepted, and the page where you accepted. We retain this record for
              as long as you're a customer and for at least three years after your account
              closes.
            </p>
            <Sub title="1.4 If you don't agree" />
            <p>
              If you don't agree to any part of this Agreement, don't accept it, and don't
              use the Service. For specific concerns about the Dispute Resolution section
              (Section 20): you have a 30-day window to opt out of arbitration after first
              accepting these terms.
            </p>
          </Section>

          <Section id="s2" title="2. Definitions">
            <p>The following capitalized terms have specific meanings in this Agreement:</p>
            <Defs
              items={[
                ["Acceptable Use Policy (AUP)", "the policy in Section 13 describing the types of content and use that are and are not permitted on the Service."],
                ["Add-On", "an optional product or service offered alongside a Subscription, including Credit Top-Up Packs, Branded Email Inboxes, and the Website Export Package."],
                ["Billing Cycle", "the recurring period for which your Subscription is billed — monthly or annually."],
                ["Build / Free Build", "the initial website design and creation work SiteQueen performs at no charge before you approve and activate a Subscription."],
                ["Content", "any text, images, logos, photographs, video, audio, business information, or other material you provide to SiteQueen for use on your Site."],
                ["Credits", "the units of work allotment included in your Plan, used to request changes to your Site."],
                ["Customer Dashboard", "the web-based control panel where you manage your account, request changes, view analytics, and access support."],
                ["Plan / Tier", "the subscription level you have selected — Essential, Growth, or Premium."],
                ["Site", "the website SiteQueen builds, hosts, and maintains for you under your Subscription."],
                ["Subscription", "your active paid plan with SiteQueen, including any Add-Ons."],
              ]}
            />
          </Section>

          <Section id="s3" title="3. The Service We Provide">
            <Sub title="3.1 Website design and build" />
            <p>
              We design and build your Site as part of the Free Build process and continue
              to maintain and modify it under your active Subscription. Our build process
              combines human design work with AI tools. Sites are built within the
              SiteQueen template system.
            </p>
            <Sub title="3.2 Hosting and infrastructure" />
            <p>
              Your Subscription includes hosting, an SSL certificate, a content delivery
              network for faster page loads, and uptime monitoring.
            </p>
            <Sub title="3.3 Maintenance, security, and backups" />
            <Ul
              items={[
                "Software updates to the underlying platform, plugins, and dependencies.",
                "Security monitoring for malware, suspicious access patterns, and known vulnerabilities.",
                "Automated daily backups, retained for 30 days.",
                "SSL renewal as long as your Subscription is active.",
              ]}
            />
            <Sub title="3.4 Change requests via Credits" />
            <p>
              Changes to your Site — text edits, image swaps, new sections, new pages —
              are made by us in response to your requests. Your Plan includes a monthly
              allotment of Credits. Up to 2 customer-initiated restorations per month are
              included at no Credit cost; additional restorations cost 5 Credits each.
            </p>
            <Sub title="3.5 Analytics dashboard (Growth and Premium)" />
            <p>
              Growth and Premium Plans receive a website analytics dashboard. Premium adds
              conversion funnels, scroll depth, click tracking, custom event tracking,
              visitor journey mapping, and Google Search Console integration. We don't use
              tracking cookies.
            </p>
            <Sub title="3.6 AI Weekly Insights (Premium)" />
            <p>
              Premium customers receive an automatically generated weekly summary based on
              patterns in their analytics. These are suggestions, not professional advice.
            </p>
            <Sub title="3.7 Blog content (Premium)" />
            <p>
              Premium Plans include 4 AI-written, locally-optimized blog posts per month.
              Unused posts don't carry over.
            </p>
            <Sub title="3.8 Support" />
            <Ul
              items={[
                "Essential: Initial response within 5 business days.",
                "Growth: Initial response within 2 business days.",
                "Premium: Initial response within 24 hours on business days.",
              ]}
            />
            <Sub title="3.9 What is NOT included in any Plan" />
            <Ul
              items={[
                "Hands-on SEO work beyond on-page foundations.",
                "Social media management of any kind.",
                "Paid advertising management (Google, Meta, LinkedIn, etc.).",
                "Email marketing campaigns.",
                "Custom code development outside the SiteQueen template system.",
                "Custom e-commerce builds with carts, payment processing, inventory.",
                "Third-party integrations not on our supported list.",
                "Phone, video, or in-person consultation as a standard support channel.",
                "Original copywriting beyond Premium blog posts.",
                "Legal, accounting, tax, or professional advice of any kind.",
              ]}
            />
          </Section>

          <Section id="s4" title="4. The Free Build Process">
            <p>
              Before you pay anything, we build a complete, functional preview of your
              Site based on the information you provide at intake. You review it, request
              changes if you want them, and only enter payment when you're ready to make
              the Site live. We aim to deliver your initial preview within 48 hours.
            </p>
            <p>
              You have 7 days from each preview delivery to either approve the Site,
              request revisions, or let the preview expire. You may request up to 2
              revisions at no cost.
            </p>
            <p>
              <strong className="text-ink">No charge until you approve:</strong> SiteQueen
              does not charge any fee until you affirmatively activate your Site and enter
              payment information.
            </p>
          </Section>

          <Section id="s5" title="5. Subscriptions, Billing & Auto-Renewal">
            <Sub title="5.1 Automatic renewal — please read this carefully" />
            <p>
              <strong className="text-ink">
                Your Subscription automatically renews at the end of each Billing Cycle.
              </strong>{" "}
              By activating your Subscription, you authorize SiteQueen to charge your
              payment method for these recurring renewals until you cancel. We send a
              renewal reminder email approximately 7 days before each annual renewal.
            </p>
            <Sub title="5.2 Annual billing" />
            <p>
              If you select annual billing, you pay 10 months of your Plan's monthly price
              upfront for 12 months of service ("pay for 10 months, get 12").
            </p>
            <Sub title="5.3 Cancellation — how to cancel" />
            <p>
              You can cancel your Subscription at any time from your Customer Dashboard.
              There's no phone call required, no retention specialist. Cancellation takes
              effect at the end of your current Billing Cycle.
            </p>
            <Sub title="5.4 Failed payments" />
            <Ul
              items={[
                "Days 1–14: We automatically retry the charge.",
                "Day 14: If we still can't recover payment, your Site goes offline (not deleted — paused).",
                "Days 14–104: Your Site stays paused for 90 days. Update your payment method to reactivate.",
                "Day 104: If unrecovered, your Site is permanently deleted.",
              ]}
            />
          </Section>

          <Section id="s6" title="6. Founding 25 Program">
            <p>
              Limited promotional pricing for SiteQueen's first 25 customers on the Growth
              Plan:
            </p>
            <Ul
              items={[
                "Months 1–12 (Year 1): $49/month or $490/year (annual saves 2 months).",
                "Months 13–24 (Year 2): $79/month or $790/year.",
                "Month 25+: Standard Growth Plan pricing ($149/month or $1,490/year).",
              ]}
            />
            <p>
              Price transitions are automatic; we send a reminder email 30 days before
              each transition. Founding Customer status is permanent as long as you
              maintain a continuous Subscription.
            </p>
            <p>
              <strong className="text-ink">Cancellation forfeits Founding status.</strong>{" "}
              If you cancel and later re-subscribe, you re-subscribe as a standard
              Customer. Your Founding 25 spot does not return to the pool.
            </p>
          </Section>

          <Section id="s7" title="7. Add-Ons">
            <Sub title="7.1 Credit Top-Up Pack" />
            <p>
              30 Credits for $25. Available on any Plan, never expire as long as your
              Subscription remains active, non-refundable.
            </p>
            <Sub title="7.2 Branded Email Inbox" />
            <p>
              Professional email at your domain. $12 per month per inbox. One inbox is
              included at no charge for Premium customers.
            </p>
            <Sub title="7.3 Website Export Package" />
            <Ul
              items={[
                "Monthly Subscribers, under 12 months: $249 one-time charge.",
                "Monthly Subscribers, 12+ months continuous: Free.",
                "Annual Subscribers, after the first 30 days of any annual term: Free.",
              ]}
            />
          </Section>

          <Section id="s8" title="8. Credits System">
            <Sub title="8.1 Monthly allotment by Plan" />
            <Ul
              items={[
                "Essential: 10 Credits per month. No rollover.",
                "Growth: 30 Credits per month. Rollover up to 60 total.",
                "Premium: 100 Credits per month. Rollover up to 200 total.",
              ]}
            />
            <Sub title="8.2 The change menu" />
            <Ul
              items={[
                "Micro changes (2 Credits): small text edits, phone numbers, hours, typo fixes.",
                "Content changes (15 Credits): photo swaps, single service rewrites, testimonials.",
                "Medium changes (30 Credits): section rewrites, new team members, new services, FAQ updates.",
                "Large changes (60 Credits): new page sections, major overhauls, new pages.",
              ]}
            />
            <Sub title="8.3 Credits don't have cash value" />
            <p>
              We don't refund Credits for cash, including at cancellation. Credits can't
              be transferred to another account.
            </p>
          </Section>

          <Section id="s9" title="9. Refunds, Cancellation & Money-Back Guarantee">
            <Sub title="9.1 The 30-Day Money-Back Guarantee" />
            <p>
              We back your first SiteQueen Subscription with a 30-day money-back
              guarantee. If you're not happy within 30 days of your initial Subscription
              activation, email{" "}
              <a href="mailto:support@sitequeen.ai" className="text-brand-purple hover:underline">
                support@sitequeen.ai
              </a>{" "}
              and we'll process a refund.
            </p>
            <Sub title="9.2 How the refund is calculated" />
            <Ul
              items={[
                "Monthly Subscriptions: Full refund of the first month's charge.",
                "Annual Subscriptions: Prorated refund — full annual price minus one month at the standard monthly rate.",
              ]}
            />
            <Sub title="9.3 After the 30-day window" />
            <Ul
              items={[
                "Monthly Subscriptions are not refunded for past charges or partial months.",
                "Annual Subscriptions are not refunded for unused months after the 30-day window.",
                "Add-Ons are non-refundable.",
                "Credits have no cash value at any time.",
              ]}
            />
          </Section>

          <Section id="s10" title="10. Domain Ownership">
            <p>
              <strong className="text-ink">Your domain belongs to you</strong> at all
              times, regardless of who registered it. We will transfer the registration to
              you or to a registrar of your choice on request, at no cost — during your
              active Subscription or after you cancel.
            </p>
            <p>
              Most domain registrations are included in your Subscription at no
              additional cost — specifically, domains where the first-year registration
              fee is $30 or less. Premium domain costs above $30 are passed through to you
              at activation and are non-refundable.
            </p>
            <p>
              Domain transfers are governed by ICANN rules including a 60-day
              post-registration lock and 60-day post-transfer lock that we cannot waive.
            </p>
          </Section>

          <Section id="s11" title="11. Website Ownership & Export">
            <Sub title="11.1 The two-part ownership model" />
            <p>
              <strong className="text-ink">Your Content is yours.</strong> Anything you
              provided — text, photos, business information, logos, branding — remains
              your property at all times.
            </p>
            <p>
              <strong className="text-ink">The Site itself</strong> — the design, code,
              template structure — is more nuanced. Some is SiteQueen's. Some AI-generated
              portions are technically in the public domain under current U.S. copyright
              law. The practical answer to "can I take my Site with me?" depends on the
              Export Package.
            </p>
            <Sub title="11.2 The Export Package includes" />
            <Ul
              items={[
                "A static-file copy of your Site (HTML, CSS, JavaScript).",
                "All images you uploaded plus images we created or sourced that we have the right to transfer.",
                "Current content in editable form.",
                "Basic migration instructions and 30 days of email support during migration.",
              ]}
            />
            <Sub title="11.3 Off-boarding sequence" />
            <Ul
              items={[
                "End of Billing Cycle: Site stays live.",
                "Day 0 after cycle end: Site goes offline.",
                "Days 1–90: archive window — re-subscribe, request export, or transfer domain.",
                "Day 90: Site files are permanently deleted.",
              ]}
            />
          </Section>

          <Section id="s12" title="12. Customer Content & Responsibilities">
            <p>
              You retain all ownership rights in Content you provide. By providing
              Content, you grant SiteQueen a non-exclusive, worldwide, royalty-free
              license to host, display, modify (for technical use), reproduce/back up, and
              sublicense to our service providers strictly for operating the Service.
            </p>
            <p>
              You warrant that your Content is yours to use, doesn't infringe IP, doesn't
              violate privacy or publicity rights, is lawful and accurate, and isn't on
              the prohibited list in Section 13.
            </p>
            <p>
              <strong className="text-ink">You're responsible for your business.</strong>{" "}
              SiteQueen builds and operates your website, but we don't operate your
              business — pricing, customer relationships, business compliance, and
              customer interactions are yours.
            </p>
          </Section>

          <Section id="s13" title="13. Acceptable Use Policy">
            <Sub title="13.1 Prohibited business categories" />
            <Ul
              items={[
                "Firearms, ammunition, and weapons of any kind.",
                "Cannabis, marijuana, and CBD products in any form.",
                "Adult, sexually explicit, or pornographic content.",
                "Gambling, online betting, and games of chance.",
                "Cryptocurrency exchanges, token sales, and digital asset trading platforms.",
                "Multi-level marketing (MLM) operations.",
                "Anything illegal under U.S. federal law.",
              ]}
            />
            <Sub title="13.2 Prohibited content and behaviors" />
            <Ul
              items={[
                "Illegal content and activity, IP infringement, defamation.",
                "Content that harms minors.",
                "Hate speech and discrimination.",
                "Malware, viruses, phishing kits, hacking tools.",
                "Harassment, doxing, content promoting self-harm.",
                "Spam, fake testimonials, pyramid schemes, get-rich-quick schemes.",
                "Misuse of SiteQueen's systems — reverse-engineering, reselling access.",
                "Abuse of credits, support, or refund systems.",
              ]}
            />
          </Section>

          <div className="bg-surface border border-border rounded-card p-6 mt-12">
            <h2 className="font-serif text-xl text-ink mb-2">Contact</h2>
            <p>
              Questions about these Terms? Email{" "}
              <a href="mailto:support@sitequeen.ai" className="text-brand-purple hover:underline">
                support@sitequeen.ai
              </a>{" "}
              or visit{" "}
              <a
                href="https://sitequeen.ai/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-purple hover:underline"
              >
                sitequeen.ai/contact
              </a>
              .
            </p>
            <p className="text-sm text-muted-foreground italic mt-4">
              Version 1.0 · Last revised May 2026
            </p>
          </div>
        </article>
      </main>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-serif text-3xl text-ink mb-4 mt-10 border-t border-border pt-8">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Sub({ title }: { title: string }) {
  return <h3 className="font-display text-lg text-ink mt-6 mb-1">{title}</h3>;
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="list-disc list-outside ml-6 space-y-2">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Defs({ items }: { items: [string, string][] }) {
  return (
    <dl className="space-y-3">
      {items.map(([term, def], i) => (
        <div key={i}>
          <dt className="font-semibold text-ink inline">"{term}"</dt>{" "}
          <dd className="inline">— {def}</dd>
        </div>
      ))}
    </dl>
  );
}
