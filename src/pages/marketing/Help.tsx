import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Mail, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
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
    <>
      {/* Hero */}
      <section
        style={{
          backgroundColor: "#534AB7",
          color: "#ffffff",
          padding: "5rem 2rem 4rem",
        }}
      >
        <div style={{ maxWidth: 880, margin: "0 auto", textAlign: "center" }}>
          <h1
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: "clamp(2rem, 5vw, 3.25rem)",
              margin: "0 0 1rem",
              fontWeight: 500,
              lineHeight: 1.15,
            }}
          >
            How can we help? ♛
          </h1>
          <p
            style={{
              fontSize: "1.125rem",
              opacity: 0.85,
              margin: "0 0 2.5rem",
              fontFamily: '"Inter", sans-serif',
            }}
          >
            Find answers to common questions about SiteQueen
          </p>

          {/* Search */}
          <div
            style={{
              position: "relative",
              maxWidth: 640,
              margin: "0 auto 1.5rem",
            }}
          >
            <Search
              size={20}
              style={{
                position: "absolute",
                left: 18,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#534AB7",
                opacity: 0.6,
              }}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for anything..."
              style={{
                width: "100%",
                padding: "1rem 1rem 1rem 3rem",
                borderRadius: 999,
                border: "none",
                fontSize: "1rem",
                fontFamily: '"Inter", sans-serif',
                color: "#1a1a2e",
                boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                outline: "none",
              }}
            />
          </div>

          {/* Filter chips */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "0.5rem",
            }}
          >
            {FILTERS.map((f) => {
              const active = f === filter;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: "0.5rem 1.1rem",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.4)",
                    background: active ? "#ffffff" : "transparent",
                    color: active ? "#534AB7" : "#ffffff",
                    fontSize: "0.875rem",
                    fontFamily: '"Inter", sans-serif',
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {f === "All" ? "All" : f}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ list */}
      <section style={{ padding: "4rem 2rem" }}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          {visibleFaqs.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "3rem 1rem",
                color: "var(--sq-stone, #6b6776)",
                fontFamily: '"Inter", sans-serif',
              }}
            >
              <p style={{ fontSize: "1rem", margin: 0 }}>
                No results for &ldquo;{query}&rdquo; — try different keywords or
                contact us at{" "}
                <a
                  href="mailto:hello@sitequeen.ai"
                  style={{ color: "#534AB7", fontWeight: 600 }}
                >
                  hello@sitequeen.ai
                </a>
              </p>
            </div>
          ) : (
            Array.from(grouped.entries()).map(([cat, items]) => (
              <div key={cat} style={{ marginBottom: "3rem" }}>
                <h2
                  style={{
                    fontFamily: '"Playfair Display", Georgia, serif',
                    fontSize: "1.75rem",
                    fontWeight: 500,
                    color: "var(--sq-aubergine, #3c1f3b)",
                    marginBottom: "1.25rem",
                  }}
                >
                  {cat}
                </h2>

                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: 16,
                    border: "1px solid rgba(60,31,59,0.08)",
                    overflow: "hidden",
                  }}
                >
                  {items.map((faq) => {
                    const id = `${faq.category}-${faq.question}`;
                    const isOpen = openId === id;
                    return (
                      <div
                        key={id}
                        style={{
                          borderBottom: "1px solid rgba(60,31,59,0.06)",
                        }}
                      >
                        <button
                          onClick={() => setOpenId(isOpen ? null : id)}
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "1.1rem 1.5rem",
                            background: "transparent",
                            border: "none",
                            textAlign: "left",
                            cursor: "pointer",
                            fontFamily: '"Inter", sans-serif',
                            fontSize: "1rem",
                            fontWeight: 500,
                            color: "var(--sq-charcoal, #2a2530)",
                          }}
                          aria-expanded={isOpen}
                        >
                          <span>{faq.question}</span>
                          <ChevronDown
                            size={18}
                            style={{
                              transform: isOpen ? "rotate(180deg)" : "none",
                              transition: "transform 0.2s",
                              flexShrink: 0,
                              marginLeft: "1rem",
                              color: "#534AB7",
                            }}
                          />
                        </button>
                        <div
                          style={{
                            maxHeight: isOpen ? 600 : 0,
                            overflow: "hidden",
                            transition:
                              "max-height 0.3s ease, padding 0.2s ease",
                            padding: isOpen
                              ? "0 1.5rem 1.25rem 1.5rem"
                              : "0 1.5rem",
                          }}
                        >
                          <p
                            style={{
                              margin: 0,
                              color: "var(--sq-stone, #6b6776)",
                              fontFamily: '"Inter", sans-serif',
                              fontSize: "0.95rem",
                              lineHeight: 1.7,
                            }}
                          >
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
      <section
        style={{
          background: "var(--sq-cream, #f8f5f0)",
          padding: "4rem 2rem",
          textAlign: "center",
        }}
      >
        <Mail
          size={32}
          style={{ color: "#534AB7", marginBottom: "1rem" }}
          aria-hidden
        />
        <h2
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: "2rem",
            fontWeight: 500,
            color: "var(--sq-aubergine, #3c1f3b)",
            margin: "0 0 0.5rem",
          }}
        >
          Still have questions? ♛
        </h2>
        <p
          style={{
            fontFamily: '"Inter", sans-serif',
            color: "var(--sq-stone, #6b6776)",
            margin: "0 0 2rem",
          }}
        >
          We&apos;re real people — reach out anytime
        </p>
        <div
          style={{
            display: "flex",
            gap: "1rem",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <a
            href="mailto:hello@sitequeen.ai"
            className="sq-button"
            style={{ background: "#534AB7" }}
          >
            Email us
          </a>
          {isLoggedIn ? (
            <Link to="/dashboard" className="sq-button">
              Go to my dashboard
            </Link>
          ) : (
            <Link to="/apply" className="sq-button">
              Apply now
            </Link>
          )}
        </div>
      </section>
    </>
  );
}
