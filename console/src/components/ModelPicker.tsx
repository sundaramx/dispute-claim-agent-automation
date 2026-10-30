import { useLocalModels, useSwitchModel } from "../api/hooks";
import { errorText, useToast } from "./ui";

/**
 * Bottom-left picker for the local model behind the Investigation Co-Pilot (TD-63).
 * Local development only: in hosted environments model routing is Admin configuration
 * (FR-25, FR-29 AC 3), versioned and audited.
 */
export function ModelPicker() {
  const toast = useToast();
  const models = useLocalModels();
  const sw = useSwitchModel();
  const data = models.data;

  return (
    <div className="model-picker">
      <label htmlFor="model-pick">Co-Pilot model <span className="muted">· local</span></label>
      {data ? (
        <select id="model-pick" value={sw.isPending ? sw.variables : data.current} disabled={sw.isPending}
          onChange={(e) => {
            const name = e.target.value;
            sw.mutate(name, {
              onSuccess: () => toast(`Co-Pilot now uses ${name}. The first answer may be slow while it loads.`),
              onError: (err) => toast(errorText(err), "bad"),
            });
          }}>
          {data.available.map((m) => <option key={m.name} value={m.name}>{m.name}{m.detail ? ` (${m.detail})` : ""}</option>)}
        </select>
      ) : (
        <select id="model-pick" disabled><option>{models.isPending ? "Checking…" : "Offline · rule-based"}</option></select>
      )}
      {sw.isPending && <span className="note" role="status">Switching…</span>}
    </div>
  );
}
