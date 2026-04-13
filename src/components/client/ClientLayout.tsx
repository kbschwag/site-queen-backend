import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ClientSidebar } from "./ClientSidebar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function ClientLayout() {
  const { user } = useAuth();

  const { data: client } = useQuery({
    queryKey: ["my-client"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <ClientSidebar
          businessName={client?.business_name || ""}
          plan={client?.plan || "starter"}
          creditsBalance={client?.credits_balance ?? 0}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b bg-card px-4 shrink-0">
            <SidebarTrigger className="mr-3" />
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6 bg-secondary/30">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
