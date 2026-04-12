import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { OperatorSidebar } from "./OperatorSidebar";
import { NotificationBell } from "./NotificationBell";
import { Outlet } from "react-router-dom";

export function OperatorLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <OperatorSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center justify-between border-b px-2 shrink-0">
            <SidebarTrigger className="ml-1" />
            <NotificationBell />
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
