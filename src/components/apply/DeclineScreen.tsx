import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function DeclineScreen() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="max-w-lg text-center space-y-6">
        <div className="text-6xl mb-4">♛</div>
        <h1 className="text-2xl font-bold text-foreground">Thank you for applying ♛</h1>
        <div className="space-y-4 text-muted-foreground text-base sm:text-lg leading-relaxed">
          <p>We appreciate you taking the time to tell us about your business.</p>
          <p>
            After reviewing your application we don't think we're the right fit for each other right now.
          </p>
          <p>
            We're selective about who we work with — not because we don't believe in your business, but because we want to make sure every website we build truly serves the business it represents.
          </p>
          <p>
            You're welcome to apply again in the future. We wish you and your business all the best. ♛
          </p>
        </div>
        <Button onClick={() => navigate("/")} variant="outline" className="mt-4">
          Back to Home
        </Button>
      </div>
    </div>
  );
}
