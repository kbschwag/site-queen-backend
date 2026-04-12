import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Monitor, Smartphone, ExternalLink, RefreshCw, Loader2 } from "lucide-react";

interface Props {
  clientId: string;
  stagingUrl?: string | null;
  height?: number;
}

export function SitePreviewFrame({ clientId, stagingUrl, height = 600 }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"desktop" | "mobile">("desktop");

  const fetchAndCreateBlob = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from("generated-sites")
        .download(`${clientId}/index.html`);
      if (error) throw error;
      const html = await data.text();
      const blob = new Blob([html], { type: "text/html" });
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (e) {
      console.error("Failed to load site preview:", e);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchAndCreateBlob();
    return () => {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [fetchAndCreateBlob]);

  const handleOpenNewTab = () => {
    if (blobUrl) window.open(blobUrl, "_blank");
  };

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <Button
            size="sm"
            variant={view === "desktop" ? "default" : "ghost"}
            onClick={() => setView("desktop")}
            className="gap-1.5 h-7 text-xs"
          >
            <Monitor className="h-3.5 w-3.5" /> Desktop
          </Button>
          <Button
            size="sm"
            variant={view === "mobile" ? "default" : "ghost"}
            onClick={() => setView("mobile")}
            className="gap-1.5 h-7 text-xs"
          >
            <Smartphone className="h-3.5 w-3.5" /> Mobile
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={fetchAndCreateBlob} disabled={loading} className="gap-1.5 h-7 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={handleOpenNewTab} disabled={!blobUrl} className="gap-1.5 h-7 text-xs">
            <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div
        className="border rounded-lg overflow-hidden bg-muted/30 flex justify-center"
        style={{ height }}
      >
        {loading && !blobUrl ? (
          <div className="flex items-center justify-center w-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : blobUrl ? (
          <iframe
            src={blobUrl}
            title="Site preview"
            className="bg-white transition-all duration-300"
            style={{
              width: view === "mobile" ? 390 : "100%",
              height: "100%",
              border: view === "mobile" ? "1px solid hsl(var(--border))" : "none",
              borderRadius: view === "mobile" ? 12 : 0,
            }}
          />
        ) : (
          <div className="flex items-center justify-center w-full text-sm text-muted-foreground">
            No preview available
          </div>
        )}
      </div>
    </div>
  );
}
