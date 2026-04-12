import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Starter",
    price: "$149",
    description: "Perfect for new businesses getting online",
    features: [
      "Custom one-page website",
      "Mobile responsive design",
      "Basic SEO setup",
      "2 content updates/month",
      "Hosting included",
      "SSL certificate",
    ],
    popular: false,
  },
  {
    name: "Growth",
    price: "$249",
    description: "For businesses ready to attract more clients",
    features: [
      "Multi-page website (up to 5)",
      "Advanced SEO optimization",
      "Google Business integration",
      "5 content updates/month",
      "Blog setup",
      "Contact form & booking",
      "Monthly analytics report",
    ],
    popular: true,
  },
  {
    name: "Premium",
    price: "$399",
    description: "Full-service digital presence management",
    features: [
      "Unlimited pages",
      "E-commerce ready",
      "10 content updates/month",
      "Social media integration",
      "Priority support",
      "Custom features",
      "Weekly analytics reports",
      "Logo design included",
    ],
    popular: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-20">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center text-foreground">
          Simple, Transparent Pricing
        </h2>
        <p className="mt-3 text-center text-muted-foreground text-lg max-w-xl mx-auto">
          Everything you need to get online — no hidden fees
        </p>
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={`relative flex flex-col ${plan.popular ? "border-primary shadow-lg shadow-primary/10 scale-105" : ""}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                  Most Popular
                </div>
              )}
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <ul className="space-y-3 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className="mt-6 w-full rounded-full"
                  variant={plan.popular ? "default" : "outline"}
                >
                  <Link to="/apply">Get Started</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
