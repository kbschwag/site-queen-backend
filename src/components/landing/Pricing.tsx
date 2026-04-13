import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Starter",
    price: "$79",
    description: "Get online with a professional website — free to build",
    features: [
      "Free professional website build (valued at $3,000+)",
      "Custom domain and hosting",
      "1 monthly backup",
      "10 support credits per month",
      "Credits roll over up to 20",
      "Buy extra credits anytime",
      "Standard email support",
      "12-month commitment required",
      "After 12 months: month-to-month flexibility",
    ],
    popular: false,
  },
  {
    name: "Growth",
    price: "$129",
    description: "More support, more updates, more growth",
    features: [
      "Everything in Starter plus:",
      "Advanced security monitoring",
      "Weekly backups",
      "30 support credits per month",
      "Credits roll over up to 60",
      "Priority support",
      "12-month commitment required",
      "After 12 months: month-to-month flexibility",
    ],
    popular: true,
  },
  {
    name: "Pro",
    price: "$199",
    description: "Full-service management with dedicated support",
    features: [
      "Everything in Growth plus:",
      "Daily backups",
      "100 support credits per month",
      "Credits roll over up to 200",
      "Dedicated account management",
      "Professional branding and logo design included",
      "Fastest priority support",
      "12-month commitment required",
      "After 12 months: month-to-month flexibility",
    ],
    popular: false,
  },
];

const faqs = [
  {
    question: "Why the 12-month commitment?",
    answer:
      "We invest significant time building your website for free. The 12-month partnership lets us deliver real long-term results for your business while keeping our prices low for everyone.",
  },
  {
    question: "What happens if I cancel?",
    answer:
      "After your 12 months you can cancel anytime with 30 days notice. You keep your domain and receive a full export of your website files.",
  },
  {
    question: "Can I upgrade my plan?",
    answer:
      "Absolutely. Upgrade anytime and the new features kick in immediately. Downgrading takes effect at your next billing cycle.",
  },
  {
    question: "What are support credits?",
    answer:
      "Credits are how you request changes to your website. Small changes like updating a phone number cost 5 credits. Larger changes like adding a new page section cost 60 credits. You can buy extra credits anytime if you run out.",
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
          Every plan includes a free professional AI website — you just pay to keep it running
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

        <p className="mt-10 text-center text-muted-foreground text-sm max-w-2xl mx-auto">
          All plans include a free professional website build. After your 12-month commitment
          you're free to stay month-to-month, renew annually, or take your website and go.
          No hard feelings. ♛
        </p>

        {/* FAQ */}
        <div className="mt-16 max-w-2xl mx-auto">
          <h3 className="text-2xl font-bold text-center text-foreground mb-6">
            Frequently Asked Questions
          </h3>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
