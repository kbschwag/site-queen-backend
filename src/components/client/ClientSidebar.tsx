import {
  Crown,
  LayoutDashboard,
  Globe,
  MessageSquare,
  CreditCard,
  HelpCircle,
  Settings,
  LogOut,
  BarChart3,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

interface ClientSidebarProps {
  businessName: string;
  plan: string;
  creditsBalance?: number;
}

const planLabels: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
};

export function ClientSidebar({ businessName, plan, creditsBalance = 0 }: ClientSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
    { title: "My Website", url: "/dashboard/website", icon: Globe },
    { title: "Analytics", url: "/dashboard/analytics", icon: BarChart3 },
    { title: "Support Tickets", url: "/dashboard/support", icon: MessageSquare, badge: creditsBalance },
    { title: "Billing", url: "/dashboard/billing", icon: CreditCard },
    { title: "Help", url: "/dashboard/help", icon: HelpCircle },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-primary" />
              {!collapsed && <span className="font-semibold">SiteQueen</span>}
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && (
                        <span className="flex-1 flex items-center justify-between">
                          <span>{item.title}</span>
                          {item.badge !== undefined && (
                            <Badge variant="secondary" className="text-xs ml-2">
                              {item.badge}
                            </Badge>
                          )}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2 space-y-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink
                to="/dashboard/settings"
                className="hover:bg-sidebar-accent/50"
                activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
              >
                <Settings className="mr-2 h-4 w-4" />
                {!collapsed && <span>Account Settings</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {!collapsed && (
          <div className="px-2 py-1">
            <p className="text-xs font-medium truncate">{businessName}</p>
            <Badge variant="outline" className="text-[10px] mt-0.5">
              {planLabels[plan] || plan} Plan
            </Badge>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && "Sign Out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
