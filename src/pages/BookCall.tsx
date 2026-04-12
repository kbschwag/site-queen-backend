import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const CALENDLY_URL = "https://calendly.com/sitequeenai/30min";

export default function BookCall() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const name = searchParams.get("name") || "";

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://assets.calendly.com/assets/external/widget.js";
    script.async = true;
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12 text-center space-y-6">
        <div className="text-5xl">♛</div>
        <h1 className="text-3xl font-bold text-foreground">
          {name ? `Congratulations, ${name}!` : "Congratulations!"} You've been approved.
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Your next step is to book a quick discovery call with us. We'll go over your website vision, 
          answer any questions, and get your project started.
        </p>

        <div
          className="calendly-inline-widget rounded-xl border overflow-hidden"
          data-url={`${CALENDLY_URL}?hide_gdpr_banner=1&hide_landing_page_details=1${name ? `&name=${encodeURIComponent(name)}` : ""}`}
          style={{ minWidth: "320px", height: "700px" }}
        />

        <p className="text-sm text-muted-foreground">
          Can't find a time that works?{" "}
          <button onClick={() => navigate("/")} className="text-primary hover:underline">
            Go back to the homepage
          </button>{" "}
          and we'll reach out to you directly.
        </p>
      </div>
    </div>
  );
}
