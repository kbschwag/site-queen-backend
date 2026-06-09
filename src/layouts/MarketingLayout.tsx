import { Link, Outlet } from "react-router-dom";
import "@/styles/marketing-tokens.css";

/**
 * MarketingLayout
 * ---------------
 * Wraps all public-facing marketing pages (/, /pricing, /how-it-works, /apply).
 * Everything inside is scoped under .marketing-scope so the Caladan CSS
 * and SiteQueen brand tokens cannot leak into /dashboard or /operator.
 *
 * Do NOT share this layout with the authenticated app.
 */
export default function MarketingLayout() {
  return (
    <div className="marketing-scope">
      <MarketingNav />
      <main>
        <Outlet />
      </main>
      <MarketingFooter />
    </div>
  );
}

function MarketingNav() {
  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        backgroundColor: "var(--sq-cream)",
        borderBottom: "1px solid rgba(60, 31, 59, 0.08)",
        padding: "1.25rem 2rem",
      }}
    >
      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Logo — placeholder wordmark per handoff. Drop in refined custom logo later. */}
        <Link
          to="/"
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: "1.5rem",
            fontWeight: 500,
            color: "var(--sq-aubergine)",
            textDecoration: "none",
            letterSpacing: "-0.01em",
          }}
        >
          SiteQueen
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
          <Link
            to="/help"
            style={{
              color: "var(--sq-charcoal)",
              textDecoration: "none",
              fontSize: "0.9375rem",
              fontFamily: '"Inter", sans-serif',
            }}
          >
            Help
          </Link>

          <Link to="/apply" className="sq-button">
            Apply to qualify
          </Link>
        </div>
      </div>
    </nav>
  );
}

function MarketingFooter() {
  return (
    <footer
      style={{
        backgroundColor: "var(--sq-cream)",
        borderTop: "1px solid rgba(60, 31, 59, 0.08)",
        padding: "4rem 2rem 2rem",
        marginTop: "6rem",
      }}
    >
      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "3rem",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "3rem",
          }}
        >
          <div>
            <Link
              to="/"
              style={{
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: "1.75rem",
                fontWeight: 500,
                color: "var(--sq-aubergine)",
                textDecoration: "none",
                display: "block",
                marginBottom: "0.5rem",
              }}
            >
              SiteQueen
            </Link>
            <p
              className="sq-serif-italic"
              style={{
                color: "var(--sq-stone)",
                margin: 0,
                fontSize: "1rem",
              }}
            >
              Built different.
            </p>
          </div>

          <div style={{ display: "flex", gap: "3rem", flexWrap: "wrap" }}>
            <FooterLink to="/help">Help</FooterLink>
            <FooterLink to="/apply">Apply</FooterLink>
            <FooterLink to="/privacy">Privacy</FooterLink>
            <FooterLink to="/terms">Terms</FooterLink>

          </div>
        </div>

        <hr className="sq-divider" style={{ margin: "2rem 0" }} />

        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--sq-stone)",
            fontFamily: '"Inter", sans-serif',
            textAlign: "center",
            margin: 0,
          }}
        >
          © {new Date().getFullYear()} SiteQueen. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      style={{
        color: "var(--sq-charcoal)",
        textDecoration: "none",
        fontSize: "0.9375rem",
        fontFamily: '"Inter", sans-serif',
      }}
    >
      {children}
    </Link>
  );
}
