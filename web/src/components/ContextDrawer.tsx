import { useState } from "react";
import { REPO_ROLES, type TaskContext } from "../../../shared/protocol";
import { useApp } from "../app/AppContext";
import { REPO_ROLE_LABEL } from "../constants/labels";

/** The gear panel: edit what Claude was told at the start, at any time. */
export function ContextDrawer({ onClose }: { onClose: () => void }) {
  const { state, send } = useApp();
  const [context, setContext] = useState<TaskContext>(() => structuredClone(state.context));
  const update = (patch: Partial<TaskContext>) => setContext({ ...context, ...patch });

  const save = () => {
    send({ type: "context_changed", context });
    onClose();
  };

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
          <input value={context.title} onChange={(e) => update({ title: e.target.value })} />
        </label>
        <label>
          Task link
          <input value={context.taskUrl ?? ""} placeholder="ClickUp, GitHub issue…" onChange={(e) => update({ taskUrl: e.target.value })} />
        </label>
        <label>
          Description
          <textarea rows={7} value={context.task} onChange={(e) => update({ task: e.target.value })} />
        </label>

        <div className="field">
          <span>Repositories</span>
          {context.repos.map((repo, i) => (
            <div className="repo-row" key={repo.path}>
              <div>
                <b>{repo.name}</b>
                <small>{repo.path}</small>
              </div>
              <div className="seg">
                {REPO_ROLES.map((role) => (
                  <button
                    key={role}
                    className={repo.role === role ? "on" : ""}
                    onClick={() => update({ repos: context.repos.map((r, j) => (j === i ? { ...r, role } : r)) })}
                  >
                    {REPO_ROLE_LABEL[role]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <label>
          Design
          <textarea
            rows={2}
            value={context.design ?? ""}
            placeholder="Figma link or notes"
            onChange={(e) => update({ design: e.target.value })}
          />
        </label>
        <label>
          Style guide
          <textarea rows={4} value={context.styleGuide ?? ""} onChange={(e) => update({ styleGuide: e.target.value })} />
        </label>

        <div className="drawer-foot">
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" onClick={save}>
            Save and tell Claude
          </button>
        </div>
      </aside>
    </div>
  );
}
