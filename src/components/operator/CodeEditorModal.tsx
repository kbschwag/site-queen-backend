import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Code2, X, Loader2, Save } from "lucide-react";
import { buildSitePreviewUrl } from "@/lib/site-preview";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onSaved?: () => void;
}

const STARTER_HTML = `<!-- No site generated yet — paste or write your HTML here -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Client Site</title>
</head>
<body>
  <!-- Build your site here -->
</body>
</html>
`;

const CDN_LINKS = [
  { type: "css", href: "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css" },
  { type: "css", href: "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/dracula.min.css" },
];
const CDN_SCRIPTS = [
  "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/xml/xml.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/css/css.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/htmlmixed/htmlmixed.min.js",
];

let cdnLoadPromise: Promise<void> | null = null;
function loadCodeMirror(): Promise<void> {
  if ((window as any).CodeMirror) return Promise.resolve();
  if (cdnLoadPromise) return cdnLoadPromise;
  cdnLoadPromise = new Promise((resolve, reject) => {
    CDN_LINKS.forEach((l) => {
      if (!document.querySelector(`link[href="${l.href}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = l.href;
        document.head.appendChild(link);
      }
    });
    const loadScript = (src: string) =>
      new Promise<void>((res, rej) => {
        const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
        if (existing) {
          if ((existing as any).dataset.loaded === "true") res();
          else existing.addEventListener("load", () => res());
          return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => {
          (s as any).dataset.loaded = "true";
          res();
        };
        s.onerror = () => rej(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
      });

    (async () => {
      try {
        for (const src of CDN_SCRIPTS) await loadScript(src);
        resolve();
      } catch (e) {
        cdnLoadPromise = null;
        reject(e);
      }
    })();
  });
  return cdnLoadPromise;
}

export function CodeEditorModal({ open, onOpenChange, clientId, onSaved }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const htmlHostRef = useRef<HTMLDivElement | null>(null);
  const htmlEditorRef = useRef<any>(null);

  // Init CodeMirror + load file
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        await loadCodeMirror();
        const CM = (window as any).CodeMirror;
        if (!CM) throw new Error("CodeMirror failed to load");

        const htmlRes = await supabase.storage
          .from("generated-sites")
          .download(`${clientId}/deploy/index.html`);

        if (cancelled) return;

        const htmlContent = htmlRes.data ? await htmlRes.data.text() : STARTER_HTML;

        await new Promise((r) => setTimeout(r, 0));
        if (cancelled) return;

        if (htmlHostRef.current && !htmlEditorRef.current) {
          htmlEditorRef.current = CM(htmlHostRef.current, {
            value: htmlContent,
            mode: "htmlmixed",
            theme: "dracula",
            lineNumbers: true,
            lineWrapping: true,
            indentUnit: 2,
            tabSize: 2,
          });
        } else if (htmlEditorRef.current) {
          htmlEditorRef.current.setValue(htmlContent);
        }

        setTimeout(() => htmlEditorRef.current?.refresh(), 50);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load code editor");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, clientId]);

  useEffect(() => {
    if (open) return;
    htmlEditorRef.current = null;
  }, [open]);

  const handleSave = async () => {
    if (!htmlEditorRef.current) return;
    setSaving(true);
    try {
      const htmlContent = htmlEditorRef.current.getValue();
      const htmlBlob = new Blob([htmlContent], { type: "text/html" });

      const { error: upErr } = await supabase.storage
        .from("generated-sites")
        .upload(`${clientId}/index.html`, htmlBlob, { upsert: true, contentType: "text/html" });

      if (upErr) throw upErr;

      const { data: site } = await supabase
        .from("sites")
        .select("generation_status")
        .eq("client_id", clientId)
        .maybeSingle();

      const updates: any = {
        staging_url: buildSitePreviewUrl(clientId),
        last_updated: new Date().toISOString(),
      };
      if ((site as any)?.generation_status === "failed") {
        updates.generation_status = "complete";
        updates.generation_error = null;
      }

      await supabase.from("sites").update(updates as any).eq("client_id", clientId);

      // Log the edit
      if (user) {
        await supabase.from("operator_edits").insert({
          client_id: clientId,
          operator_id: user.id,
          operator_email: user.email,
          instruction: "Manual code edit via code editor",
          model_used: "manual",
          status: "completed",
        } as any);
      }

      toast.success("Saved ♛ — preview updated");
      onSaved?.();
    } catch (e: any) {
      console.error(e);
      toast.error("Save failed — check your connection");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        className="bg-zinc-900 text-zinc-100 rounded-xl shadow-2xl flex flex-col overflow-hidden border border-zinc-800"
        style={{ width: "95vw", height: "95vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-950 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Code2 className="h-4 w-4" />
            Code editor ♛
          </div>

          {/* Single HTML tab */}
          <div className="flex items-center gap-1 bg-zinc-800 rounded-md p-1">
            <span className="px-3 py-1 text-xs font-medium rounded bg-zinc-700 text-white">HTML</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || loading}
              className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? "Saving..." : "Save and preview ♛"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800 h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Editor area */}
        <div className="flex-1 relative bg-[#282a36] overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/50 z-10">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          )}
          <div ref={htmlHostRef} className="absolute inset-0" style={{ fontSize: 14 }} />
        </div>

        {/* Footer note */}
        <div className="px-4 py-2 bg-zinc-950 border-t border-zinc-800 text-xs text-zinc-400 text-center shrink-0">
          Changes save to staging only — not live until you deploy ♛
        </div>
      </div>

      <style>{`
        .CodeMirror { height: 100% !important; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 14px; }
      `}</style>
    </div>
  );
}
