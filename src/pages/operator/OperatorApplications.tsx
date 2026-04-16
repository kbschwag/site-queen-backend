import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOperatorRole } from "@/hooks/useOperatorRole";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter } from "lucide-react";
import ApplicationDetailPanel from "@/components/operator/ApplicationDetailPanel";

type TempFilter = "all" | "HOT" | "WARM" | "COLD" | "flagged" | "approved" | "declined" | "converted";
type ReadinessFilter = "all" | "ready_now" | "within_30_days" | "few_months" | "exploring";

const READINESS_BADGE: Record<string, { label: string; className: string }> = {
  ready_now: { label: "Ready now", className: "bg-emerald-500/15 text-emerald-700 border border-emerald-300" },
  within_30_days: { label: "Within 30d", className: "bg-blue-500/15 text-blue-700 border border-blue-300" },
  few_months: { label: "Few months", className: "bg-amber-500/15 text-amber-700 border border-amber-300" },
  exploring: { label: "Exploring", className: "bg-muted text-muted-foreground border" },
};

export default function OperatorApplications() {
  const { isTeamMember, canReviewApplications } = useOperatorRole();
  const [search, setSearch] = useState("");
  const [tempFilter, setTempFilter] = useState<TempFilter>("all");
  const [readinessFilter, setReadinessFilter] = useState<ReadinessFilter>("all");
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");

  const { data: applications, isLoading } = useQuery({
    queryKey: ["operator-applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = (applications || []).filter((app) => {
    if (activeTab === "flagged" && app.status !== "needs_review") return false;
    if (activeTab === "converted" && app.status !== "converted") return false;
    if (isTeamMember && canReviewApplications && app.status !== "needs_review") return false;

    if (tempFilter === "HOT" && app.lead_temperature !== "HOT") return false;
    if (tempFilter === "WARM" && app.lead_temperature !== "WARM") return false;
    if (tempFilter === "COLD" && app.lead_temperature !== "COLD") return false;
    if (tempFilter === "flagged" && app.status !== "needs_review") return false;
    if (tempFilter === "approved" && app.status !== "approved") return false;
    if (tempFilter === "declined" && app.status !== "declined") return false;
    if (tempFilter === "converted" && app.status !== "converted") return false;

    if (readinessFilter !== "all" && (app as any).readiness !== readinessFilter) return false;

    if (search) {
      const s = search.toLowerCase();
      if (
        !app.name?.toLowerCase().includes(s) &&
        !app.business_name?.toLowerCase().includes(s) &&
        !app.email?.toLowerCase().includes(s)
      ) return false;
    }

    return true;
  });

  const selectedApp = applications?.find((a) => a.id === selectedAppId) || null;

  const tempBadge = (temp: string | null) => {
    if (temp === "HOT") return <Badge className="bg-amber-500 text-white">🔥 HOT</Badge>;
    if (temp === "WARM") return <Badge className="bg-primary/80 text-primary-foreground">💜 WARM</Badge>;
    return <Badge variant="secondary">COLD</Badge>;
  };

  const statusBadge = (status: string | null) => {
    if (status === "approved") return <Badge className="bg-green-100 text-green-700">Approved</Badge>;
    if (status === "declined") return <Badge variant="destructive">Declined</Badge>;
    if (status === "needs_review") return <Badge className="bg-amber-100 text-amber-700">Needs Review</Badge>;
    if (status === "converted") return <Badge className="bg-primary/20 text-primary">Converted ♛</Badge>;
    return <Badge variant="outline">Pending</Badge>;
  };

  const rowBg = (app: any) => {
    if (app.status === "needs_review") return "bg-amber-50/50";
    if (app.lead_temperature === "HOT") return "bg-amber-50/30";
    if (app.lead_temperature === "WARM") return "bg-primary/5";
    return "";
  };

  const showTabs = !isTeamMember;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Applications</h1>

      {showTabs ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All Applications</TabsTrigger>
            <TabsTrigger value="flagged" className="gap-1">
              Flagged & Needs Review
              {applications?.filter(a => a.status === "needs_review").length ? (
                <span className="ml-1 bg-amber-500 text-white text-xs rounded-full px-1.5">
                  {applications.filter(a => a.status === "needs_review").length}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="converted">Converted to Client</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : (
        <p className="text-sm text-muted-foreground">Showing flagged applications for your review</p>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, business, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {showTabs && activeTab === "all" && (
          <>
            <Select value={tempFilter} onValueChange={(v) => setTempFilter(v as TempFilter)}>
              <SelectTrigger className="w-40">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="HOT">🔥 HOT</SelectItem>
                <SelectItem value="WARM">💜 WARM</SelectItem>
                <SelectItem value="COLD">COLD</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
              </SelectContent>
            </Select>
            <Select value={readinessFilter} onValueChange={(v) => setReadinessFilter(v as ReadinessFilter)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Readiness" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All readiness</SelectItem>
                <SelectItem value="ready_now">Ready now</SelectItem>
                <SelectItem value="within_30_days">Within 30 days</SelectItem>
                <SelectItem value="few_months">Few months</SelectItem>
                <SelectItem value="exploring">Just exploring</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Business</TableHead>
              <TableHead className="hidden md:table-cell">Industry</TableHead>
              <TableHead className="hidden lg:table-cell">Country</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Temp</TableHead>
              <TableHead className="hidden md:table-cell">Readiness</TableHead>
              <TableHead className="hidden md:table-cell">Plan</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No applications found</TableCell></TableRow>
            ) : (
              filtered.map((app) => {
                const readiness = (app as any).readiness;
                const readinessBadge = readiness && READINESS_BADGE[readiness];
                return (
                  <TableRow
                    key={app.id}
                    className={`cursor-pointer hover:bg-muted/50 ${rowBg(app)}`}
                    onClick={() => setSelectedAppId(app.id)}
                  >
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(app.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="font-medium">{app.name}</TableCell>
                    <TableCell>{app.business_name}</TableCell>
                    <TableCell className="hidden md:table-cell">{app.industry || "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">{app.country || "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{app.ai_score ?? "—"}</TableCell>
                    <TableCell>{tempBadge(app.lead_temperature)}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {readinessBadge ? (
                        <Badge className={readinessBadge.className}>{readinessBadge.label}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{app.plan_interest || "—"}</TableCell>
                    <TableCell>{statusBadge(app.status)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {selectedApp && (
        <ApplicationDetailPanel
          application={selectedApp}
          onClose={() => setSelectedAppId(null)}
        />
      )}
    </div>
  );
}
