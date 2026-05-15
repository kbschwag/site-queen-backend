import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { format, isToday, isThisWeek, isPast, parseISO } from "date-fns";
import { Plus, Copy, Loader2, Target, Search, MessageCirclePlus, Crown, Download } from "lucide-react";
import { AddProspectModal } from "@/components/operator/AddProspectModal";
import { LogContactModal } from "@/components/operator/LogContactModal";
import { ConvertToClientModal } from "@/components/operator/ConvertToClientModal";
import { ACTIVE_PROSPECT_STAGES, ALL_PROSPECT_STAGES, STAGE_LABELS, STAGE_COLORS, CHANNEL_LABELS, downloadCSV } from "@/lib/prospect-utils";

export default function OperatorProspects() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [followupFilter, setFollowupFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [logContactFor, setLogContactFor] = useState<any>(null);
  const [convertFor, setConvertFor] = useState<any>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const { data: prospects = [], isLoading } = useQuery({
    queryKey: ["operator-prospects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*, sites(staging_url, generation_status)")
        .is("deleted_at", null)
        .in("lifecycle_stage", ALL_PROSPECT_STAGES as unknown as string[])
        .order("next_followup_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });

  const filtered = useMemo(() => {
    return (prospects || []).filter((p: any) => {
      if (search && !p.business_name?.toLowerCase().includes(search.toLowerCase())) return false;
      if (cityFilter && !(p.prospect_city || "").toLowerCase().includes(cityFilter.toLowerCase())) return false;
      if (categoryFilter && categoryFilter !== "all" && p.prospect_category !== categoryFilter) return false;
      if (statusFilter === "active" && !ACTIVE_PROSPECT_STAGES.includes(p.lifecycle_stage)) return false;
      if (statusFilter !== "active" && statusFilter !== "all" && p.lifecycle_stage !== statusFilter) return false;
      if (followupFilter !== "all") {
        if (!p.next_followup_date) return followupFilter === "no_date";
        const d = parseISO(p.next_followup_date);
        if (followupFilter === "today" && !isToday(d)) return false;
        if (followupFilter === "week" && !isThisWeek(d, { weekStartsOn: 1 })) return false;
        if (followupFilter === "overdue" && !(isPast(d) && !isToday(d))) return false;
      }
      return true;
    });
  }, [prospects, search, cityFilter, categoryFilter, statusFilter, followupFilter]);

  const allChecked = filtered.length > 0 && filtered.every((p: any) => selected.has(p.id));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(filtered.map((p: any) => p.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("Demo URL copied");
  };

  const bulkSetStage = async (stage: string) => {
    if (!selected.size) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("clients").update({ lifecycle_stage: stage }).in("id", ids);
    if (error) toast.error(error.message);
    else { toast.success(`Updated ${ids.length} prospects`); setSelected(new Set()); qc.invalidateQueries({ queryKey: ["operator-prospects"] }); }
  };

  const bulkSetFollowup = async (date: string) => {
    if (!selected.size || !date) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("clients").update({ next_followup_date: date }).in("id", ids);
    if (error) toast.error(error.message);
    else { toast.success(`Updated ${ids.length} follow-up dates`); setSelected(new Set()); qc.invalidateQueries({ queryKey: ["operator-prospects"] }); }
  };

  const exportCSV = () => {
    const ids = selected.size ? Array.from(selected) : filtered.map((p: any) => p.id);
    const rows = (prospects || [])
      .filter((p: any) => ids.includes(p.id))
      .map((p: any) => ({
        business_name: p.business_name,
        category: p.prospect_category || "",
        city: p.prospect_city || "",
        status: STAGE_LABELS[p.lifecycle_stage] || p.lifecycle_stage,
        demo_url: p.sites?.[0]?.staging_url || p.demo_url || "",
        email: p.prospect_email || "",
        phone: p.phone_number || "",
        date_last_contacted: p.date_last_contacted || "",
        next_followup_date: p.next_followup_date || "",
      }));
    downloadCSV(`prospects-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const stageBadge = (stage: string) => (
    <Badge variant="outline" className={STAGE_COLORS[stage] || ""}>{STAGE_LABELS[stage] || stage}</Badge>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Target className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Prospects</h1>
          <span className="text-sm text-muted-foreground">{filtered.length} shown</span>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" /> Add Prospect</Button>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="relative col-span-2">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by business name…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active prospects</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
              {ALL_PROSPECT_STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={followupFilter} onValueChange={setFollowupFilter}>
            <SelectTrigger><SelectValue placeholder="Follow-up" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All follow-ups</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="no_date">No date set</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Filter by city" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} />
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
            <span className="text-sm font-medium">{selected.size} selected:</span>
            <Select onValueChange={bulkSetStage}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Set status…" /></SelectTrigger>
              <SelectContent>
                {ALL_PROSPECT_STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" className="w-44" onChange={(e) => bulkSetFollowup(e.target.value)} />
            <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"><Checkbox checked={allChecked} onCheckedChange={toggleAll} /></TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Added</TableHead>
              <TableHead>Last contact</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Follow-up</TableHead>
              <TableHead>Demo</TableHead>
              <TableHead>Views</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-12"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading…</TableCell></TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-12">No prospects yet. Click "Add Prospect" to get started.</TableCell></TableRow>
            )}
            {filtered.map((p: any) => {
              const demoUrl = p.sites?.[0]?.staging_url || p.demo_url;
              const genStatus = p.sites?.[0]?.generation_status;
              const overdue = p.next_followup_date && isPast(parseISO(p.next_followup_date)) && !isToday(parseISO(p.next_followup_date));
              const views = p.demo_view_count || 0;
              return (
                <TableRow key={p.id} className={`${highlightId === p.id ? "bg-primary/5" : ""} ${overdue ? "bg-red-50/40" : ""}`}>
                  <TableCell><Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleOne(p.id)} /></TableCell>
                  <TableCell>
                    <button onClick={() => navigate(`/operator/prospects/${p.id}`)} className="font-medium text-primary hover:underline text-left">
                      {p.business_name}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm">{p.prospect_category || "—"}</TableCell>
                  <TableCell className="text-sm">{p.prospect_city || "—"}</TableCell>
                  <TableCell>{stageBadge(p.lifecycle_stage)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(p.created_at), "MMM d")}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{p.date_last_contacted ? format(new Date(p.date_last_contacted), "MMM d") : "—"}</TableCell>
                  <TableCell className="text-xs">{p.outreach_channel ? CHANNEL_LABELS[p.outreach_channel] : "—"}</TableCell>
                  <TableCell className={`text-xs whitespace-nowrap ${overdue ? "text-red-600 font-semibold" : ""}`}>
                    {p.next_followup_date ? format(parseISO(p.next_followup_date), "MMM d") : "—"}
                  </TableCell>
                  <TableCell>
                    {demoUrl ? (
                      <div className="flex items-center gap-1">
                        <a href={demoUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline truncate max-w-[120px]">Open</a>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyUrl(demoUrl)}><Copy className="h-3 w-3" /></Button>
                      </div>
                    ) : genStatus === "failed" ? (
                      <span className="text-xs text-red-600">Failed</span>
                    ) : (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`text-sm font-medium ${views >= 3 ? "text-emerald-600" : views >= 1 ? "text-amber-600" : "text-muted-foreground"}`}>
                      {views}
                    </span>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => setLogContactFor(p)}><MessageCirclePlus className="h-4 w-4 mr-1" />Log</Button>
                    <Button variant="default" size="sm" className="ml-1" onClick={() => setConvertFor(p)}><Crown className="h-4 w-4 mr-1" />Convert</Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <AddProspectModal
        open={showAdd}
        onOpenChange={setShowAdd}
        onCreated={(id) => { setHighlightId(id); qc.invalidateQueries({ queryKey: ["operator-prospects"] }); }}
      />
      {logContactFor && (
        <LogContactModal
          open={!!logContactFor}
          onOpenChange={(v) => !v && setLogContactFor(null)}
          clientId={logContactFor.id}
          currentStage={logContactFor.lifecycle_stage}
          onLogged={() => qc.invalidateQueries({ queryKey: ["operator-prospects"] })}
        />
      )}
      {convertFor && (
        <ConvertToClientModal
          open={!!convertFor}
          onOpenChange={(v) => !v && setConvertFor(null)}
          clientId={convertFor.id}
          businessName={convertFor.business_name}
          onConverted={() => qc.invalidateQueries({ queryKey: ["operator-prospects"] })}
        />
      )}
    </div>
  );
}
