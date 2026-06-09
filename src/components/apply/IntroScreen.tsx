interface Props {
  onStart: () => void;
}

export default function IntroScreen({ onStart }: Props) {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 80px)",
        backgroundColor: "var(--sq-cream)",
        color: "var(--sq-charcoal)",
        fontFamily: '"Inter", sans-serif',
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem 1.5rem",
      }}
    >
      <div style={{ maxWidth: "640px", width: "100%", textAlign: "center" }}>
        <div
          style={{
            fontSize: "3rem",
            color: "var(--sq-aubergine)",
            marginBottom: "1.5rem",
            lineHeight: 1,
          }}
        >
          ♛
        </div>

        <h1
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: "clamp(2rem, 4vw, 3rem)",
            fontWeight: 500,
            letterSpacing: "-0.01em",
            color: "var(--sq-aubergine)",
            margin: "0 0 2rem",
            lineHeight: 1.15,
          }}
        >
          Apply to work with SiteQueen
        </h1>

        <hr className="sq-divider" style={{ margin: "0 auto 2rem" }} />

        <div
          style={{
            fontSize: "1.0625rem",
            lineHeight: 1.7,
            color: "var(--sq-charcoal)",
            maxWidth: "32rem",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          <p style={{ margin: 0 }}>
            SiteQueen works with a limited number of businesses each month. We pour real time,
            expertise, and creative energy into every website we build — so we're selective about
            who we work with.
          </p>
          <p style={{ margin: 0 }}>
            Tell us about your business. If we think we can build something incredible together
            we'll be in touch within 24 hours.
          </p>
          <p
            className="sq-serif-italic"
            style={{ margin: 0, color: "var(--sq-aubergine)", fontSize: "1.125rem" }}
          >
            We review every application personally.
          </p>
        </div>

        <button
          onClick={onStart}
          className="sq-button"
          style={{ marginTop: "2.5rem" }}
        >
          Tell us about your business →
        </button>
      </div>
    </div>
  );
}
