import { createContext, useContext } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuditQuery, CaseQuery, ConfigPatch, DisputeApi, LookupKind, NewDispute, Proposal, SuggestedAction } from "./types";

export const ApiContext = createContext<DisputeApi | null>(null);

export function useApi(): DisputeApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi must be used inside ApiContext");
  return api;
}

export const useSystemInfo = () => {
  const api = useApi();
  return useQuery({ queryKey: ["system-info"], queryFn: () => api.systemInfo() });
};

export const useCases = (query: CaseQuery) => {
  const api = useApi();
  return useQuery({ queryKey: ["cases", query], queryFn: () => api.listCases(query) });
};

export const useCase = (ref: string) => {
  const api = useApi();
  return useQuery({ queryKey: ["case", ref], queryFn: () => api.getCase(ref) });
};

export const useInbox = () => {
  const api = useApi();
  return useQuery({ queryKey: ["inbox"], queryFn: () => api.inbox() });
};

export type DecisionKind = "approve" | "reject" | "return";

export interface DecisionInput {
  kind: DecisionKind;
  proposal: Proposal;
  reason?: string;
}

/** Approve, reject or return a proposal, bound to the content hash the user reviewed (FR-11 AC 4). */
export const useDecision = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, proposal, reason = "" }: DecisionInput) => {
      if (kind === "approve") return api.approve(proposal.id, proposal.contentHash);
      if (kind === "reject") return api.reject(proposal.id, proposal.contentHash, reason);
      return api.returnForRework(proposal.id, proposal.contentHash, reason);
    },
    onSettled: () => qc.invalidateQueries(),
  });
};

export const useAssign = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (ref: string) => api.assign(ref), onSettled: () => qc.invalidateQueries() });
};

export const useDashboard = () => {
  const api = useApi();
  return useQuery({ queryKey: ["dashboard"], queryFn: () => api.dashboard() });
};

export const useCreateDispute = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: NewDispute; idempotencyKey: string }) => api.createDispute(input, idempotencyKey),
    onSuccess: () => qc.invalidateQueries(),
  });
};

export const useAuditEvents = (query: AuditQuery, enabled = true) => {
  const api = useApi();
  return useQuery({ queryKey: ["audit", query], queryFn: () => api.auditEvents(query), enabled });
};

export const useVerifyAudit = () => {
  const api = useApi();
  return useMutation({ mutationFn: () => api.verifyAudit() });
};

export const useReplay = () => {
  const api = useApi();
  return useMutation({ mutationFn: (caseRef: string) => api.replay(caseRef) });
};

export const useConfig = (enabled = true) => {
  const api = useApi();
  return useQuery({ queryKey: ["config"], queryFn: () => api.config(), enabled });
};

export const useConfigHistory = (enabled = true) => {
  const api = useApi();
  return useQuery({ queryKey: ["config-history"], queryFn: () => api.configHistory(), enabled });
};

export const useUpdateConfig = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ patch, reason }: { patch: ConfigPatch; reason: string }) => api.updateConfig(patch, reason),
    onSuccess: () => qc.invalidateQueries(),
  });
};

export const useSetAutoApprove = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ enabled, reason }: { enabled: boolean; reason: string }) => api.setAutoApprove(enabled, reason),
    onSuccess: () => qc.invalidateQueries(),
  });
};

export const useCopilotTranscript = (ref: string) => {
  const api = useApi();
  return useQuery({ queryKey: ["copilot", ref], queryFn: () => api.copilotTranscript(ref) });
};

export const useAskCopilot = (ref: string) => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (question: string) => api.askCopilot(ref, question),
    // A turn can run a lookup, which changes the case and the brief too.
    onSettled: () => qc.invalidateQueries(),
  });
};

export const useCopilotAction = (ref: string) => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (action: SuggestedAction) => api.runCopilotAction(ref, action), onSettled: () => qc.invalidateQueries() });
};

export const useInvestigationBrief = (ref: string) => {
  const api = useApi();
  return useQuery({ queryKey: ["brief", ref], queryFn: () => api.investigationBrief(ref) });
};

export const useRunLookup = (ref: string) => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (kind: LookupKind) => api.runLookup(ref, kind), onSettled: () => qc.invalidateQueries() });
};
