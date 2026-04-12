import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";

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
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, []);

  const firstName = name.split(" ")[0];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-lg text-center space-y-6">
        <div className="text-6xl mb-4">♛</div>
        <h1 className="text-3xl font-bold text-foreground">
          Your application is in, {firstName}!
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          We review every application personally and you'll hear from us within 24 hours.
          Keep an eye on your inbox at <span className="font-semibold text-foreground">{email}</span>.
        </p>
        <p className="text-muted-foreground">
          In the meantime, follow us on Instagram{" "}
          <a
            href="https://instagram.com/SiteQueen"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-semibold hover:underline"
          >
            @SiteQueen
          </a>{" "}
          for behind-the-scenes and client reveals.
        </p>
        <Button onClick={() => navigate("/")} className="mt-4">
          Back to Home
        </Button>
      </div>
    </div>
  );
}
