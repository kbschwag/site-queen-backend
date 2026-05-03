import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, ExternalLink, Globe, Loader2, RefreshCw, Rocket, Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { buildSitePreviewUrl } from "@/lib/site-preview";

interface Props {
  clientId: string;
  businessName: string;
  domainName?: string | null;
  lastDeployedAt?: string | null;
  deployCount?: number | null;
  onRepublished?: () => void;
}

type DnsState = "checking" | "resolving" | "propagating" | "not_resolving";

export function LiveStatusPanel({
  clientId,
  businessName,
  domainName,
  lastDeployedAt,
  deployCount,
  onRepublished,
}: Props) {
  const [dnsState, setDnsState] = useState<DnsState>("checking");
  const [republishing, setRepublishing] = useState(false);
  const stagingUrl = buildSitePreviewUrl(clientId);
  const liveUrl = domainName ? `https://${domainName.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : null;

  async function checkDns() {
    if (!domainName) {
      setDnsState("not_resolving");
      return;
    }
    setDnsState("checking");
    try {
      const host = domainName.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const resp = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`);
      const data = await resp.json();
      const answers = (data?.Answer || []).filter((a: any) => a.type === 1);
      if (answers.length === 0) {
        setDnsState("not_resolving");
      } else {
        // Hostinger shared hosting IP block is 84.32.84.x / 145.14.x (varies).
        // We can't be 100% certain, so any A record = "resolving".
        setDnsState("resolving");
      }
    } catch {
      setDnsState("propagating");
    }
  }

  useEffect(() => {
    checkDns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainName]);

  const handleRepublish = async () => {
    setRepublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke("deploy-to-hostinger", {
        body: { client_id: clientId },
      });
      if (error || (data && data.success === false)) {
        throw new Error(error?.message || data?.error || "Republish failed");
      }
      toast.success("Republished to Hostinger ♛");
      onRepublished?.();
      checkDns();
    } catch (e: any) {
      toast.error(e?.message || "Republish failed");
    } finally {
      setRepublishing(false);
    }
  };

  const dnsConfig: Record<DnsState, { label: string; cls: string }> = {
    checking:       { label: "Checking DNS…",        cls: "bg-muted text-muted-foreground" },
    resolving:      { label: "DNS resolving ✓",      cls: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
    propagating:    { label: "DNS propagating",      cls: "bg-amber-500/10 text-amber-700 border-amber-200" },
    not_resolving:  { label: "Not resolving",        cls: "bg-destructive/10 text-destructive border-destructive/20" },
  };
  const dns = dnsConfig[dnsState];

  return (
    <Card className="border-emerald-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-emerald-800">
          <CheckCircle2 className="h-5 w-5" />
          {businessName} is live ♛
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Domain + DNS status */}
        <div className="rounded-lg border bg-emerald-50/40 p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Globe className="h-4 w-4 text-emerald-700" />
            {liveUrl ? (
              <a
                href={liveUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-emerald-800 hover:underline break-all"
              >
                {liveUrl}
              </a>
            ) : (
              <span className="text-sm text-muted-foreground">No domain set</span>
            )}
            <Badge className={dns.cls + " ml-auto"}>{dns.label}</Badge>
            <Button size="sm" variant="ghost" onClick={checkDns} className="h-7 px-2">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Last deployed:{" "}
            {lastDeployedAt
              ? new Date(lastDeployedAt).toLocaleString()
              : <span className="text-amber-700">never (no successful push yet)</span>}
            {typeof deployCount === "number" && lastDeployedAt && (
              <span className="ml-2">· {deployCount} deploy{deployCount === 1 ? "" : "s"}</span>
            )}
          </p>
        </div>

        {/* Staging vs Live side-by-side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Staging</p>
            <a
              href={stagingUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary hover:underline break-all"
            >
              {stagingUrl}
            </a>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
            <p className="text-[11px] uppercase tracking-wide text-emerald-700 mb-1">Live</p>
            {liveUrl ? (
              <a
                href={liveUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-emerald-800 hover:underline break-all"
              >
                {liveUrl}
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          {liveUrl && (
            <Button asChild size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              <a href={liveUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Open live site
              </a>
            </Button>
          )}
          <Button asChild size="sm" variant="outline" className="gap-2">
            <a href={stagingUrl} target="_blank" rel="noreferrer">
              <Eye className="h-3.5 w-3.5" /> Open staging
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRepublish}
            disabled={republishing}
            className="gap-2"
          >
            {republishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
            Republish
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
