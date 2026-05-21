import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOperatorRole } from "@/hooks/useOperatorRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Wrench } from "lucide-react";

type RunState = {
  loading: boolean;
  mode: "dry-run" | "live" | null;
  result: any | null;
  error: string | null;
};

export default function OperatorTools() {
  const { isOwner, loading: roleLoading } = useOperatorRole();
  const [run, setRun] = useState<RunState>({ loading: false, mode: null, result: null, error: null });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  if (roleLoading) return <div className="text-muted-foreground text-sm">Loading…</div>;
  if (!isOwner) return <Navigate to="/operator" replace />;

  const invoke = async (mode: "dry-run" | "live") => {
    setRun({ loading: true, mode, result: null, error: null });
    const { data, error } = await supabase.functions.invoke("migrate-to-hosted-tracker", {
      body: { mode },
    });
    if (error) {
      setRun({ loading: false, mode, result: null, error: error.message || String(error) });
    } else {
      setRun({ loading: false, mode, result: data, error: null });
    }
  };

  const handleLiveConfirm = async () => {
    if (confirmText !== "MIGRATE") return;
    setConfirmOpen(false);
    setConfirmText("");
    await invoke("live");
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-2">
        <Wrench className="h-5 w-5" />
        <h1 className="text-2xl font-semibold">Operator Tools</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        One-time maintenance actions. Owner-only. Use with care.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Tracker Migration</CardTitle>
          <CardDescription>
            Migrates existing client sites from the old inline analytics tracker block
            to the new hosted loader snippet (<code>tracker-v2</code>). Dry-run is safe
            and modifies nothing — it only reports what would change.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => invoke("dry-run")}
              disabled={run.loading}
              variant="secondary"
            >
              {run.loading && run.mode === "dry-run" ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running dry-run…</>
              ) : (
                "Run Dry-Run"
              )}
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={run.loading}
              variant="destructive"
            >
              {run.loading && run.mode === "live" ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running live migration…</>
              ) : (
                "Run Live Migration"
              )}
            </Button>
          </div>

          {run.error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <div className="font-medium text-destructive">Error</div>
              <div className="mt-1 whitespace-pre-wrap break-all">{run.error}</div>
            </div>
          )}

          {run.result && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  Summary ({run.mode})
                </div>
                <pre className="text-xs overflow-x-auto">
{JSON.stringify(run.result.summary, null, 2)}
                </pre>
              </div>
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  Per-file log ({run.result.log?.length ?? 0} rows)
                </div>
                <pre className="text-xs overflow-x-auto max-h-[600px]">
{JSON.stringify(run.result.log, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Live Migration</AlertDialogTitle>
            <AlertDialogDescription>
              This will modify HTML on live client sites (and re-upload to Hostinger).
              A per-file backup is written to <code>generated-sites/&lt;clientId&gt;/_pre-tracker-v2/</code>
              before each write. Type <strong>MIGRATE</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-input">Confirmation</Label>
            <Input
              id="confirm-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type MIGRATE"
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmText("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText !== "MIGRATE"}
              onClick={handleLiveConfirm}
            >
              Run Live Migration
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
