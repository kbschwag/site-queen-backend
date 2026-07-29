import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
import { toast } from "sonner";
import {
  Folder,
  FileText,
  Upload,
  UploadCloud,
  Trash2,
  Download,
  RefreshCw,
  ChevronRight,
  Loader2,
  Search,
  FolderPlus,
} from "lucide-react";
import { format } from "date-fns";

const BUCKET = "generated-sites";

type Entry = {
  name: string;
  id: string | null;
  updated_at?: string | null;
  metadata?: { size?: number; mimetype?: string } | null;
};

function formatBytes(bytes?: number) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface Props {
  clientId: string;
  businessName?: string;
}

export function SiteFilesPanel({ clientId }: Props) {
  const rootPrefix = clientId;
  const [path, setPath] = useState<string[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const prefix = [rootPrefix, ...path].join("/");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: 500, sortBy: { column: "name", order: "asc" } });
    if (error) {
      toast.error("Could not load files");
      setEntries([]);
    } else {
      setEntries((data || []).filter((e: any) => e.name !== ".emptyFolderPlaceholder"));
    }
    setLoading(false);
  }, [prefix]);

  useEffect(() => {
    load();
  }, [load]);

  const isFolder = (e: Entry) => e.id === null;

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(`${prefix}/${file.name}`, file, { upsert: true, contentType: file.type || undefined });
      if (error) toast.error(`${file.name}: ${error.message}`);
      else ok++;
    }
    setUploading(false);
    if (ok) toast.success(`${ok} file${ok > 1 ? "s" : ""} uploaded`);
    if (fileInputRef.current) fileInputRef.current.value = "";
    load();
  };

  const handleNewFolder = async () => {
    const name = window.prompt("New folder name:");
    if (!name) return;
    const clean = name.trim().replace(/[^a-zA-Z0-9-_]/g, "-");
    if (!clean) return;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`${prefix}/${clean}/.emptyFolderPlaceholder`, new Blob([""]), { upsert: true });
    if (error) toast.error(error.message);
    else {
      toast.success("Folder created");
      load();
    }
  };

  const listAllPaths = async (folderPrefix: string): Promise<string[]> => {
    const { data } = await supabase.storage.from(BUCKET).list(folderPrefix, { limit: 1000 });
    const out: string[] = [];
    for (const e of data || []) {
      const full = `${folderPrefix}/${e.name}`;
      if ((e as any).id === null) out.push(...(await listAllPaths(full)));
      else out.push(full);
    }
    return out;
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const target = `${prefix}/${deleteTarget.name}`;
      const paths = isFolder(deleteTarget) ? await listAllPaths(target) : [target];
      if (paths.length === 0) paths.push(`${target}/.emptyFolderPlaceholder`);
      const { error } = await supabase.storage.from(BUCKET).remove(paths);
      if (error) throw error;
      toast.success("Deleted");
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    }
    setDeleting(false);
  };

  const handlePushToStaging = async () => {
    setPushing(true);
    try {
      const folder = path.length ? path.join("/") : "deploy";
      const { data, error } = await supabase.functions.invoke("sync-files-to-staging", {
        body: { client_id: clientId, folder },
      });
      if (error) throw error;
      const pushed = data?.pushed?.length || 0;
      const failed = data?.failed?.length || 0;
      if (failed) toast.warning(`${pushed} pushed, ${failed} failed`);
      else toast.success(`${pushed} file${pushed === 1 ? "" : "s"} pushed to staging`);
    } catch (e: any) {
      toast.error(e?.message || "Push failed");
    }
    setPushing(false);
  };

  const handleDownload = async (entry: Entry) => {
    const { data, error } = await supabase.storage.from(BUCKET).download(`${prefix}/${entry.name}`);
    if (error || !data) {
      toast.error("Download failed");
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = entry.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = entries.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));
  const folders = filtered.filter(isFolder);
  const files = filtered.filter((e) => !isFolder(e));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search this folder..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={handleNewFolder} className="gap-2">
          <FolderPlus className="h-4 w-4" /> New Folder
        </Button>
        <Button size="sm" className="gap-2" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload
        </Button>
        <Button size="sm" variant="secondary" className="gap-2" disabled={pushing} onClick={handlePushToStaging}>
          {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          Push to staging
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 text-sm flex-wrap">
        <button className="text-primary hover:underline" onClick={() => setPath([])}>
          Site root
        </button>
        {path.map((seg, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <button
              className={i === path.length - 1 ? "font-medium" : "text-primary hover:underline"}
              onClick={() => setPath(path.slice(0, i + 1))}
            >
              {seg}
            </button>
          </span>
        ))}
      </div>

      <Card
        className="p-0 overflow-hidden"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleUpload(e.dataTransfer.files);
        }}
      >
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Folder className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">This folder is empty</p>
            <p className="text-xs mt-1">Drag files here or use the Upload button</p>
          </div>
        ) : (
          <div className="divide-y">
            {[...folders, ...files].map((entry) => (
              <div
                key={entry.name}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors"
              >
                {isFolder(entry) ? (
                  <Folder className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <button
                  className="flex-1 text-left text-sm truncate hover:underline"
                  onClick={() => isFolder(entry) ? setPath([...path, entry.name]) : handleDownload(entry)}
                >
                  {entry.name}
                </button>
                {isFolder(entry) ? (
                  <Badge variant="outline" className="text-[10px]">folder</Badge>
                ) : (
                  <>
                    <span className="text-xs text-muted-foreground w-20 text-right">
                      {formatBytes(entry.metadata?.size)}
                    </span>
                    <span className="text-xs text-muted-foreground w-28 text-right hidden sm:block">
                      {entry.updated_at ? format(new Date(entry.updated_at), "MMM d, HH:mm") : "—"}
                    </span>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(entry)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(entry)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        Files live in the site storage folder <code>{prefix}/</code>. Changes here affect backups and generated
        output — deploying to live is still done from the Domain tab.
      </p>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.id === null
                ? "This will permanently delete the folder and everything inside it."
                : "This will permanently delete this file from site storage."}{" "}
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
