import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import {
  Mail,
  Send,
  Calendar,
  AtSign,
  BookOpen,
  Search,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { FAQS } from "@/data/help-faqs";

const SUPPORT_EMAIL = "hello@sitequeen.ai";

// FAQ items shown in the dashboard support quick-help panel
const CLIENT_FAQ_QUESTIONS = [
  "How do I submit a change request?",
  "How do the credits work?",
  "What happens when I run out of credits?",
  "How long do change requests take?",
  "What if I'm not happy with a change?",
  "How do I update my payment method?",
  "What happens if my payment fails?",
  "Can I cancel anytime?",
  "What is the revision call?",
  "How do I share my website on social media?",
];

const dashboardFaqs = CLIENT_FAQ_QUESTIONS.map((q) => {
  const found =
    FAQS.find((f) => f.question === q) ||
    FAQS.find((f) => f.question.toLowerCase() === q.toLowerCase()) ||
    // fuzzy fallback: match on question prefix or unique keywords
    FAQS.find((f) => {
      const lf = f.question.toLowerCase();
      const lq = q.toLowerCase();
      return lf.includes(lq.split(" ").slice(0, 4).join(" "));
    });
  return found
    ? { q: found.question, a: found.answer }
    : { q, a: "" };
}).filter((f) => f.a);

async function trySend(payload: {
  client_id: string | null;
  user_id: string;
  message: string;
  client_name: string;
  business_name: string;
  client_email: string;
}) {
  const { error } = await supabase
    .from("support_messages")
    .insert(payload as any);
  return !error;
}

export default function ClientContact() {
  const { user } = useAuth();

  const { data: client } = useQuery({
    queryKey: ["my-client-support", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, business_name")
        .eq("user_id", user!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: profile } = useQuery({
    queryKey: ["my-profile-support", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: settings } = useQuery({
    queryKey: ["app-settings-support"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["calendly_support_url"]);
      const map: Record<string, string> = {};
      (data || []).forEach((row: any) => (map[row.key] = row.value));
      return map;
    },
  });

  const supportCalendly =
    settings?.calendly_support_url ||
    "https://calendly.com/sitequeenai/support-call";

  const businessName = client?.business_name || "your business";
  const fullName = profile?.full_name || user?.email?.split("@")[0] || "Client";
  const email = profile?.email || user?.email || "";

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");

  const filteredFaqs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dashboardFaqs;
    return dashboardFaqs.filter(
      (f) =>
        f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)
    );
  }, [search]);

  const handleSend = async () => {
    const text = message.trim();
    if (!text || !user) return;
    setSending(true);

    const payload = {
      client_id: client?.id || null,
      user_id: user.id,
      message: text,
      client_name: fullName,
      business_name: client?.business_name || "",
      client_email: email,
    };

    // Try once, then silently retry, then send email no matter what.
    let ok = await trySend(payload);
    if (!ok) ok = await trySend(payload);

    // Always fire the email — never show error to client per spec
    try {
      await supabase.functions.invoke("send-email", {
        body: {
          to: SUPPORT_EMAIL,
          template: "support_message_received",
          replyTo: email || undefined,
          data: {
            client_name: fullName,
            business_name: client?.business_name || "",
            client_email: email,
            message: text,
          },
          clientId: client?.id || undefined,
        },
      });
    } catch {
      /* swallow per spec */
    }

    setMessage("");
    setSending(false);
    toast.success("Message sent ♛", {
      description: "We'll be in touch shortly.",
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-bold">Support</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Reach our team or browse common questions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — Contact options */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">We're here for you ♛</h2>
            <p className="text-sm text-muted-foreground">
              Choose the best way to reach us
            </p>
          </div>

          {/* Card 1 — Send a message */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" /> Send us a message
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                We typically respond within a few hours
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Hi, I have a question about..."
                rows={4}
                disabled={sending}
              />
              <Button
                onClick={handleSend}
                disabled={sending || !message.trim()}
                className="w-full gap-2"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send message ♛
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Sending as <strong>{fullName}</strong>
                {email ? <> &lt;{email}&gt;</> : null}
              </p>
            </CardContent>
          </Card>

          {/* Card 2 — Book a support call */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" /> Book a support
                call
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                15 minutes with a real person — free for all clients
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild className="w-full gap-2">
                <a
                  href={supportCalendly}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Calendar className="h-4 w-4" />
                  Book a call ♛
                </a>
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Check your email for confirmation after booking
              </p>
            </CardContent>
          </Card>

          {/* Card 3 — Email directly */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AtSign className="h-4 w-4 text-primary" /> Email us
              </CardTitle>
              <p className="text-xs text-muted-foreground">{SUPPORT_EMAIL}</p>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full gap-2">
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                    `Support request — ${businessName}`
                  )}`}
                >
                  <Mail className="h-4 w-4" />
                  Open email ♛
                </a>
              </Button>
            </CardContent>
          </Card>

          {/* Card 4 — Help guides */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" /> Help guides
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Browse FAQs and how-to guides
              </p>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full gap-2">
                <a href="/help" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Browse guides ♛
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — Quick help */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Quick help</h2>
            <p className="text-sm text-muted-foreground">
              Common questions, instant answers
            </p>
          </div>

          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search help articles..."
                  className="pl-9"
                />
              </div>

              {filteredFaqs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No matches. Try{" "}
                  <a
                    href="/help"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    the full help center
                  </a>
                  .
                </p>
              ) : (
                <Accordion type="single" collapsible className="w-full">
                  {filteredFaqs.map((f, i) => (
                    <AccordionItem key={f.q} value={`faq-${i}`}>
                      <AccordionTrigger className="text-sm text-left">
                        {f.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground">
                        {f.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}

              <div className="border-t pt-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">
                  Can't find what you're looking for?
                </p>
                <a
                  href="/help"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                >
                  View full help center
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
