import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import { Instagram, Facebook } from "lucide-react";

interface Props {
  name: string;
  email: string;
}

export default function SuccessScreen({ name, email }: Props) {
  const navigate = useNavigate();

  useEffect(() => {
    const end = Date.now() + 3000;
    const colors = ["hsl(280, 60%, 50%)", "hsl(330, 80%, 55%)", "#FFD700"];

    const frame = () => {
      confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 }, colors });
      confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, []);

  const firstName = (name || "").split(" ")[0] || "there";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="max-w-lg text-center space-y-6">
        <div className="text-6xl mb-4">♛</div>
        <h1 className="text-3xl font-bold text-foreground">Your application is in. ♛</h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          Thank you for taking the time to tell us about your business, {firstName}. We read every application personally — yours will be reviewed within 24 hours.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          If we think we're a great fit you'll hear from us with next steps. Keep an eye on{" "}
          <span className="font-semibold text-foreground">{email}</span>. ♛
        </p>

        <div className="pt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            While you wait — follow us for behind the scenes and client reveals
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <a href="https://instagram.com/SiteQueen" target="_blank" rel="noopener noreferrer" className="gap-2">
                <Instagram className="w-4 h-4" /> Instagram
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="https://tiktok.com/@SiteQueen" target="_blank" rel="noopener noreferrer" className="gap-2">
                <span className="font-bold text-sm">TT</span> TikTok
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="https://facebook.com/SiteQueen" target="_blank" rel="noopener noreferrer" className="gap-2">
                <Facebook className="w-4 h-4" /> Facebook
              </a>
            </Button>
          </div>
        </div>

        <Button onClick={() => navigate("/")} variant="ghost" className="mt-4">
          Back to Home
        </Button>
      </div>
    </div>
  );
}
