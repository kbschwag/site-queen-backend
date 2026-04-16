import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOperatorRole } from "@/hooks/useOperatorRole";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  children: React.ReactNode;
  ownerOnly?: boolean;
  requireReviewAccess?: boolean;
  requireChangeRequestAccess?: boolean;
}

export function OperatorProtectedRoute({
  children,
  ownerOnly = false,
  requireReviewAccess = false,
  requireChangeRequestAccess = false,
}: Props) {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading, isOwner, canReviewApplications, canHandleChangeRequests } = useOperatorRole();

  // Audit log operator access
  useEffect(() => {
    if (!user || !role) return;
    supabase.from("audit_log").insert({
      user_id: user.id,
      user_email: user.email,
      action: "operator_portal_access",
      target_table: "operator_portal",
      details: { role, path: window.location.pathname },
    }).then(() => {});
  }, [user?.id, role]);

  if (authLoading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/operator/login" replace />;

  // Verify role is valid for operator portal
  if (!role || !["owner", "partner", "team_member"].includes(role)) {
    // Log unauthorized attempt
    if (user) {
      supabase.from("audit_log").insert({
        user_id: user.id,
        user_email: user.email,
        action: "unauthorized_operator_access",
        details: { attempted_role: role || "none" },
      }).then(() => {});
    }
    return <Navigate to="/operator/login" replace />;
  }

  if (ownerOnly && !isOwner) return <Navigate to="/operator" replace />;
  if (requireReviewAccess && !canReviewApplications) return <Navigate to="/operator" replace />;
  if (requireChangeRequestAccess && !canHandleChangeRequests) return <Navigate to="/operator" replace />;

  return <>{children}</>;
}
