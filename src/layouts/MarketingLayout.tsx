import { Link, Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

/**
 * MarketingLayout — wraps public-facing pages (/, /pricing, /how-it-works, /apply, /help).
 * Uses the global Site Queen brand theme.
 */
export default function MarketingLayout() {
  const location = useLocation();
  const hideFooter = location.pathname.startsWith("/apply");
  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <MarketingNav />
      <main className="flex-1">
        <Outlet />
      </main>
      {!hideFooter && <MarketingFooter />}
    </div>
  );
}

function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  const cls =
    size === "lg"
      ? "text-2xl md:text-[1.75rem]"
      : "text-xl";
  return (
    <Link
      to="/"
      className={`${cls} font-extrabold tracking-tight text-ink hover:no-underline inline-flex items-center gap-1.5`}
    >
      Site<span className="text-brand-purple">Queen</span>
      <span className="text-brand-gold text-base align-middle">♛</span>
    </Link>
  );
}

function MarketingNav() {
  return (
    <nav className="sticky top-0 z-50 bg-background/85 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Wordmark />
        <div className="flex items-center gap-6">
          <Link
            to="/help"
            className="text-sm font-semibold text-foreground hover:text-brand-purple hover:no-underline"
          >
            Help
          </Link>
          <Button asChild size="sm">
            <Link to="/apply">Apply to qualify</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}

function MarketingFooter() {
  return (
    <footer className="bg-brand-purple-soft border-t border-border mt-24 px-6 pt-16 pb-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap justify-between gap-12 mb-12">
          <div className="max-w-sm">
            <Wordmark size="lg" />
            <p className="font-serif italic text-muted-foreground mt-2">
              The queen of web design.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-3">
            <FooterLink to="/help">Help</FooterLink>
            <FooterLink to="/apply">Apply</FooterLink>
            <FooterLink to="/privacy">Privacy</FooterLink>
            <FooterLink to="/terms">Terms</FooterLink>
          </div>
        </div>

        <hr className="border-border my-6" />

        <p className="text-xs text-muted-foreground text-center">
          © {new Date().getFullYear()} Site Queen. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="text-sm font-medium text-foreground hover:text-brand-purple hover:no-underline"
    >
      {children}
    </Link>
  );
}
