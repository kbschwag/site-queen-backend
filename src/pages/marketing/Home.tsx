import { Link } from "react-router-dom";

/**
 * SiteQueen Marketing Homepage
 * -----------------------------
 * Ten-section flow based on NEPQ (Jeremy Miner) + Hormozi Grand Slam Offer
 * framework. Copy is locked — do not re-litigate without user approval.
 *
 * Section order:
 *   1. Hero
 *   2. Problem Surfacing
 *   3. Consequence
 *   4. Solution Reveal (3-column)
 *   5. Value Stack (Hormozi)
 *   6. Guarantee
 *   7. Qualification (two-column)
 *   8. Founder Story
 *   9. Final CTA
 *  10. Footer (lives in MarketingLayout, not here)
 *
 * Images are placeholders. Every <img> has an alt attribute describing
 * what the final photograph should be — search alt="TODO:" to find them.
 */
export default function Home() {
  return (
    <>
      <HeroSection />
      <ProblemSection />
      <ConsequenceSection />
      <SolutionSection />
      <ValueStackSection />
      <GuaranteeSection />
      <QualificationSection />
      <FounderStorySection />
      <FinalCtaSection />
    </>
  );
}

/* ===================================================================
   SECTION 1 — HERO
   =================================================================== */
function HeroSection() {
  return (
    <section
      className="sq-section--cream"
      style={{ padding: "8rem 2rem 6rem", textAlign: "left" }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <h1
          style={{
            fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
            lineHeight: 1.05,
            maxWidth: "22ch",
            marginBottom: "2rem",
            fontWeight: 500,
          }}
        >
          Your website shouldn't be the reason you lose customers.
        </h1>

        <p
          className="sq-prose"
          style={{
            marginBottom: "2.5rem",
            maxWidth: "44rem",
            fontSize: "1.25rem",
          }}
        >
          We build free, professional websites for small service businesses — then
          maintain them forever for less than your phone bill. You don't touch code.
          You don't drag elements. You don't learn a new tool. You apply, we accept,
          we build. That's it.
        </p>

        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Link to="/apply" className="sq-button">
            Apply to qualify
          </Link>
          <span
            style={{
              fontSize: "0.875rem",
              color: "var(--sq-stone)",
              fontFamily: '"Inter", sans-serif',
            }}
          >
            90 seconds. No credit card. Applications reviewed within 24 hours.
          </span>
        </div>

        {/* Hero visual placeholder — Caladan uses a big atmospheric video here.
            For SiteQueen, recommend: editorial wide shot of a beautifully-built small
            business website on a laptop sitting on a warm wooden desk, morning light. */}
        <div
          style={{
            marginTop: "5rem",
            aspectRatio: "16 / 9",
            backgroundColor: "var(--sq-parchment)",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--sq-stone)",
            fontFamily: '"Inter", sans-serif',
            fontSize: "0.875rem",
          }}
          aria-label="TODO: Hero image — editorial wide shot of a finished SiteQueen-built website on a laptop in a warm, lived-in small business setting (coffee shop counter, salon reception, etc.). NOT a corporate stock photo."
        >
          [ Hero image placeholder ]
        </div>
      </div>
    </section>
  );
}

/* ===================================================================
   SECTION 2 — PROBLEM SURFACING
   =================================================================== */
function ProblemSection() {
  return (
    <section className="sq-section--cream" style={{ padding: "6rem 2rem" }}>
      <div style={{ maxWidth: "780px", margin: "0 auto" }}>
        <h2
          style={{
            fontSize: "clamp(2rem, 4vw, 3rem)",
            lineHeight: 1.15,
            marginBottom: "3rem",
            fontWeight: 500,
          }}
        >
          You've probably tried one of these already.
        </h2>

        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "0 0 3rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
          }}
        >
          <ProblemItem>
            You built something on Wix or Squarespace, and it looks <em>fine</em>,
            but you hate sending it to people.
          </ProblemItem>
          <ProblemItem>
            You paid a developer three thousand dollars. It launched, they
            disappeared, and now it's broken.
          </ProblemItem>
          <ProblemItem>
            You keep meaning to fix it. It's been on your list for eleven months.
          </ProblemItem>
        </ul>

        <p
          className="sq-serif-italic"
          style={{
            fontSize: "1.125rem",
            color: "var(--sq-charcoal)",
            maxWidth: "44ch",
          }}
        >
          If any of those sounds familiar, keep reading. If not, we're probably
          not for you.
        </p>
      </div>
    </section>
  );
}

function ProblemItem({ children }: { children: React.ReactNode }) {
  return (
    <li
      style={{
        display: "flex",
        gap: "1rem",
        alignItems: "flex-start",
        fontSize: "1.0625rem",
        lineHeight: 1.6,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          color: "var(--sq-aubergine)",
          fontSize: "1.25rem",
          lineHeight: 1.4,
          flexShrink: 0,
        }}
      >
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}

/* ===================================================================
   SECTION 3 — CONSEQUENCE
   =================================================================== */
function ConsequenceSection() {
  return (
    <section
      className="sq-section--cream"
      style={{
        padding: "8rem 2rem",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: "780px", margin: "0 auto" }}>
        <hr className="sq-divider" style={{ marginBottom: "3rem" }} />

        <p
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
            lineHeight: 1.3,
            color: "var(--sq-aubergine)",
            fontWeight: 400,
            marginBottom: "1.5rem",
          }}
        >
          Every day your website looks outdated, a potential customer quietly
          decides to call someone else.
        </p>

        <p
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: "clamp(1.5rem, 3vw, 2rem)",
            lineHeight: 1.35,
            color: "var(--sq-aubergine)",
            fontWeight: 400,
            marginBottom: "3rem",
          }}
        >
          You won't see them. They won't tell you. They'll just be gone.
        </p>

        <p
          className="sq-prose sq-prose--narrow"
          style={{ margin: "0 auto", textAlign: "left" }}
        >
          This isn't scare tactics. It's how the internet works in 2026. Ninety-three
          percent of people research a business online before calling. If your
          website doesn't build trust in the first five seconds, you've already
          lost the job — and you'll never know the lead existed.
        </p>
      </div>
    </section>
  );
}

/* ===================================================================
   SECTION 4 — SOLUTION REVEAL (3-column)
   =================================================================== */
function SolutionSection() {
  return (
    <section
      className="sq-section--parchment"
      style={{ padding: "8rem 2rem" }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <p className="sq-eyebrow">what we actually do</p>

        <h2
          style={{
            fontSize: "clamp(1.875rem, 3.5vw, 2.75rem)",
            lineHeight: 1.2,
            marginBottom: "5rem",
            maxWidth: "30ch",
            fontWeight: 500,
          }}
        >
          SiteQueen is a done-for-you website service. Not a builder. Not a
          template shop. A service.
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "3rem",
          }}
        >
          <SolutionStep
            number="01"
            title="You apply"
            body="Takes about 90 seconds. We review every application personally. Not everyone is accepted."
          />
          <SolutionStep
            number="02"
            title="We build"
            body="Forty-eight hours from approval to staging site. We use our five professional templates and tailor them to your business."
          />
          <SolutionStep
            number="03"
            title="We maintain"
            body="Forever. Hosting, security, backups, and monthly changes included. You email us when something needs updating."
          />
        </div>
      </div>
    </section>
  );
}

function SolutionStep({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: '"Playfair Display", Georgia, serif',
          fontSize: "1rem",
          color: "var(--sq-gold)",
          marginBottom: "1rem",
          fontWeight: 500,
          letterSpacing: "0.1em",
        }}
      >
        {number}
      </div>
      <h3
        style={{
          fontSize: "1.5rem",
          marginBottom: "1rem",
          fontWeight: 500,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: "1rem",
          lineHeight: 1.65,
          color: "var(--sq-charcoal)",
          margin: 0,
        }}
      >
        {body}
      </p>
    </div>
  );
}

/* ===================================================================
   SECTION 5 — VALUE STACK (Hormozi)
   =================================================================== */
function ValueStackSection() {
  return (
    <section className="sq-section--cream" style={{ padding: "8rem 2rem" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <h2
          style={{
            fontSize: "clamp(1.875rem, 3.5vw, 2.75rem)",
            lineHeight: 1.2,
            marginBottom: "4rem",
            maxWidth: "24ch",
            fontWeight: 500,
          }}
        >
          Here's everything a $79/month client gets.
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)",
            gap: "4rem",
            alignItems: "start",
          }}
          className="sq-value-grid"
        >
          {/* Left: stack */}
          <div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              <ValueItem label="A professionally designed website, built by us" worth="$3,000" />
              <ValueItem label="Domain registration" worth="$20/year" />
              <ValueItem label="Hosting, forever" worth="$180/year" />
              <ValueItem label="SSL security certificate" worth="$100/year" />
              <ValueItem label="Monthly backups" worth="$120/year" />
              <ValueItem label="10 monthly credits for changes" worth="$200/month" />
              <ValueItem label="Unlimited typo and contact info fixes" worth="$50/month" />
              <ValueItem label="48-hour standard support" worth="$200/month" />
            </ul>

            <div
              style={{
                marginTop: "2.5rem",
                paddingTop: "1.5rem",
                borderTop: "1px solid rgba(60, 31, 59, 0.15)",
                fontSize: "1rem",
                lineHeight: 1.8,
              }}
            >
              <div>
                <strong>Total value delivered monthly:</strong> ~$790
              </div>
              <div>
                <strong>You pay:</strong> $79
              </div>
              <div style={{ color: "var(--sq-aubergine)", fontWeight: 500 }}>
                <strong>You save:</strong> About $711 every month.
              </div>
            </div>
          </div>

          {/* Right: big price */}
          <div style={{ textAlign: "left" }}>
            <div
              style={{
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: "clamp(4rem, 8vw, 6.5rem)",
                color: "var(--sq-aubergine)",
                lineHeight: 1,
                fontWeight: 500,
                letterSpacing: "-0.03em",
              }}
            >
              $79
            </div>
            <div
              style={{
                fontFamily: '"Inter", sans-serif',
                fontSize: "1.125rem",
                color: "var(--sq-stone)",
                marginBottom: "1.5rem",
              }}
            >
              per month
            </div>
            <p
              style={{
                fontSize: "0.9375rem",
                color: "var(--sq-charcoal)",
                lineHeight: 1.6,
                margin: 0,
                maxWidth: "22ch",
              }}
            >
              No setup fee. No contract. Cancel anytime.
            </p>
          </div>
        </div>

        <div
          style={{
            marginTop: "5rem",
            textAlign: "center",
            fontSize: "0.9375rem",
            color: "var(--sq-stone)",
          }}
        >
          Two other plans exist for businesses that want more.{" "}
          <Link
            to="/pricing"
            style={{
              color: "var(--sq-aubergine)",
              textDecoration: "underline",
              textUnderlineOffset: "3px",
            }}
          >
            See all three →
          </Link>
        </div>
      </div>
    </section>
  );
}

function ValueItem({ label, worth }: { label: string; worth: string }) {
  return (
    <li
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: "1.5rem",
        fontSize: "1rem",
        paddingBottom: "0.5rem",
        borderBottom: "1px solid rgba(60, 31, 59, 0.08)",
      }}
    >
      <span style={{ color: "var(--sq-charcoal)" }}>{label}</span>
      <span
        className="sq-serif-italic"
        style={{
          color: "var(--sq-stone)",
          whiteSpace: "nowrap",
          fontSize: "0.9375rem",
        }}
      >
        worth {worth}
      </span>
    </li>
  );
}

/* ===================================================================
   SECTION 6 — GUARANTEE
   =================================================================== */
function GuaranteeSection() {
  return (
    <section className="sq-section--cream" style={{ padding: "4rem 2rem" }}>
      <div
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          border: "1px solid var(--sq-aubergine)",
          padding: "4rem 3rem",
          borderRadius: "2px",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(1.75rem, 3vw, 2.25rem)",
            lineHeight: 1.25,
            marginBottom: "2rem",
            fontWeight: 500,
          }}
        >
          If you don't love your website, you don't pay for it.
        </h2>

        <p
          className="sq-prose"
          style={{
            margin: "0 auto",
            textAlign: "left",
            fontSize: "1.0625rem",
          }}
        >
          We build the site first. You see the finished work. If it doesn't fit
          your business, your brand, and what you wanted — you walk away owing
          nothing. No contract. No setup fee. No awkward "process." If we build
          it and you hate it, we part ways politely. That's the whole guarantee.
        </p>
      </div>
    </section>
  );
}

/* ===================================================================
   SECTION 7 — QUALIFICATION (two-column)
   =================================================================== */
function QualificationSection() {
  return (
    <section
      className="sq-section--parchment"
      style={{ padding: "8rem 2rem" }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <h2
          style={{
            fontSize: "clamp(1.875rem, 3.5vw, 2.75rem)",
            lineHeight: 1.2,
            marginBottom: "4rem",
            maxWidth: "28ch",
            fontWeight: 500,
          }}
        >
          SiteQueen isn't for everyone. See where you fit.
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "3rem",
          }}
        >
          <QualColumn
            heading="SiteQueen is for you if:"
            items={[
              "You own a small service business (trades, beauty, wellness, professional services, food, fitness, coaching)",
              "You're based in the United States",
              "Your website is either non-existent, outdated, or driving you crazy",
              "You want someone else to handle it so you can run your business",
              "You're comfortable with us picking the best template for your brand",
            ]}
            symbol="✓"
            symbolColor="var(--sq-aubergine)"
          />
          <QualColumn
            heading="SiteQueen is not for you if:"
            items={[
              "You run an e-commerce store with inventory, checkout, or product pages",
              "You need a highly custom design that doesn't fit a template approach",
              "You want to build the site yourself",
              "You're looking for the cheapest option regardless of quality",
              "You expect unlimited changes or same-day turnaround without upgrading",
            ]}
            symbol="—"
            symbolColor="var(--sq-stone)"
          />
        </div>
      </div>
    </section>
  );
}

function QualColumn({
  heading,
  items,
  symbol,
  symbolColor,
}: {
  heading: string;
  items: string[];
  symbol: string;
  symbolColor: string;
}) {
  return (
    <div>
      <h3
        style={{
          fontSize: "1.25rem",
          marginBottom: "2rem",
          fontWeight: 500,
          color: "var(--sq-aubergine)",
        }}
      >
        {heading}
      </h3>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        {items.map((item, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              gap: "0.875rem",
              alignItems: "flex-start",
              fontSize: "1rem",
              lineHeight: 1.6,
              color: "var(--sq-charcoal)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                color: symbolColor,
                flexShrink: 0,
                fontWeight: 500,
                paddingTop: "0.1em",
              }}
            >
              {symbol}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ===================================================================
   SECTION 8 — FOUNDER STORY
   =================================================================== */
function FounderStorySection() {
  return (
    <section className="sq-section--cream" style={{ padding: "8rem 2rem" }}>
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.5fr)",
          gap: "4rem",
          alignItems: "start",
        }}
        className="sq-founder-grid"
      >
        {/* Founder photo placeholder */}
        <div
          style={{
            aspectRatio: "3 / 4",
            backgroundColor: "var(--sq-parchment)",
            borderRadius: "2px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--sq-stone)",
            fontFamily: '"Inter", sans-serif',
            fontSize: "0.8125rem",
            textAlign: "center",
            padding: "1rem",
          }}
          aria-label="TODO: Founder photo — editorial, warm lighting, relaxed body language. NOT a corporate headshot. Think magazine profile photo, shot indoors with natural light. Slight smile is fine. Direct gaze preferred."
        >
          [ Founder photo placeholder ]
        </div>

        <div>
          <h2
            style={{
              fontSize: "clamp(1.875rem, 3.5vw, 2.5rem)",
              lineHeight: 1.2,
              marginBottom: "2.5rem",
              fontWeight: 500,
            }}
          >
            Why we built SiteQueen.
          </h2>

          <div className="sq-prose" style={{ maxWidth: "none" }}>
            <p style={{ marginBottom: "1.5rem" }}>
              We spent eight years running Escape — a premium web and SEO agency.
              Over and over, we met small business owners who needed great
              websites but couldn't justify a $5,000 custom build. We'd send
              them to Wix or Squarespace, watch them struggle, and feel guilty
              about it.
            </p>

            <p style={{ marginBottom: "1.5rem" }}>
              SiteQueen is what we wish we could have offered them.
            </p>

            <p style={{ marginBottom: "1.5rem" }}>
              It's not our premium service. It's not our cheap service. It's a
              different service — built specifically for small businesses who
              need something that works, looks good, and gets out of their way.
              You apply. We decide if we can help. If we can, we build it for
              free and maintain it for the cost of a phone bill.
            </p>

            <p style={{ marginBottom: "2rem" }}>
              That's it. That's the whole pitch.
            </p>

            <p
              className="sq-serif-italic"
              style={{
                color: "var(--sq-stone)",
                margin: 0,
              }}
            >
              — Founder name
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ===================================================================
   SECTION 9 — FINAL CTA (aubergine background)
   =================================================================== */
function FinalCtaSection() {
  return (
    <section
      className="sq-section--aubergine"
      style={{
        padding: "8rem 2rem",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <h2
          style={{
            fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
            lineHeight: 1.15,
            color: "var(--sq-cream)",
            marginBottom: "2rem",
            fontWeight: 500,
          }}
        >
          Applications are currently open.
        </h2>

        <p
          style={{
            fontSize: "1.125rem",
            lineHeight: 1.65,
            color: "var(--sq-cream)",
            opacity: 0.9,
            marginBottom: "3rem",
            maxWidth: "44ch",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          We accept a limited number of new clients each month. If you're a fit,
          you'll hear back within 24 hours. If you're not, we'll tell you why
          and point you somewhere that might be.
        </p>

        <Link
          to="/apply"
          className="sq-button sq-button--inverted"
          style={{
            fontSize: "1.125rem",
            padding: "1.25rem 2.5rem",
          }}
        >
          Apply to qualify
        </Link>

        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--sq-cream)",
            opacity: 0.7,
            marginTop: "1.5rem",
          }}
        >
          Approximately 90 seconds. No credit card required.
        </p>
      </div>
    </section>
  );
}
