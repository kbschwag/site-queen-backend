interface Props {
  onStart: () => void;
}

export default function IntroScreen({ onStart }: Props) {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--sq-cream)",
        color: "var(--sq-charcoal)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem 1rem",
      }}
    >
      <div style={{ maxWidth: "38rem", width: "100%", textAlign: "center" }}>
        <div
          style={{
            fontSize: "3.5rem",
            color: "var(--sq-aubergine)",
            marginBottom: "1rem",
            lineHeight: 1,
          }}
        >
          ♛
        </div>
        <h1
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: "2.5rem",
            fontWeight: 500,
            color: "var(--sq-aubergine)",
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
            margin: "0 0 1.5rem",
          }}
        >
          Apply to work with SiteQueen
        </h1>
        <hr className="sq-divider" style={{ margin: "0 auto 2rem", maxWidth: "8rem" }} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
            fontFamily: '"Inter", sans-serif',
            fontSize: "1.0625rem",
            lineHeight: 1.7,
            color: "var(--sq-charcoal)",
            marginBottom: "2.5rem",
          }}
        >
          <p style={{ margin: 0 }}>
            SiteQueen works with a limited number of businesses each month. We pour real time, expertise, and creative energy into every website we build — so we're selective about who we work with.
          </p>
          <p style={{ margin: 0 }}>
            Tell us about your business. If we think we can build something incredible together we'll be in touch within 24 hours.
          </p>
          <p className="sq-serif-italic" style={{ margin: 0, color: "var(--sq-aubergine)", fontSize: "1.125rem" }}>
            We review every application personally. ♛
          </p>
        </div>
        <button
          type="button"
          onClick={onStart}
          className="sq-button"
          style={{ fontSize: "1rem" }}
        >
          Tell us about your business →
        </button>
      </div>
    </div>
  );
}
