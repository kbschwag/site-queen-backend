import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Mail, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { FAQS, FAQ_CATEGORIES, type FaqCategory } from "@/data/help-faqs";

type Filter = "All" | FaqCategory;

const FILTERS: Filter[] = ["All", ...FAQ_CATEGORIES];

export default function MarketingHelp() {
  const { user } = useAuth();
  const isLoggedIn = !!user;

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [openId, setOpenId] = useState<string | null>(null);

  const visibleFaqs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQS.filter((f) => {
      if (f.clientOnly && !isLoggedIn) return false;
      if (filter !== "All" && f.category !== filter) return false;
      if (!q) return true;
      return (
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q)
      );
    });
  }, [query, filter, isLoggedIn]);

  const grouped = useMemo(() => {
    const map = new Map<FaqCategory, typeof FAQS>();
    visibleFaqs.forEach((f) => {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push(f);
    });
    return map;
  }, [visibleFaqs]);

  return (
    <main className="bg-background min-h-dvh">
      {/* Hero */}
      <section className="bg-brand-purple-deep text-white px-6 pt-20 pb-16">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="font-display text-4xl md:text-5xl font-extrabold tracking-tight mb-3 text-white">
            How can we help? <span className="text-brand-gold">♛</span>
          </h1>
          <p className="text-lg text-white/80 mb-10">
            Find answers to common questions about Site Queen
          </p>

          {/* Search */}
          <div className="relative max-w-xl mx-auto mb-6">
            <Search
              size={20}
              className="absolute left-5 top-1/2 -translate-y-1/2 text-brand-purple/70 pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for anything…"
              aria-label="Search help articles"
              className="w-full h-14 pl-12 pr-5 rounded-pill bg-white text-foreground placeholder:text-muted-foreground shadow-lg outline-none focus-visible:ring-[3px] focus-visible:ring-brand-gold/60"
            />
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap justify-center gap-2">
            {FILTERS.map((f) => {
              const active = f === filter;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={[
                    "px-4 py-2 rounded-pill text-sm font-semibold border transition-all",
                    active
                      ? "bg-white text-brand-purple border-white shadow-sm"
                      : "bg-transparent text-white/90 border-white/40 hover:bg-white/10",
                  ].join(" ")}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ list */}
      <section className="px-6 py-16">
        <div className="max-w-3xl mx-auto">
          {visibleFaqs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-base">
                No results for &ldquo;{query}&rdquo; — try different keywords or
                email us at{" "}
                <a
                  href="mailto:hello@sitequeen.ai"
                  className="sq-link"
                >
                  hello@sitequeen.ai
                </a>
              </p>
            </div>
          ) : (
            Array.from(grouped.entries()).map(([cat, items]) => (
              <div key={cat} className="mb-12">
                <h2 className="text-2xl font-bold text-ink mb-5">
                  {cat}
                </h2>

                <div className="bg-card rounded-card border border-border shadow-sm overflow-hidden">
                  {items.map((faq, idx) => {
                    const id = `${faq.category}-${faq.question}`;
                    const isOpen = openId === id;
                    return (
                      <div
                        key={id}
                        className={
                          idx !== items.length - 1
                            ? "border-b border-border"
                            : ""
                        }
                      >
                        <button
                          onClick={() => setOpenId(isOpen ? null : id)}
                          aria-expanded={isOpen}
                          className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left font-semibold text-ink hover:bg-brand-purple-soft/60 transition-colors"
                        >
                          <span>{faq.question}</span>
                          <ChevronDown
                            size={18}
                            className={[
                              "shrink-0 text-brand-purple transition-transform",
                              isOpen ? "rotate-180" : "",
                            ].join(" ")}
                          />
                        </button>
                        <div
                          className="overflow-hidden transition-all duration-300"
                          style={{
                            maxHeight: isOpen ? 600 : 0,
                          }}
                        >
                          <p className="px-6 pb-5 text-muted-foreground leading-relaxed">
                            {faq.answer}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Contact CTA */}
      <section className="bg-brand-purple-soft px-6 py-16 text-center">
        <Mail
          size={32}
          className="mx-auto text-brand-purple mb-3"
          aria-hidden
        />
        <h2 className="text-3xl font-extrabold text-ink mb-2">
          Still have questions? <span className="text-brand-gold">♛</span>
        </h2>
        <p className="text-muted-foreground mb-8">
          We&apos;re real people — reach out anytime.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Button asChild>
            <a href="mailto:hello@sitequeen.ai">Email us</a>
          </Button>
          {isLoggedIn ? (
            <Button asChild variant="outline">
              <Link to="/dashboard">Go to my dashboard</Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link to="/apply">Apply now</Link>
            </Button>
          )}
        </div>
      </section>
    </main>
  );
}
