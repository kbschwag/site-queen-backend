import { Card, CardContent } from "@/components/ui/card";
import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Maria Santos",
    business: "Glow Beauty Studio",
    quote: "SiteQueen built my website in 2 days and I've gotten 15 new clients in the first month! I wish I'd done this sooner.",
    rating: 5,
  },
  {
    name: "Jessica Williams",
    business: "JW Fitness Coaching",
    quote: "I used to spend hours trying to update my old website. Now I just send a message and it's done. Total game changer.",
    rating: 5,
  },
  {
    name: "Tanya Brooks",
    business: "Sweet Indulgence Bakery",
    quote: "Professional, fast, and they actually understand small businesses. My site looks better than competitors charging 10x more.",
    rating: 5,
  },
];

export function Testimonials() {
  return (
    <section className="py-20 bg-secondary/30">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center text-foreground">
          Loved by Local Business Owners
        </h2>
        <p className="mt-3 text-center text-muted-foreground text-lg max-w-xl mx-auto">
          See what our clients have to say
        </p>
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {testimonials.map((t) => (
            <Card key={t.name} className="bg-card">
              <CardContent className="pt-6">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-foreground italic">"{t.quote}"</p>
                <div className="mt-4 pt-4 border-t">
                  <p className="font-semibold text-foreground">{t.name}</p>
                  <p className="text-sm text-muted-foreground">{t.business}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
