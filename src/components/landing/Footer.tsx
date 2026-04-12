import { Link } from "react-router-dom";
import { Crown } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t py-12 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg text-foreground">
            <Crown className="h-5 w-5 text-primary" />
            SiteQueen
          </Link>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <Link to="/apply" className="hover:text-foreground transition-colors">Apply</Link>
            <Link to="/login" className="hover:text-foreground transition-colors">Login</Link>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} SiteQueen. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
