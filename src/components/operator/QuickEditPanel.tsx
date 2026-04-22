import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Pencil, Send, Loader2, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Props {
  clientId: string;
  onEditComplete?: () => void;
}

const PLACEHOLDER = `Tell our AI editor what to change...

Examples:
- Change the hero headline to 'Phoenix's Most Trusted Plumber'
- Rewrite the about section to sound more personal and less corporate
- Update the phone number to (555) 123-4567 everywhere it appears
- Change the primary color to #1a5276
- Make the services section show 4 columns instead of 3
- Add a new service called 'Water Heater Installation' with this description: ...`;

export function QuickEditPanel({ clientId, onEditComplete }: Props) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const queryClient = useQueryClient();

  const { data: lastEdit } = useQuery({
    queryKey: ["operator-last-edit", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("operator_edits" as any)
        .select("created_at, operator_email, instruction, status")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
  });

  const runEdit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("quick-edit-html", {
        body: { client_id: clientId, instruction: instruction.trim() },
      });
      if (error) throw new Error(error.message || "Edit failed");
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success("Done ♛ — preview updated");
      setInstruction("");
      queryClient.invalidateQueries({ queryKey: ["operator-last-edit", clientId] });
      queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
      onEditComplete?.();
    },
    onError: (e: any) => toast.error(e.message || "Edit failed"),
  });

  return (
    <Card className="border-primary/20">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
            <CardTitle className="text-sm flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-primary" />
                Quick edit ♛
              </span>
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            <Textarea
              placeholder={PLACEHOLDER}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={9}
              className="text-sm resize-none font-mono"
              disabled={runEdit.isPending}
            />
            <Button
              onClick={() => runEdit.mutate()}
              disabled={!instruction.trim() || runEdit.isPending}
              className="w-full gap-2 bg-primary hover:bg-primary/90"
            >
              {runEdit.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Our AI editor is making your changes...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Send to AI editor ♛
                </>
              )}
            </Button>
            <div className="text-xs text-muted-foreground space-y-1 pt-1 border-t">
              <p className="flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" />
                Changes save to staging — not live until you deploy
              </p>
              {lastEdit && (
                <p>
                  Last edited {formatDistanceToNow(new Date(lastEdit.created_at), { addSuffix: true })}
                  {lastEdit.operator_email ? ` by ${lastEdit.operator_email}` : ""}
                </p>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
