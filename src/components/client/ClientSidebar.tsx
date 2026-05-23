import {
  Crown,
  LayoutDashboard,
  Globe,
  MessageSquare,
  CreditCard,
  HelpCircle,
  LifeBuoy,
  Settings,
  LogOut,
  BarChart3,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useState } from "react";
import { useClientPlan } from "@/hooks/useClientPlan";
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

  const { isPremium } = useClientPlan();
  const location = useLocation();
  const analyticsOpen = location.pathname.startsWith("/dashboard/analytics");
  const [forceOpen, setForceOpen] = useState(false);
  const isAnalyticsExpanded = analyticsOpen || forceOpen;

  const navItems = [
    { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
    { title: "My Website", url: "/dashboard/website", icon: Globe },
    // Analytics handled separately (expandable group)
    { title: "Support Tickets", url: "/dashboard/support", icon: MessageSquare, badge: creditsBalance },
    { title: "Support", url: "/dashboard/contact", icon: LifeBuoy },
    { title: "Billing", url: "/dashboard/billing", icon: CreditCard },
    { title: "Help", url: "/dashboard/help", icon: HelpCircle },
  ];

  const analyticsSubItems = [
    { title: "Overview", url: "/dashboard/analytics", premium: false },
    { title: "Conversions", url: "/dashboard/analytics/conversions", premium: true },
    { title: "Search", url: "/dashboard/analytics/search", premium: true },
    { title: "Behavior", url: "/dashboard/analytics/behavior", premium: true },
    { title: "Journey", url: "/dashboard/analytics/journey", premium: true },
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
              {navItems.slice(0, 2).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === "/dashboard"} className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {/* Analytics expandable group */}
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setForceOpen((o) => !o)} className="hover:bg-sidebar-accent/50">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  {!collapsed && (
                    <span className="flex-1 flex items-center justify-between">
                      <span>Analytics</span>
                      {isAnalyticsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
              {!collapsed && isAnalyticsExpanded && analyticsSubItems.map((sub) => (
                <SidebarMenuItem key={sub.url}>
                  <SidebarMenuButton asChild size="sm">
                    <NavLink to={sub.url} end className="hover:bg-sidebar-accent/50 pl-8" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <span className="flex-1 flex items-center justify-between text-xs">
                        <span>{sub.title}</span>
                        {sub.premium && !isPremium && <Badge variant="outline" className="text-[9px] px-1 py-0 ml-2 border-amber-400 text-amber-600">PREMIUM</Badge>}
                      </span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {navItems.slice(2).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === "/dashboard"} className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && (
                        <span className="flex-1 flex items-center justify-between">
                          <span>{item.title}</span>
                          {item.badge !== undefined && <Badge variant="secondary" className="text-xs ml-2">{item.badge}</Badge>}
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
