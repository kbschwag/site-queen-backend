import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { OperatorProtectedRoute } from "@/components/operator/OperatorProtectedRoute";
import { OperatorLayout } from "@/components/operator/OperatorLayout";
import Index from "./pages/Index";
import MarketingLayout from "@/layouts/MarketingLayout";
import MarketingHome from "@/pages/marketing/Home";
import MarketingHelp from "@/pages/marketing/Help";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Apply from "./pages/Apply";
import BookCall from "./pages/BookCall";
import AuthCallback from "./pages/AuthCallback";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import SetPassword from "./pages/SetPassword";
import AdminDashboard from "./pages/AdminDashboard";
import ClientDashboard from "./pages/ClientDashboard";
import ClientOverview from "./pages/client/ClientOverview";
import ClientWebsite from "./pages/client/ClientWebsite";
import ClientSupport from "./pages/client/ClientSupport";
import ClientContact from "./pages/client/ClientContact";
import ClientBilling from "./pages/client/ClientBilling";
import ClientHelp from "./pages/client/ClientHelp";
import ClientSettings from "./pages/client/ClientSettings";
import ClientAnalytics from "./pages/client/ClientAnalytics";
import AnalyticsConversions from "./pages/client/analytics/Conversions";
import AnalyticsSearch from "./pages/client/analytics/Search";
import AnalyticsBehavior from "./pages/client/analytics/Behavior";
import AnalyticsJourney from "./pages/client/analytics/Journey";
import OperatorLogin from "./pages/operator/OperatorLogin";
import OperatorDashboard from "./pages/operator/OperatorDashboard";
import OperatorApplications from "./pages/operator/OperatorApplications";
import OperatorClients from "./pages/operator/OperatorClients";
import OperatorProspects from "./pages/operator/OperatorProspects";
import ProspectDetail from "./pages/operator/ProspectDetail";
import OperatorChangeRequests from "./pages/operator/OperatorChangeRequests";
import OperatorSupportMessages from "./pages/operator/OperatorSupportMessages";
import OperatorRevenue from "./pages/operator/OperatorRevenue";
import OperatorTeam from "./pages/operator/OperatorTeam";
import OperatorSettings from "./pages/operator/OperatorSettings";
import OperatorTools from "./pages/operator/OperatorTools";
import ClaimProspect from "./pages/ClaimProspect";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Marketing site (public, brand-scoped layout) */}
            <Route path="/" element={<Index />} />
            <Route element={<MarketingLayout />}>
              <Route path="/apply" element={<Apply />} />
              <Route path="/help" element={<MarketingHelp />} />
              <Route path="/old-home" element={<MarketingHome />} />
            </Route>

            <Route path="/login" element={<Login />} />
            <Route path="/dashboard/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/book-call" element={<BookCall />} />
            <Route path="/claim/:id" element={<ClaimProspect />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/set-password" element={<SetPassword />} />

            {/* Legacy admin */}
            <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />

            {/* Client dashboard with sidebar layout */}
            <Route path="/dashboard" element={<ProtectedRoute><ClientDashboard /></ProtectedRoute>}>
              <Route index element={<ClientOverview />} />
              <Route path="website" element={<ClientWebsite />} />
              <Route path="support" element={<ClientSupport />} />
              <Route path="contact" element={<ClientContact />} />
              <Route path="analytics" element={<ClientAnalytics />} />
              <Route path="analytics/conversions" element={<AnalyticsConversions />} />
              <Route path="analytics/search" element={<AnalyticsSearch />} />
              <Route path="analytics/behavior" element={<AnalyticsBehavior />} />
              <Route path="analytics/journey" element={<AnalyticsJourney />} />
              <Route path="billing" element={<ClientBilling />} />
              <Route path="help" element={<ClientHelp />} />
              <Route path="settings" element={<ClientSettings />} />
            </Route>

            {/* Operator portal */}
            <Route path="/operator/login" element={<OperatorLogin />} />
            <Route path="/operator" element={<OperatorProtectedRoute><OperatorLayout /></OperatorProtectedRoute>}>
              <Route index element={<OperatorDashboard />} />
              <Route path="prospects" element={<OperatorProspects />} />
              <Route path="prospects/:id" element={<ProspectDetail />} />
              <Route path="applications" element={<OperatorApplications />} />
              <Route path="clients" element={<OperatorClients />} />
              <Route path="change-requests" element={<OperatorChangeRequests />} />
              <Route path="support-messages" element={<OperatorSupportMessages />} />
              <Route path="revenue" element={<OperatorRevenue />} />
              <Route path="team" element={<OperatorTeam />} />
              <Route path="settings" element={<OperatorSettings />} />
              <Route path="tools" element={<OperatorTools />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
