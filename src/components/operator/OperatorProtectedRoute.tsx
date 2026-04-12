import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOperatorRole } from "@/hooks/useOperatorRole";

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

  if (authLoading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/operator/login" replace />;
  if (!role || role === null) return <Navigate to="/operator/login" replace />;
  if (ownerOnly && !isOwner) return <Navigate to="/operator" replace />;
  if (requireReviewAccess && !canReviewApplications) return <Navigate to="/operator" replace />;
  if (requireChangeRequestAccess && !canHandleChangeRequests) return <Navigate to="/operator" replace />;

  return <>{children}</>;
}
