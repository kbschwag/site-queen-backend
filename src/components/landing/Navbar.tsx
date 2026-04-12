import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Crown } from "lucide-react";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-xl text-foreground">
          <Crown className="h-6 w-6 text-primary" />
          SiteQueen
        </Link>
        <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          <Link to="/login" className="hover:text-foreground transition-colors">Login</Link>
          <Button asChild size="sm" className="rounded-full">
            <Link to="/apply">Apply Now</Link>
          </Button>
        </div>
        <Button asChild size="sm" className="md:hidden rounded-full">
          <Link to="/apply">Apply</Link>
        </Button>
      </div>
    </nav>
  );
}
