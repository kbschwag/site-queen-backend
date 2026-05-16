import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

interface Props {
  clientId: string;
}

export function GenerationDiagnosticsPanel({ clientId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["generation-diagnostics", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("generation_diagnostics" as any) as any)
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Generation Diagnostics</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No diagnostics yet. Generate a site to populate.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Page</TableHead>
                <TableHead>Count</TableHead>
                <TableHead>Unfilled placeholders</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {format(new Date(row.created_at), "MMM d, h:mm a")}
                  </TableCell>
                  <TableCell className="text-xs font-mono">{row.template_id}</TableCell>
                  <TableCell className="text-xs font-mono">{row.page_slug}</TableCell>
                  <TableCell>
                    <Badge variant={row.placeholder_count > 0 ? "destructive" : "outline"}>
                      {row.placeholder_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.unfilled_placeholders?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {row.unfilled_placeholders.map((p: string) => (
                          <code key={p} className="px-1.5 py-0.5 bg-muted rounded text-[10px]">{p}</code>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
