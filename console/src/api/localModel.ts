import type { LookupKind } from "./types";

// Client for the local-only LLM gateway bridge (backend/src/dca/api/dev_llm.py, TD-60).
// Shapes mirror backend/src/dca/llm/tasks.py. The console never talks to a model directly:
// requests go through the gateway, which redacts, guards egress and validates output.

export interface ModelCited { text: string; cites: string[] }

export interface ModelCopilotAnswer {
  sentences: ModelCited[];
  lookup: LookupKind | null;
  suggested_actions: ({ kind: "add_note"; text: string } | { kind: "redraft"; draft_id: string; instruction: string })[];
  self_score: number;
}

export interface ModelBrief {
  headline: string;
  findings: ModelCited[];
  gaps: ModelCited[];
  conflicts: ModelCited[];
  risks: (ModelCited & { level: "low" | "medium" | "high" })[];
  plan: (ModelCited & { done: boolean; lookup: LookupKind | null; proposal_id: string | null })[];
  self_score: number;
}

export interface ModelMeta { model: string; prompt_version: string; attempts: number; latency_ms: number; input_tokens: number; output_tokens: number }

export interface ModelRequest {
  case: Record<string, unknown>;
  lookups_available: { kind: LookupKind; label: string; status: string }[];
}

export interface CopilotRequest extends ModelRequest {
  question: string;
  history: { role: string; text: string }[];
  allow_lookup: boolean;
  tool_result?: { lookup: LookupKind; evidence_id: string; finding: string };
}

export interface LocalModels {
  current: string;
  models: { name: string; size_gb: number; params: string }[];
}

export interface ModelClient {
  /** Model name if the gateway and model are reachable, else null. */
  status(): Promise<string | null>;
  /** Installed text models and the one in use, or null if the gateway is down. */
  models(): Promise<LocalModels | null>;
  /** Route every Co-Pilot task to `name`. */
  use(name: string): Promise<void>;
  copilotAnswer(req: CopilotRequest): Promise<{ output: ModelCopilotAnswer; meta: ModelMeta }>;
  brief(req: ModelRequest): Promise<{ output: ModelBrief; meta: ModelMeta }>;
}

export class LocalModelClient implements ModelClient {
  private cached: { at: number; model: string | null } | null = null;
  private readonly base: string;

  constructor(base = "/api/dev/llm") {
    this.base = base;
  }

  async status(): Promise<string | null> {
    if (this.cached && Date.now() - this.cached.at < 15_000) return this.cached.model;
    let model: string | null;
    try {
      const r = await fetch(`${this.base}/health`, { signal: AbortSignal.timeout(3000) });
      const body = (await r.json()) as { ok: boolean; model: string };
      model = r.ok && body.ok ? body.model : null;
    } catch {
      model = null;
    }
    this.cached = { at: Date.now(), model };
    return model;
  }

  async models(): Promise<LocalModels | null> {
    try {
      const r = await fetch(`${this.base}/models`, { signal: AbortSignal.timeout(3000) });
      return r.ok ? ((await r.json()) as LocalModels) : null;
    } catch {
      return null;
    }
  }

  async use(name: string): Promise<void> {
    const r = await fetch(`${this.base}/model`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: name }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `Couldn't switch to ${name}`);
    this.cached = null; // the next status() reflects the new model
  }

  private async post<T>(task: string, body: unknown): Promise<T> {
    const r = await fetch(`${this.base}/${task}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (!r.ok) throw new Error(`${task}: ${r.status} ${(await r.json().catch(() => ({}))).code ?? ""}`.trim());
    return (await r.json()) as T;
  }

  copilotAnswer(req: CopilotRequest) {
    return this.post<{ output: ModelCopilotAnswer; meta: ModelMeta }>("copilot_answer", req);
  }

  brief(req: ModelRequest) {
    return this.post<{ output: ModelBrief; meta: ModelMeta }>("investigation_brief", req);
  }
}
