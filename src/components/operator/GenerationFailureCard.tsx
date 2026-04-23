import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, RefreshCw, FileText, Phone, Code, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CodeEditorModal } from "./CodeEditorModal";

interface Props {
  clientId: string;
  businessName: string;
  site: any;
  generationError?: string | null;
  onRetry?: () => void;
}

export function FailureCard({ clientId, businessName, site, generationError, onRetry }: Props) {
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const [showRetryConfirm, setShowRetryConfirm] = useState(false);
  const [showIntake, setShowIntake] = useState(false);
  const [showCallNotes, setShowCallNotes] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);

  const attempts = site?.generation_attempts ?? 0;
  const lastAttempt = site?.last_generation_attempt_at;
  const intakeSnapshot = site?.intake_snapshot ?? site?.intake_data ?? null;
  const callNotesSnapshot = site?.call_notes_snapshot ?? null;

  const handleRetry = async () => {
    setRetrying(true);
    setShowRetryConfirm(false);
    try {
      const { error } = await supabase.functions.invoke("generate-website", {
        body: { client_id: clientId },
      });
      if (error) throw error;
      toast.success("Rebuilding site... ♛ This takes about 30-60 seconds");
      onRetry?.();
      queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
    } catch (e: any) {
      toast.error(e?.message || "Retry failed to start");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <>
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Generation failed
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-destructive/20 bg-background/60 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Error message</p>
            <p className="text-sm font-mono whitespace-pre-wrap break-words text-destructive">
              {generationError || "Unknown error"}
            </p>
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <Badge variant="outline" className="text-xs">
                {attempts} {attempts === 1 ? "attempt" : "attempts"}
              </Badge>
              {lastAttempt && (
                <span className="text-xs text-muted-foreground">
                  Last attempted {new Date(lastAttempt).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          <div className="bg-background/60 rounded-lg p-3 text-xs text-muted-foreground">
            All intake form data and call notes have been preserved. You can retry generation, review the source data, or hand-edit the HTML.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              onClick={() => setShowRetryConfirm(true)}
              disabled={retrying}
              className="gap-2"
            >
              {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Retry generation ♛
            </Button>
            <Button variant="outline" onClick={() => setShowIntake(true)} className="gap-2">
              <FileText className="h-4 w-4" /> View intake form data
            </Button>
            <Button variant="outline" onClick={() => setShowCallNotes(true)} className="gap-2">
              <Phone className="h-4 w-4" /> View call notes
            </Button>
            <Button variant="outline" onClick={() => setShowCodeEditor(true)} className="gap-2">
              <Code className="h-4 w-4" /> Edit code manually
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Retry confirmation */}
      <Dialog open={showRetryConfirm} onOpenChange={setShowRetryConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retry website generation?</DialogTitle>
            <DialogDescription>
              This will trigger another generation attempt for <strong>{businessName}</strong> using the saved intake form and call notes.
              {attempts > 0 && ` This will be attempt #${attempts + 1}.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRetryConfirm(false)}>Cancel</Button>
            <Button onClick={handleRetry} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Intake data viewer */}
      <Dialog open={showIntake} onOpenChange={setShowIntake}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Intake form data — {businessName}</DialogTitle>
            <DialogDescription>
              Snapshot from when generation was last attempted.
              {site?.intake_snapshot_saved_at && (
                <> Saved {new Date(site.intake_snapshot_saved_at).toLocaleString()}.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] rounded-md border bg-muted/30 p-3">
            {intakeSnapshot ? (
              <pre className="text-xs whitespace-pre-wrap break-words font-mono">
                {JSON.stringify(intakeSnapshot, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">No intake data captured.</p>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Call notes viewer */}
      <Dialog open={showCallNotes} onOpenChange={setShowCallNotes}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Call notes — {businessName}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] rounded-md border bg-muted/30 p-3">
            {callNotesSnapshot ? (
              <pre className="text-xs whitespace-pre-wrap break-words font-mono">
                {JSON.stringify(callNotesSnapshot, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">No call notes captured for this client.</p>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Manual code editor — full screen CodeMirror */}
      <CodeEditorModal
        open={showCodeEditor}
        onOpenChange={setShowCodeEditor}
        clientId={clientId}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
          onRetry?.();
        }}
      />
    </>
  );
}
