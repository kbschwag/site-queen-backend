import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ClientSidebar } from "./ClientSidebar";

interface ClientLayoutProps {
  businessName: string;
  plan: string;
  creditsBalance: number;
}

export function ClientLayout({ businessName, plan, creditsBalance }: ClientLayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <ClientSidebar
          businessName={businessName}
          plan={plan}
          creditsBalance={creditsBalance}
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
