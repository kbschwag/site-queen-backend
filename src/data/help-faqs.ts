// Shared FAQ source for the public /help page and the client dashboard Support section.
export type FaqCategory = "Getting Started" | "Pricing" | "The Process" | "For Clients";

export interface Faq {
  category: FaqCategory;
  question: string;
  answer: string;
  /** If true, only show in contexts that have a logged-in client. */
  clientOnly?: boolean;
}

export const FAQS: Faq[] = [
  // Getting Started
  {
    category: "Getting Started",
    question: "How does SiteQueen work?",
    answer:
      "SiteQueen builds your professional website completely free using AI and our expert design team. You apply, we review your application, hop on a quick call to learn about your business, and build your site within 24 hours. You then pay a monthly subscription that covers hosting, maintenance, and ongoing support. No upfront cost, no technical skills needed.",
  },
  {
    category: "Getting Started",
    question: "Is the website really free?",
    answer:
      "Yes — the website build is completely free. We use AI to build professional websites faster than traditional agencies which lets us offer the build at no cost. You pay a monthly subscription starting at $79 that covers hosting, your domain, security, backups, and our ongoing support. Think of it like a phone plan — the phone can be free but you pay monthly for the service.",
  },
  {
    category: "Getting Started",
    question: "What's the catch — why is it free?",
    answer:
      "No catch. We build your site free because AI lets us do it efficiently, and we make our money through the monthly subscription. We only win if you stay — so we're motivated to build something you love and keep you happy every month.",
  },
  {
    category: "Getting Started",
    question: "How long does it take to build my site?",
    answer:
      "Most sites are ready within 24 hours of receiving your completed website brief. After our discovery call you fill out a short intake form, we build your site, schedule a revision call to go over it together, make any final tweaks, and get it live. Start to finish typically takes 3–5 days.",
  },
  {
    category: "Getting Started",
    question: "What kind of businesses do you work with?",
    answer:
      "We work with service-based small businesses across the United States — trades and contractors, wellness and beauty, professional services, food and hospitality, health and fitness, education and coaching, and more. We don't currently support ecommerce stores.",
  },
  {
    category: "Getting Started",
    question: "Do I need to provide anything?",
    answer:
      "Just some information about your business and ideally some photos. We'll ask for your services, business story, contact details, and any branding you have. No technical knowledge required — we handle everything else.",
  },
  {
    category: "Getting Started",
    question: "What happens after the 12 month commitment?",
    answer:
      "After your first 12 months your subscription goes month to month. You can stay, upgrade, downgrade, or cancel with no penalty. We just ask for 12 months upfront so we have enough time to deliver real results for your business.",
  },
  {
    category: "Getting Started",
    question: "How is SiteQueen different from Wix or Squarespace?",
    answer:
      "Wix and Squarespace are DIY tools — you build it yourself, which takes time and skill. SiteQueen is done for you — we build it, maintain it, and update it for you. Most small business owners try DIY website builders and give up or end up with something they're not proud of. With SiteQueen you get a professional result without touching a single line of code.",
  },
  {
    category: "Getting Started",
    question: "Can I see examples of sites you've built?",
    answer:
      "Yes — visit sitequeen.ai/examples to see our recent client websites. Every site is built using our AI pipeline and reviewed by our design team before going live.",
  },

  // Pricing
  {
    category: "Pricing",
    question: "How much does SiteQueen cost?",
    answer:
      "Our plans start at $79 per month. Starter is $79, Growth is $129, and Pro is $199. All plans include your free website build, hosting, domain, security, and monthly backups. Higher plans include more monthly credits for change requests and faster support response times.",
  },
  {
    category: "Pricing",
    question: "What are credits?",
    answer:
      "Credits are how you request changes to your website each month. Every plan comes with a monthly credit allowance — Starter gets 10, Growth gets 30, Pro gets 100. Different types of changes cost different amounts of credits. Unused credits roll over each month up to a cap. You can also buy extra credits anytime.",
  },
  {
    category: "Pricing",
    question: "What if I need more credits?",
    answer:
      "You can purchase extra credits anytime — 10 credits for $15, 30 credits for $35, or 100 credits for $99. Or you can upgrade your plan for a higher monthly allowance.",
  },
  {
    category: "Pricing",
    question: "Can I upgrade or downgrade my plan?",
    answer:
      "Yes — upgrade anytime and the change takes effect immediately. Downgrade takes effect at your next billing cycle.",
  },
  {
    category: "Pricing",
    question: "Is there a contract?",
    answer:
      "We ask for a 12 month commitment when you first sign up. After that it's month to month with no contract.",
  },

  // The Process
  {
    category: "The Process",
    question: "What happens after I apply?",
    answer:
      "We review every application personally within 24 hours. If we're a good fit we'll send you an approval email with a link to book your free discovery call. On that call we learn everything about your business. After the call you'll receive access to your dashboard where you complete a short intake form. We build your site, schedule a revision call to go over it together, make final tweaks, and get it live.",
  },
  {
    category: "The Process",
    question: "What is the revision call?",
    answer:
      "After we build your initial site we schedule a 15 minute call to review it together. This is your chance to tell us what you love and what you'd like changed. After the call we make any updates and share the final version for your approval before going live.",
  },
  {
    category: "The Process",
    question: "How do I get my domain?",
    answer:
      "If you already have a domain we'll connect it to your new site. If you don't have one we'll help you get one — domain registration is included in your subscription.",
  },
  {
    category: "The Process",
    question: "What if I already have a website?",
    answer:
      "We'll build you a completely new one. If you want to keep your existing site live while we build the new one that's no problem — we only switch over when you're happy with the new site and ready to go live.",
  },

  // For Clients (logged-in only on the public page)
  {
    category: "For Clients",
    clientOnly: true,
    question: "How do I submit a change request?",
    answer:
      "Log into your dashboard and go to Support Tickets. Select the type of change you need, describe exactly what you want changed, and submit. We'll get to work within 24-48 hours depending on your plan.",
  },
  {
    category: "For Clients",
    clientOnly: true,
    question: "How long do change requests take?",
    answer:
      "Standard requests are completed within 24-48 hours. If you're on the Pro plan you get same-day support. Urgent requests on any plan are processed within 4 hours for an additional 10 credits.",
  },
  {
    category: "For Clients",
    clientOnly: true,
    question: "What if I'm not happy with a change?",
    answer:
      "If we didn't get it right just let us know and we'll fix it at no additional credit cost. We want you to be happy with every update.",
  },
  {
    category: "For Clients",
    clientOnly: true,
    question: "How do I update my payment method?",
    answer:
      "Go to your dashboard, click Billing, and click Update payment method. This opens a secure Stripe page where you can add a new card.",
  },
  {
    category: "For Clients",
    clientOnly: true,
    question: "What happens if my payment fails?",
    answer:
      "We'll email you immediately and give you 7 days to update your payment method before any service interruption. Your website stays live during this grace period.",
  },
  {
    category: "For Clients",
    clientOnly: true,
    question: "Can I cancel anytime?",
    answer:
      "After your 12 month commitment you can cancel anytime. Go to your dashboard, click Billing, and follow the cancellation steps. Your site stays live until the end of your current billing period.",
  },
  {
    category: "For Clients",
    clientOnly: true,
    question: "How do I share my website on social media?",
    answer:
      "Once your site is live go to My Website in your dashboard. You'll find pre-written social media captions for Instagram, Facebook, and TikTok that you can copy and post in one click.",
  },
  {
    category: "For Clients",
    clientOnly: true,
    question: "How do the credits work?",
    answer:
      "Every plan comes with a monthly credit allowance. Different change types cost different amounts of credits. Unused credits roll over each month up to a cap. You can buy extra credits anytime from your Billing page.",
  },
  {
    category: "For Clients",
    clientOnly: true,
    question: "What happens when I run out of credits?",
    answer:
      "You can buy more credits anytime or upgrade your plan for a higher monthly allowance. Your site stays live — you just can't submit new change requests until you have credits.",
  },
];

export const FAQ_CATEGORIES: FaqCategory[] = [
  "Getting Started",
  "Pricing",
  "The Process",
  "For Clients",
];
