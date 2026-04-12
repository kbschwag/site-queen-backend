import { ClipboardList, Palette, Rocket } from "lucide-react";

const steps = [
  { icon: ClipboardList, title: "Apply", description: "Fill out a quick application so we can learn about your business and goals." },
  { icon: Palette, title: "We Design & Build", description: "Our team creates a stunning, custom website tailored to your brand in 48 hours." },
  { icon: Rocket, title: "Launch & Grow", description: "We handle updates, hosting, and maintenance so you can focus on your clients." },
];

export function HowItWorks() {
  return (
    <section className="py-20 bg-secondary/30">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center text-foreground">
          How It Works
        </h2>
        <p className="mt-3 text-center text-muted-foreground text-lg max-w-xl mx-auto">
          Three simple steps to your new website
        </p>
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {steps.map((step, i) => (
            <div key={step.title} className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground text-2xl font-bold">
                <step.icon className="h-7 w-7" />
              </div>
              <div className="mt-2 text-sm font-medium text-primary">Step {i + 1}</div>
              <h3 className="mt-2 text-xl font-semibold text-foreground">{step.title}</h3>
              <p className="mt-2 text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
