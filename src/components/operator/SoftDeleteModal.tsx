import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface SoftDeleteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordName: string;
  table: string;
  recordId: string;
  onDeleted: () => void;
}

export function SoftDeleteModal({ open, onOpenChange, recordName, table, recordId, onDeleted }: SoftDeleteModalProps) {
  const { user } = useAuth();
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (confirmText !== "DELETE" || !user) return;
    setLoading(true);
    try {
      const updateData: Record<string, any> = {
        deleted_at: new Date().toISOString(),
      };
      // deleted_by only on tables that have it (not notifications)
      if (table !== "notifications") {
        updateData.deleted_by = user.id;
      }

      const { error } = await supabase
        .from(table as any)
        .update(updateData as any)
        .eq("id", recordId);
      if (error) throw error;

      await supabase.from("audit_log").insert({
        user_id: user.id,
        user_email: user.email,
        action: `Soft deleted ${table} record: ${recordName}`,
        target_table: table,
        target_id: recordId,
        details: { record_name: recordName },
      });

      toast.success("Record deleted and hidden from all views");
      onDeleted();
      onOpenChange(false);
      setConfirmText("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setConfirmText(""); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete {recordName}?
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This will hide this record from all views. It can be recovered by contacting your database administrator. This action is logged.
          </p>
          <div>
            <p className="text-sm font-medium mb-1">Type DELETE to confirm</p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); setConfirmText(""); }}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={confirmText !== "DELETE" || loading}
            onClick={handleDelete}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
