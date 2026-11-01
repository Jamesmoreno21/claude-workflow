import { useState } from "react";
import type { TaskContext } from "../../../shared/protocol";
import { useApp } from "../connection";

/** The gear panel: edit what Claude was told at the start, at any time. */
export function ContextDrawer({ onClose }: { onClose: () => void }) {
  const { state, send } = useApp();
  const [ctx, setCtx] = useState<TaskContext>(structuredClone(state.context));
  const set = (patch: Partial<TaskContext>) => setCtx({ ...ctx, ...patch });

  return (
    <div className="scrim" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2>Task context</h2>
          <button className="icon" onClick={onClose}>
            ✕
          </button>
        </div>

        <label>
          Title
          <input value={ctx.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label>
          Task link
          <input value={ctx.taskUrl ?? ""} placeholder="ClickUp, GitHub issue…" onChange={(e) => set({ taskUrl: e.target.value })} />
        </label>
        <label>
          Description
          <textarea rows={7} value={ctx.task} onChange={(e) => set({ task: e.target.value })} />
        </label>

        <div className="field">
          <span>Repositories</span>
          {ctx.repos.map((r, i) => (
            <div className="repo-row" key={r.path}>
              <div>
                <b>{r.name}</b>
                <small>{r.path}</small>
              </div>
              <div className="seg">
                {(["change", "context"] as const).map((role) => (
                  <button
                    key={role}
                    className={r.role === role ? "on" : ""}
                    onClick={() => set({ repos: ctx.repos.map((x, j) => (j === i ? { ...x, role } : x)) })}
                  >
                    {role === "change" ? "Changes" : "Context only"}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <label>
          Design
          <textarea rows={2} value={ctx.design ?? ""} placeholder="Figma link or notes" onChange={(e) => set({ design: e.target.value })} />
        </label>
        <label>
          Style guide
          <textarea rows={4} value={ctx.styleGuide ?? ""} onChange={(e) => set({ styleGuide: e.target.value })} />
        </label>

        <div className="drawer-foot">
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            onClick={() => {
              send({ type: "context_changed", context: ctx });
              onClose();
            }}
          >
            Save and tell Claude
          </button>
        </div>
      </aside>
    </div>
  );
}
