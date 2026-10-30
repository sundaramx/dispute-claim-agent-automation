import type { CopilotRequest, ModelBrief, ModelClient, ModelCopilotAnswer, ModelMeta, ModelRequest } from "../api/localModel";

/** A scripted stand-in for the local model gateway: answers in order, records every request. */
export const META: ModelMeta = { model: "ollama:qwen2.5:7b", prompt_version: "copilot_answer.v1", attempts: 1, latency_ms: 900, input_tokens: 1400, output_tokens: 60 };

export class FakeModel implements ModelClient {
  calls: CopilotRequest[] = [];
  briefs: ModelRequest[] = [];
  current = "qwen2.5:7b";
  constructor(private answers: ModelCopilotAnswer[], private brief_?: ModelBrief, private up = true) {}
  async status() { return this.up ? this.current : null; }
  async models() {
    return this.up ? { current: this.current, models: [{ name: "qwen2.5:7b", size_gb: 4.7, params: "7.6B" }, { name: "qwen3.6:27b-mlx", size_gb: 19.8, params: "" }] } : null;
  }
  async use(name: string) { this.current = name; }
  async copilotAnswer(req: CopilotRequest) { this.calls.push(req); return { output: this.answers.shift()!, meta: META }; }
  async brief(req: ModelRequest) { this.briefs.push(req); if (!this.brief_) throw new Error("502"); return { output: this.brief_, meta: META }; }
}
