import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

// Anonymous client for public form submissions (avoids auth token interference)
const anonClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

export default function Apply() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", business_name: "", business_type: "",
    city_state: "", years_in_business: "", monthly_clients: "", monthly_revenue: "",
    is_decision_maker: true, has_website: "", website_goal: "", brand_vibe: "",
    has_logo: "", plan_interest: "", accepts_commitment: "",
  });

  const update = (field: string, value: string | boolean) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Use anonymous client to avoid auth token issues with public form
    const { data, error } = await anonClient.from("applications").insert([form]).select().single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Trigger lead scoring
    supabase.functions.invoke("score-lead", { body: { applicationId: data.id } }).catch(console.error);

    // Trigger confirmation email
    supabase.functions.invoke("send-email", {
      body: { to: form.email, template: "application_received", data: { name: form.name, business_name: form.business_name }, applicationId: data.id },
    }).catch(console.error);

    toast({ title: "Application submitted!", description: "We'll review it and get back to you within 24-48 hours." });
    navigate("/");
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Apply for SiteQueen</CardTitle>
          <CardDescription>Tell us about your business and we'll get back to you within 24-48 hours.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input value={form.name} onChange={(e) => update("name", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Business Name *</Label>
                <Input value={form.business_name} onChange={(e) => update("business_name", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Business Type *</Label>
                <Select onValueChange={(v) => update("business_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {["Salon/Spa", "Restaurant", "Retail", "Coaching/Consulting", "Health/Wellness", "Real Estate", "Contractor/Trades", "Other"].map((t) => (
                      <SelectItem key={t} value={t.toLowerCase()}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>City, State *</Label>
                <Input value={form.city_state} onChange={(e) => update("city_state", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Years in Business *</Label>
                <Select onValueChange={(v) => update("years_in_business", v)}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {["Less than 1", "1-2", "3-5", "5-10", "10+"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Monthly Clients *</Label>
                <Select onValueChange={(v) => update("monthly_clients", v)}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {["1-10", "11-50", "51-100", "100+"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Monthly Revenue *</Label>
                <Select onValueChange={(v) => update("monthly_revenue", v)}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {["Under $1k", "$1k-$5k", "$5k-$10k", "$10k+"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Do you have a website?</Label>
                <Select onValueChange={(v) => update("has_website", v)}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>What's your main goal for a website?</Label>
              <Textarea value={form.website_goal} onChange={(e) => update("website_goal", e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Brand Vibe</Label>
              <Select onValueChange={(v) => update("brand_vibe", v)}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {["Modern & Minimal", "Bold & Vibrant", "Elegant & Luxurious", "Warm & Friendly", "Professional & Corporate"].map((t) => (
                    <SelectItem key={t} value={t.toLowerCase()}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Do you have a logo?</Label>
              <Select onValueChange={(v) => update("has_logo", v)}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="need_one">I need one</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Plan Interest</Label>
              <Select onValueChange={(v) => update("plan_interest", v)}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter ($149/mo)</SelectItem>
                  <SelectItem value="growth">Growth ($249/mo)</SelectItem>
                  <SelectItem value="premium">Premium ($399/mo)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="decision_maker"
                checked={form.is_decision_maker}
                onCheckedChange={(v) => update("is_decision_maker", !!v)}
              />
              <Label htmlFor="decision_maker">I am the decision maker for this business</Label>
            </div>

            <div className="space-y-2">
              <Label>Are you ready to commit to a monthly plan?</Label>
              <Select onValueChange={(v) => update("accepts_commitment", v)}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes, I'm ready</SelectItem>
                  <SelectItem value="exploring">Just exploring</SelectItem>
                  <SelectItem value="need_info">Need more info</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Submitting..." : "Submit Application"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
