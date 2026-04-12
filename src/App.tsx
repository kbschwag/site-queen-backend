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
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Apply from "./pages/Apply";
import BookCall from "./pages/BookCall";
import AdminDashboard from "./pages/AdminDashboard";
import ClientDashboard from "./pages/ClientDashboard";
import OperatorLogin from "./pages/operator/OperatorLogin";
import OperatorDashboard from "./pages/operator/OperatorDashboard";
import OperatorApplications from "./pages/operator/OperatorApplications";
import OperatorClients from "./pages/operator/OperatorClients";
import OperatorChangeRequests from "./pages/operator/OperatorChangeRequests";
import OperatorRevenue from "./pages/operator/OperatorRevenue";
import OperatorTeam from "./pages/operator/OperatorTeam";
import OperatorSettings from "./pages/operator/OperatorSettings";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/apply" element={<Apply />} />
            <Route path="/book-call" element={<BookCall />} />

            {/* Legacy admin */}
            <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />

            {/* Client dashboard */}
            <Route path="/dashboard" element={<ProtectedRoute><ClientDashboard /></ProtectedRoute>} />

            {/* Operator portal */}
            <Route path="/operator/login" element={<OperatorLogin />} />
            <Route path="/operator" element={<OperatorProtectedRoute><OperatorLayout /></OperatorProtectedRoute>}>
              <Route index element={<OperatorDashboard />} />
              <Route path="applications" element={<OperatorApplications />} />
              <Route path="clients" element={<OperatorClients />} />
              <Route path="change-requests" element={<OperatorChangeRequests />} />
              <Route path="revenue" element={<OperatorRevenue />} />
              <Route path="team" element={<OperatorTeam />} />
              <Route path="settings" element={<OperatorSettings />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
