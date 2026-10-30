import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router";
import { ApiContext } from "./api/hooks";
import { LocalModelClient, type ModelClient } from "./api/localModel";
import { MockApi } from "./api/mockApi";
import type { DisputeApi } from "./api/types";
import { SessionProvider, useSession } from "./auth/session";
import { Shell } from "./components/Shell";
import { ToastProvider } from "./components/ui";
import { ApprovalsPage } from "./pages/approvals/ApprovalsPage";
import { CasePage } from "./pages/case/CasePage";
import { AdminPage } from "./pages/admin/AdminPage";
import { AuditPage } from "./pages/audit/AuditPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { IntakePage } from "./pages/intake/IntakePage";
import { LoginPage } from "./pages/LoginPage";
import { QueuePage } from "./pages/queue/QueuePage";

/** Wires the session to the API. Until the backend exists (M5–M6) the API is the in-memory mock. */
function ApiProvider({ api, latencyMs, localModel, modelClient, children }: {
  api?: DisputeApi; latencyMs: number; localModel: boolean; modelClient?: ModelClient; children: ReactNode;
}) {
  const { currentUser } = useSession();
  const [client] = useState<DisputeApi>(
    () => api ?? new MockApi(currentUser, { latencyMs, model: modelClient ?? (localModel ? new LocalModelClient() : undefined) }),
  );
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function AppProviders({ children, initialUserId, api, mockLatencyMs = 150, localModel = true, modelClient }: {
  children: ReactNode; initialUserId?: string; api?: DisputeApi; mockLatencyMs?: number;
  /** Use the local model through the dev gateway bridge when it is up (TD-60). Tests turn it off. */
  localModel?: boolean;
  /** Tests inject a fake model client here. */
  modelClient?: ModelClient;
}) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5_000 } } }));
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider initialUserId={initialUserId}>
        <ApiProvider api={api} latencyMs={mockLatencyMs} localModel={localModel} modelClient={modelClient}>
          <ToastProvider>{children}</ToastProvider>
        </ApiProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

export function AppRoutes() {
  const { user } = useSession();
  if (!user) return <Routes><Route path="*" element={<LoginPage />} /></Routes>;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/cases" element={<QueuePage />} />
        <Route path="/cases/:ref" element={<CasePage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/intake" element={<IntakePage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/cases" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  );
}
