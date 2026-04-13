import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CreditCostReference } from "@/components/client/CreditCostReference";
import { BookOpen, Video, Mail, MessageSquare } from "lucide-react";

const guides = [
  {
    title: "How to submit a support ticket",
    content:
      "Go to Support Tickets from the sidebar, click 'Submit a Request', choose what type of change you need, describe it in detail, and hit submit. Credits are deducted automatically.",
  },
  {
    title: "Understanding your credits",
    content:
      "Each plan includes monthly credits that refresh on the 1st of each month. Unused credits roll over up to your plan's cap. You can always buy more credits if you run out.",
  },
  {
    title: "How to share your website",
    content:
      "Once your site is live, visit the My Website page for ready-to-copy social media text. Share it on Instagram, Facebook, and TikTok to announce your new site!",
  },
];

const faqs = [
  { q: "How long do change requests take?", a: "Standard requests are completed within 24-48 hours. Urgent requests (+10 credits) are processed within 4 hours." },
  { q: "What happens when I run out of credits?", a: "You can buy more credits anytime or upgrade your plan for more monthly credits. Your site stays live — you just can't submit new requests until you have credits." },
  { q: "Can I upgrade my plan anytime?", a: "Yes! Go to Billing and click Upgrade on any higher plan. The change takes effect immediately and your billing is prorated." },
  { q: "What happens after my 12-month commitment?", a: "Your service becomes month-to-month. You can cancel anytime and you retain ownership of your website files and domain." },
  { q: "How do I update my payment method?", a: "Go to Billing and click 'Update payment method' to securely update your card details." },
  { q: "What if I'm not happy with a change?", a: "Let us know! Submit another ticket describing what needs adjustment. We want you to be 100% happy with every change." },
  { q: "Can I get a refund on credits?", a: "Credits are non-refundable, but if we decline a request your credits are automatically refunded." },
  { q: "How do I cancel?", a: "Go to Billing and scroll to the bottom. We'll offer a pause option first. If you proceed, your site stays live for 30 days." },
];

export default function ClientHelp() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
      <h1 className="text-xl font-bold">Help Center</h1>

      {/* Getting started */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Getting Started
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {guides.map((guide) => (
            <div key={guide.title} className="rounded-lg border p-4">
              <h3 className="text-sm font-semibold mb-1">{guide.title}</h3>
              <p className="text-sm text-muted-foreground">{guide.content}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Credit reference */}
      <CreditCostReference />

      {/* FAQ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Frequently Asked Questions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-sm text-left">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardContent className="pt-6 text-center space-y-2">
          <Mail className="h-8 w-8 text-primary mx-auto" />
          <h3 className="font-semibold">Still need help? We're here.</h3>
          <p className="text-sm text-muted-foreground">
            Email{" "}
            <a href="mailto:hello@sitequeen.ai" className="text-primary hover:underline">
              hello@sitequeen.ai
            </a>
          </p>
          <p className="text-xs text-muted-foreground">
            Expected response time: within 24 hours
          </p>
          <p className="text-xs text-muted-foreground">
            For urgent website issues, include your domain name in the subject line
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
