import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function DeclineScreen() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-lg text-center space-y-6">
        <div className="text-6xl mb-4">♛</div>
        <h1 className="text-2xl font-bold text-foreground">Thank you for your interest in SiteQueen</h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          After reviewing your application, we don't think we're the right fit right now — but that can change.
          You're welcome to reapply in the future.
        </p>
        <p className="text-muted-foreground text-lg">
          We wish you and your business all the best. ♛
        </p>
        <Button onClick={() => navigate("/")} variant="outline" className="mt-4">
          Back to Home
        </Button>
      </div>
    </div>
  );
}
