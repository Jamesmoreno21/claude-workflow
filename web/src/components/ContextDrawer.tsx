import { useState } from "react";
import { REPO_ROLES, type RepoRef, type TaskContext } from "../../../shared/protocol";
import { useApp } from "../app/AppContext";
import { REPO_ROLE_LABEL } from "../constants/labels";
import { inspectRepo } from "../services/api";

function RoleToggle({ role, onChange }: { role: RepoRef["role"]; onChange(role: RepoRef["role"]): void }) {
  return (
    <div className="seg">
      {REPO_ROLES.map((r) => (
        <button key={r} className={role === r ? "on" : ""} onClick={() => onChange(r)}>
          {REPO_ROLE_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

/** Adds a repository by path; the server checks it's a git repo and finds its root. */
function AddRepo({ repos, onAdd }: { repos: RepoRef[]; onAdd(repo: RepoRef): void }) {
  const [path, setPath] = useState("");
  const [role, setRole] = useState<RepoRef["role"]>("change");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const add = async () => {
    if (!path.trim()) return;
    setChecking(true);
    const result = await inspectRepo(path);
    setChecking(false);
    if (!result.ok) return setError(result.error);
    if (repos.some((r) => r.path === result.path)) return setError(`${result.name} is already in the task`);
    const taken = new Set(repos.map((r) => r.name));
    let name = result.name;
    for (let n = 2; taken.has(name); n++) name = `${result.name}-${n}`;
    onAdd({ path: result.path, name, role });
    setPath("");
    setError(null);
  };

  return (
    <div className="add-repo">
      <input
        value={path}
        placeholder="Add a repository: ~/code/web-app"
        onChange={(e) => {
          setPath(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <RoleToggle role={role} onChange={setRole} />
      <button className="ghost" disabled={!path.trim() || checking} onClick={add}>
        {checking ? "Checking…" : "Add"}
      </button>
      {error && <small className="err">{error}</small>}
    </div>
  );
}

/** The gear panel: edit what Claude was told at the start, at any time. */
export function ContextDrawer({ onClose }: { onClose: () => void }) {
  const { state, send } = useApp();
  const [context, setContext] = useState<TaskContext>(() => structuredClone(state.context));
  const update = (patch: Partial<TaskContext>) => setContext({ ...context, ...patch });
  const setRole = (index: number, role: RepoRef["role"]) =>
    update({ repos: context.repos.map((r, i) => (i === index ? { ...r, role } : r)) });

  const removeRepo = (repo: RepoRef) => {
    const touched = state.files.some((f) => f.repo === repo.name);
    if (touched && !confirm(`Claude already changed files in ${repo.name}. Remove it from the task anyway?`)) return;
    update({ repos: context.repos.filter((r) => r !== repo) });
  };

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
              <RoleToggle role={repo.role} onChange={(role) => setRole(i, role)} />
              <button
                className="icon"
                title={context.repos.length === 1 ? "A task needs at least one repository" : `Remove ${repo.name}`}
                disabled={context.repos.length === 1}
                onClick={() => removeRepo(repo)}
              >
                ✕
              </button>
            </div>
          ))}
          <AddRepo repos={context.repos} onAdd={(repo) => update({ repos: [...context.repos, repo] })} />
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
          <button
            className="ghost danger"
            onClick={() => {
              if (!confirm("End the workflow? Claude goes back to the terminal; your files stay as they are.")) return;
              send({ type: "end_workflow" });
              onClose();
            }}
          >
            End workflow
          </button>
          <span className="spacer" />
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
