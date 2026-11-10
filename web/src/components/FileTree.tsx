import { useMemo, useState } from "react";

interface Folder {
  name: string;
  path: string;
  folders: Map<string, Folder>;
  files: string[];
}

function buildTree(paths: string[]): Folder {
  const root: Folder = { name: "", path: "", folders: new Map(), files: [] };
  for (const path of paths) {
    const parts = path.split("/");
    let folder = root;
    for (const part of parts.slice(0, -1)) {
      const next = folder.path ? `${folder.path}/${part}` : part;
      if (!folder.folders.has(part)) folder.folders.set(part, { name: part, path: next, folders: new Map(), files: [] });
      folder = folder.folders.get(part)!;
    }
    folder.files.push(path);
  }
  return root;
}

const parentFolders = (path: string) =>
  path
    .split("/")
    .slice(0, -1)
    .map((_, i, parts) => parts.slice(0, i + 1).join("/"));

const STATUS_LABEL: Record<string, string> = { M: "modified", A: "added", "?": "new", D: "deleted", R: "renamed" };

/** A repo's files as a collapsible tree; changed files are marked, and can be the only ones shown. */
export function FileTree({
  files,
  changed,
  selected,
  onOpen,
}: {
  files: string[];
  changed: Record<string, string>;
  selected?: string;
  onOpen(path: string): void;
}) {
  const [changedOnly, setChangedOnly] = useState(true);
  const [filter, setFilter] = useState("");
  const [toggled, setToggled] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const pool = changedOnly ? Object.keys(changed) : files;
    const needle = filter.trim().toLowerCase();
    return needle ? pool.filter((p) => p.toLowerCase().includes(needle)) : pool;
  }, [files, changed, changedOnly, filter]);
  const tree = useMemo(() => buildTree([...visible].sort()), [visible]);

  // Changed-only and filtered views start expanded; the full tree starts collapsed
  // except along the open file's path. Clicking a folder flips that default.
  const expandedByDefault = changedOnly || filter.trim() !== "";
  const pathToSelected = new Set(selected ? parentFolders(selected) : []);
  const isOpen = (folder: string) => (expandedByDefault || pathToSelected.has(folder)) !== toggled.has(folder);
  const toggle = (folder: string) => {
    const next = new Set(toggled);
    if (next.has(folder)) next.delete(folder);
    else next.add(folder);
    setToggled(next);
  };

  const renderFolder = (folder: Folder, depth: number) => (
    <>
      {[...folder.folders.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((child) => (
          <div key={child.path}>
            <button className="tree-dir" style={{ paddingLeft: 10 + depth * 12 }} onClick={() => toggle(child.path)}>
              <span className="st">{isOpen(child.path) ? "▾" : "▸"}</span>
              {child.name}
            </button>
            {isOpen(child.path) && renderFolder(child, depth + 1)}
          </div>
        ))}
      {folder.files.map((path) => (
        <button
          key={path}
          className={`tree-file ${path === selected ? "on" : ""} ${changed[path] ? "changed" : ""}`}
          style={{ paddingLeft: 22 + depth * 12 }}
          onClick={() => onOpen(path)}
          title={path}
        >
          <span className="nm">{path.split("/").pop()}</span>
          {changed[path] && (
            <span className={`git-status s-${changed[path] === "?" ? "new" : changed[path]}`} title={STATUS_LABEL[changed[path]]}>
              {changed[path] === "?" ? "U" : changed[path]}
            </span>
          )}
        </button>
      ))}
    </>
  );

  return (
    <div className="file-tree">
      <div className="tree-tools">
        <div className="seg">
          <button className={changedOnly ? "on" : ""} onClick={() => setChangedOnly(true)}>
            Changed
          </button>
          <button className={changedOnly ? "" : "on"} onClick={() => setChangedOnly(false)}>
            All files
          </button>
        </div>
        <input value={filter} placeholder="Filter…" onChange={(e) => setFilter(e.target.value)} />
      </div>
      {visible.length === 0 ? (
        <p className="tree-empty muted">{changedOnly ? "No changes yet." : "No files match."}</p>
      ) : (
        renderFolder(tree, 0)
      )}
    </div>
  );
}
