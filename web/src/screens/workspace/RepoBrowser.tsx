import { useState } from "react";
import { useApp } from "../../app/AppContext";
import { FileTree } from "../../components/FileTree";
import { useRepoTree } from "./useRepoData";

/** Every repo of the task as a file tree: changed files by default, or everything. */
export function RepoBrowser({
  selected,
  version,
  onOpen,
}: {
  selected?: { repo: string; path: string };
  version: number;
  onOpen(repo: string, path: string): void;
}) {
  const { state } = useApp();
  const repos = state.context.repos;
  const [repo, setRepo] = useState(selected?.repo ?? repos[0]?.name ?? null);
  const tree = useRepoTree(repo, version);

  return (
    <div className="repo-browser">
      {repos.length > 1 && (
        <select value={repo ?? ""} onChange={(e) => setRepo(e.target.value)}>
          {repos.map((r) => (
            <option key={r.name} value={r.name}>
              {r.name}
              {r.role === "context" ? " (context only)" : ""}
            </option>
          ))}
        </select>
      )}
      {tree.error && <p className="err tree-empty">{tree.error}</p>}
      {tree.data && (
        <FileTree
          files={tree.data.files}
          changed={tree.data.changed}
          selected={selected?.repo === repo ? selected.path : undefined}
          onOpen={(path) => onOpen(repo!, path)}
        />
      )}
      {tree.data?.truncated && <p className="muted tree-empty">Showing the first {tree.data.files.length} files.</p>}
    </div>
  );
}
