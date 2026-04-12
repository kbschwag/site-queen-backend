import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useFileUpload(clientId: string | undefined) {
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});

  const uploadFile = useCallback(
    async (file: File, category: string, customName?: string): Promise<string | null> => {
      if (!clientId) return null;

      const key = customName || file.name;
      setUploading((prev) => ({ ...prev, [key]: true }));
      setProgress((prev) => ({ ...prev, [key]: 0 }));

      try {
        const ext = file.name.split(".").pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const path = `${clientId}/${category}/${fileName}`;

        const { error } = await supabase.storage
          .from("client-uploads")
          .upload(path, file, { upsert: true });

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from("client-uploads")
          .getPublicUrl(path);

        setProgress((prev) => ({ ...prev, [key]: 100 }));
        return urlData.publicUrl;
      } catch (e: any) {
        console.error("Upload failed:", e);
        toast.error(`Upload failed: ${e.message}`);
        return null;
      } finally {
        setUploading((prev) => ({ ...prev, [key]: false }));
      }
    },
    [clientId]
  );

  const uploadMultiple = useCallback(
    async (files: File[], category: string): Promise<string[]> => {
      const urls: string[] = [];
      for (const file of files) {
        const url = await uploadFile(file, category, file.name);
        if (url) urls.push(url);
      }
      return urls;
    },
    [uploadFile]
  );

  return { uploadFile, uploadMultiple, uploading, progress };
}
