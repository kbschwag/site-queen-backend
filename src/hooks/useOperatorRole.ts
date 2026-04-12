import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type OperatorRole = "owner" | "partner" | "team_member" | null;

interface StaffPermissions {
  can_review_applications: boolean;
  can_handle_change_requests: boolean;
  is_active: boolean;
}

interface OperatorRoleData {
  role: OperatorRole;
  permissions: StaffPermissions | null;
  loading: boolean;
  isOwner: boolean;
  isPartner: boolean;
  isTeamMember: boolean;
  canReviewApplications: boolean;
  canHandleChangeRequests: boolean;
}

export function useOperatorRole(): OperatorRoleData {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<OperatorRole>(null);
  const [permissions, setPermissions] = useState<StaffPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setRole(null);
      setPermissions(null);
      setLoading(false);
      return;
    }

    const fetchRole = async () => {
      // Get profile role
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      const profileRole = profile?.role as string | null;

      if (profileRole === "owner" || profileRole === "partner" || profileRole === "team_member") {
        setRole(profileRole);
      } else {
        setRole(null);
        setPermissions(null);
        setLoading(false);
        return;
      }

      // If team member, fetch permissions
      if (profileRole === "team_member") {
        const { data: perms } = await supabase
          .from("staff_permissions")
          .select("can_review_applications, can_handle_change_requests, is_active")
          .eq("user_id", user.id)
          .single();

        setPermissions(perms as StaffPermissions | null);
      }

      setLoading(false);
    };

    fetchRole();
  }, [user, authLoading]);

  const isOwner = role === "owner";
  const isPartner = role === "partner";
  const isTeamMember = role === "team_member";

  return {
    role,
    permissions,
    loading: loading || authLoading,
    isOwner,
    isPartner,
    isTeamMember,
    canReviewApplications: isOwner || isPartner || (isTeamMember && !!permissions?.can_review_applications && !!permissions?.is_active),
    canHandleChangeRequests: isOwner || isPartner || (isTeamMember && !!permissions?.can_handle_change_requests && !!permissions?.is_active),
  };
}
