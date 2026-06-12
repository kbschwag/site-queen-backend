import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function Privacy() {
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
          Privacy Policy
        </h1>
        <p className="text-muted-foreground italic">
          Version 1.0 · Last revised: May 2026
        </p>

        <article className="prose-content space-y-8 text-foreground/85 leading-relaxed mt-10">
          <p>
            This Privacy Policy describes how SiteQueen LLC — an Arizona limited liability
            company doing business as SiteQueen — collects, uses, and protects information
            when you visit our marketing site at sitequeen.ai, use our Customer Dashboard,
            subscribe to our Service, or visit a website we host on behalf of one of our
            Customers.
          </p>
          <p>
            Privacy policies are usually written for lawyers. We've tried to write this one
            for the actual humans who use SiteQueen — small business owners running yoga
            studios, dental practices, plumbing companies, and the like. If anything reads
            as unclear, email us at{" "}
            <a href="mailto:support@sitequeen.ai" className="text-brand-purple hover:underline">
              support@sitequeen.ai
            </a>{" "}
            and we'll clarify.
          </p>

          <Section title="1. The Most Important Thing to Understand First">
            <Sub title="1.1 SiteQueen wears two privacy hats" />
            <p>
              <strong className="text-ink">When we talk to you directly, we're the controller.</strong>{" "}
              If you visit sitequeen.ai, fill out our intake form, sign up for a
              Subscription, log into your Customer Dashboard, or contact our support team
              — SiteQueen is the "controller" of that information.
            </p>
            <p>
              <strong className="text-ink">When visitors come to a Site we built for one of our Customers, we're the processor.</strong>{" "}
              Our Customer (the business that owns the site) is the controller; SiteQueen
              is the processor that handles the data on the Customer's behalf.
            </p>
          </Section>

          <Section title="2. Quick Summary">
            <p>If you read nothing else, read this:</p>
            <Ul
              items={[
                "We don't sell your personal information. Not now, not ever.",
                "We don't share your personal information for cross-context behavioral advertising. No retargeting pixels, no audience-share programs, no data brokerage.",
                "We don't train AI models on your data. Our AI providers contractually commit not to use SiteQueen Customer or visitor data for model training.",
                "We collect what we need to operate the Service, and not much more.",
                "We use cookieless analytics on the Sites we build.",
                "You have rights over your information — access, correction, deletion, portability.",
              ]}
            />
          </Section>

          <Section title="3. Information We Collect From SiteQueen Customers">
            <Sub title="3.1 Information you give us during intake" />
            <Ul
              items={[
                "Your name and the name of your business.",
                "Contact details (email, phone, mailing address).",
                "Business information (services, hours, pricing, target customers, credentials).",
                "Photographs, logos, branding materials, testimonials.",
                "Style preferences and design direction.",
                "Domain name preferences.",
              ]}
            />
            <Sub title="3.2 Information you give us when you become a paying Customer" />
            <Ul
              items={[
                "Billing name and address.",
                "Payment method (handled by our payment processor — we don't see or store full card numbers).",
                "Tax information where applicable.",
                "Plan selection and Billing Cycle preference.",
              ]}
            />
            <Sub title="3.3 Information we collect automatically" />
            <Ul
              items={[
                "Technical information like IP address, browser type, device type, OS.",
                "Pages you view on sitequeen.ai and within the Dashboard.",
                "Date and time of access.",
                "Referring page.",
                "Errors or technical problems encountered.",
              ]}
            />
          </Section>

          <Section title="4. How We Use the Information We Collect">
            <Ul
              items={[
                "Building and operating your Site.",
                "Running your Subscription — billing, renewals, plan changes, credits accounting.",
                "Communicating with you — service updates, billing notices, support replies.",
                "Providing analytics features (Growth and Premium).",
                "Generating AI features for Premium customers.",
                "Improving the Service — aggregated, not used to build profiles.",
                "Security and abuse prevention.",
                "Legal compliance.",
              ]}
            />
            <p>
              <strong className="text-ink">What we don't do:</strong> we don't sell your
              information, we don't share it for cross-context behavioral advertising, and
              we don't use it to train AI models.
            </p>
          </Section>

          <Section title="5. Information Collected Through SiteQueen-Hosted Customer Sites">
            <p>
              For data collected through Sites we host on behalf of Customers, the
              Customer (the business that owns the site) is the controller. SiteQueen is
              the processor. If you're a visitor to a SiteQueen-hosted Site and have
              questions about your data, direct those questions to the business whose name
              appears on the site.
            </p>
            <Sub title="5.1 Contact forms and lead submissions" />
            <p>
              When a visitor fills out a contact form, the submission flows through
              SiteQueen's infrastructure to the Customer. We do not use contact-form
              submissions for our own purposes, do not aggregate them across Customers,
              sell them, share them with advertisers, or train AI models on them.
            </p>
            <Sub title="5.2 Analytics on Customer Sites" />
            <p>
              Our primary analytics tool is a lightweight first-party JavaScript tracker
              that:
            </p>
            <Ul
              items={[
                "Does not set tracking cookies.",
                "Does not collect personally identifiable information about individual visitors.",
                "Uses a hashed visitor identifier that cannot be reversed.",
                "Does not track visitors across websites or build cross-site profiles.",
              ]}
            />
          </Section>

          <Section title="6. Who We Share Information With">
            <p>
              SiteQueen does not sell personal information and does not share personal
              information for cross-context behavioral advertising.
            </p>
            <Sub title="6.1 Service providers (sub-processors)" />
            <p>
              We use third-party service providers for payment processing, hosting,
              database storage, AI processing, email delivery, security, and customer
              support. They are contractually restricted to using information only to
              provide their services to SiteQueen.
            </p>
            <Sub title="6.2 Legal compliance" />
            <p>
              We may disclose information to comply with applicable law, valid legal
              process, or law-enforcement requests. We'll resist overbroad requests and
              notify you unless legally prohibited.
            </p>
          </Section>

          <Section title="7. How AI Processes Your Information">
            <Sub title="7.1 AI Weekly Insights (Premium)" />
            <p>
              For Premium customers, we send aggregate analytics data to Anthropic's
              Claude models on a weekly basis. We do not include personally identifiable
              information about individual visitors.
            </p>
            <Sub title="7.2 No training on your data" />
            <p>
              Our AI providers — including Anthropic — do not use SiteQueen Customer or
              visitor data sent through their APIs to train their AI models.
            </p>
          </Section>

          <Section title="8. How Long We Keep Your Information">
            <Ul
              items={[
                "Account and Subscription data: while your Subscription is active, plus post-cancellation windows for accounting and legal recordkeeping.",
                "Intake responses and Site content: while active; archived for 90 days after cancellation, then permanently deleted.",
                "Billing records: typically seven years.",
                "Acceptance records: at least three years after account closure.",
                "Backups: 30 days.",
                "Support communications: life of your Subscription plus two years.",
              ]}
            />
          </Section>

          <Section title="9. Your Rights Over Your Information">
            <p>
              SiteQueen extends the following rights to all U.S. Customers, regardless of
              which state you live in:
            </p>
            <Ul
              items={[
                "Right to know what personal information we've collected.",
                "Right to access a copy of your personal information.",
                "Right to correct inaccurate information.",
                "Right to delete (subject to legal retention requirements).",
                "Right to portability — including the Site Export Package.",
                "Right to opt out of sale or sharing (not applicable — we don't do either).",
                "Right of non-retaliation.",
              ]}
            />
            <p>
              To make a request, email{" "}
              <a href="mailto:support@sitequeen.ai" className="text-brand-purple hover:underline">
                support@sitequeen.ai
              </a>{" "}
              with "Privacy Request" in the subject. We respond within 30 days.
            </p>
          </Section>

          <Section title="10. Cookies and Tracking Technologies">
            <p>
              On sitequeen.ai we use a small number of essential cookies for sign-in,
              preferences, and security. We don't use cookies for cross-site behavioral
              advertising.
            </p>
            <p>
              The first-party tracker we install on Customer Sites does not set tracking
              cookies. We honor Do Not Track and Global Privacy Control signals — though
              since we don't engage in cross-context tracking or sell data, these signals
              don't change our behavior.
            </p>
          </Section>

          <Section title="11. How We Protect Information">
            <Ul
              items={[
                "Encryption in transit (TLS/HTTPS).",
                "Encryption at rest for databases.",
                "Access controls on a need-to-know basis.",
                "Authentication and password security on the Customer Dashboard.",
                "Regular backups.",
                "CDN-level protection against denial-of-service attacks.",
                "Vendor due diligence.",
              ]}
            />
            <p>
              No security system is perfect. If we ever experience a security incident
              affecting your information, we'll notify you and applicable regulators as
              required by law.
            </p>
          </Section>

          <Section title="12. Children's Privacy">
            <p>
              SiteQueen's services are intended for use by small businesses and the adults
              who run them. We don't direct our services to children under 13 and don't
              knowingly collect personal information from anyone under 13.
            </p>
          </Section>

          <Section title="13. Where We Process Information">
            <p>
              SiteQueen is a U.S. company. We and our service providers process
              information in the United States. The Service is offered to U.S. customers
              and is not directed to residents of the EU, UK, or other jurisdictions
              outside the United States.
            </p>
          </Section>

          <Section title="14. Changes to This Privacy Policy">
            <p>
              Non-material changes take effect when posted. Material changes — those that
              materially affect how we collect, use, or share your information — take
              effect 30 days after we notify you by email or Dashboard banner.
            </p>
          </Section>

          <div className="bg-surface border border-border rounded-card p-6 mt-12">
            <h2 className="font-serif text-xl text-ink mb-2">Contact</h2>
            <p>
              For all privacy matters:{" "}
              <a href="mailto:support@sitequeen.ai" className="text-brand-purple hover:underline">
                support@sitequeen.ai
              </a>{" "}
              (subject line: "Privacy") or visit{" "}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
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
