interface Props {
  onStart: () => void;
}

export default function IntroScreen({ onStart }: Props) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: "var(--sq-cream)", color: "var(--sq-charcoal)" }}
    >
      <div className="max-w-xl w-full text-center space-y-8">
        <div className="text-6xl mb-2" style={{ color: "var(--sq-aubergine)" }}>♛</div>
        <h1
          className="text-3xl sm:text-4xl leading-tight"
          style={{
            color: "var(--sq-aubergine)",
            fontFamily: '"Playfair Display", Georgia, serif',
            fontWeight: 500,
          }}
        >
          Apply to work with SiteQueen ♛
        </h1>
        <hr className="sq-divider" />
        <div
          className="space-y-4 text-base sm:text-lg leading-relaxed text-left sm:text-center"
          style={{ color: "var(--sq-charcoal)" }}
        >
          <p>
            SiteQueen works with a limited number of businesses each month. We pour real time, expertise, and creative energy into every website we build — so we're selective about who we work with.
          </p>
          <p>
            Tell us about your business. If we think we can build something incredible together we'll be in touch within 24 hours.
          </p>
          <p className="sq-serif-italic" style={{ color: "var(--sq-aubergine)", fontSize: "1.15rem" }}>
            We review every application personally. ♛
          </p>
        </div>
        <button onClick={onStart} className="sq-button w-full" type="button">
          Tell us about your business →
        </button>
      </div>
    </div>
  );
}
