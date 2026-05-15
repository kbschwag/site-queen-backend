import {
  LayoutDashboard,
  FileText,
  Users,
  MessageSquare,
  Mail,
  DollarSign,
  UserCog,
  Settings,
  LogOut,
  Crown,
  Target,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useOperatorRole } from "@/hooks/useOperatorRole";
import { useAuth } from "@/contexts/AuthContext";
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

export function OperatorSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { isOwner, isPartner, canReviewApplications, canHandleChangeRequests } = useOperatorRole();
  const { signOut, user } = useAuth();

  const navItems = [];

  // Dashboard — Owner & Partner
  if (isOwner || isPartner) {
    navItems.push({ title: "Dashboard", url: "/operator", icon: LayoutDashboard });
  }

  // Prospects — Owner & Partner
  if (isOwner || isPartner) {
    navItems.push({ title: "Prospects", url: "/operator/prospects", icon: Target });
  }

  // Applications — Owner, Partner, or team with review access
  if (canReviewApplications) {
    navItems.push({ title: "Applications", url: "/operator/applications", icon: FileText });
  }

  // Clients — Owner & Partner
  if (isOwner || isPartner) {
    navItems.push({ title: "Clients", url: "/operator/clients", icon: Users });
  }

  // Change Requests — Owner, Partner, or team with CR access
  if (canHandleChangeRequests) {
    navItems.push({ title: "Change Requests", url: "/operator/change-requests", icon: MessageSquare });
  }

  // Support Messages — Owner, Partner, or team with CR access
  if (canHandleChangeRequests) {
    navItems.push({ title: "Support Messages", url: "/operator/support-messages", icon: Mail });
  }

  // Revenue — Owner only
  if (isOwner) {
    navItems.push({ title: "Revenue", url: "/operator/revenue", icon: DollarSign });
  }

  // Team — Owner only
  if (isOwner) {
    navItems.push({ title: "Team", url: "/operator/team", icon: UserCog });
  }

  // Settings — Owner only
  if (isOwner) {
    navItems.push({ title: "Settings", url: "/operator/settings", icon: Settings });
  }

  const handleSignOut = async () => {
    await signOut();
    navigate("/operator/login");
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
                      end={item.url === "/operator"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        {!collapsed && user && (
          <p className="text-xs text-muted-foreground truncate px-2 mb-1">
            {user.email}
          </p>
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
