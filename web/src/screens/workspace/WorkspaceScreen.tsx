import { useMemo, useRef, useState } from "react";
import { isUnresolved, type CodeSelection, type FileEntry, type Finding } from "../../../../shared/protocol";
import { useApp, useFocus } from "../../app/AppContext";
import { DiffEditor, type DiffEditorHandle, type Zone } from "../../components/editor/DiffEditor";
import { usePreference } from "../../config/settings";
import { FILE_STATUS_ICON, FINDING_STATUS_ICON } from "../../constants/labels";
import { useHotkeys } from "../../hooks/useHotkeys";
import { useReplay } from "../../hooks/useReplay";
import { buildRows, typedText } from "../../lib/diff";
import { saveFile } from "../../services/files";
import { fileKey, LayerStrip, ReplayBar } from "./bars";
import { FindingBox, findingLabel, FixBanner, sortBySeverity } from "./findings";
import { RepoBrowser } from "./RepoBrowser";
import { useRepoFile } from "./useRepoData";

type DocRef = { repo: string; path: string };
type SideTab = "findings" | "task" | "repo";

const sameFile = (a: DocRef | undefined, b: DocRef | undefined) => !!a && !!b && a.repo === b.repo && a.path === b.path;
const fileName = (path: string) => path.split("/").pop();

/** The full (unfolded) diff of a task file; memoized because the replay re-renders often. */
function useDiffRows(before: string | undefined, after: string | undefined) {
  return useMemo(() => (after === undefined ? [] : buildRows(before ?? "", after, Infinity)), [before, after]);
}

/**
 * What the editor shows: the file Claude is on (coding) or the selected
 * finding's file (review), unless the user opened another one since.
 */
function useOpenDocument(followed: DocRef | undefined, followKey: string | undefined, fallback: DocRef | undefined) {
  const [picked, setPicked] = useState<{ ref: DocRef; whileFollowing?: string } | null>(null);
  const doc = picked && (picked.whileFollowing === followKey || !followed) ? picked.ref : (followed ?? fallback);
  return { doc, open: (ref: DocRef) => setPicked({ ref, whileFollowing: followKey }) };
}

function TaskFiles({
  files,
  current,
  showLayers,
  onOpen,
}: {
  files: FileEntry[];
  current?: DocRef;
  showLayers: boolean;
  onOpen(f: FileEntry): void;
}) {
  const { state } = useApp();
  const repos = state.context.repos.filter((r) => files.some((f) => f.repo === r.name));
  return (
    <>
      {repos.map((repo) => (
        <div key={repo.name}>
          <div className="tree-repo">{repo.name}</div>
          {files
            .filter((f) => f.repo === repo.name)
            .map((f) => (
              <button key={fileKey(f)} className={`tree-file ${f.status} ${sameFile(f, current) ? "on" : ""}`} onClick={() => onOpen(f)}>
                <span className="st">{FILE_STATUS_ICON[f.status]}</span>
                <span className="nm">{f.path}</span>
                {showLayers && f.layer && <span className="layer-tag">{f.layer}</span>}
              </button>
            ))}
        </div>
      ))}
      {files.length === 0 && <p className="tree-empty muted">Claude hasn't started a file yet.</p>}
    </>
  );
}

function FindingsList({ findings, selected, onSelect }: { findings: Finding[]; selected?: Finding; onSelect(f: Finding): void }) {
  return (
    <>
      {findings.map((f) => (
        <button key={f.id} className={`finding-item ${f.status} ${f === selected ? "on" : ""}`} onClick={() => onSelect(f)}>
          <span className={`num sev-${f.severity}`}>{f.id}</span>
          <div>
            <b>{f.title}</b>
            <small>
              {fileName(f.path)}:{f.line} · {f.category}
            </small>
          </div>
          <span className="st">{FINDING_STATUS_ICON[f.status]}</span>
        </button>
      ))}
    </>
  );
}

/**
 * The code workspace for both coding and pre-review: a Monaco editor with the
 * task's files, the whole repo, typing replays, edits saved to disk, questions
 * about selected code, and review findings inline.
 */
export function WorkspaceScreen() {
  const { state, send } = useApp();
  const review = state.phase === "review";
  const files = state.files;

  // ---- Findings (review) ----
  const [showDismissed, setShowDismissed] = useState(false);
  const findings = sortBySeverity(state.findings.filter((f) => showDismissed || f.status !== "dismissed"));
  const [findingId, setFindingId] = useState(() => findings[0]?.id);
  const finding = review ? (findings.find((f) => f.id === findingId) ?? findings.find(isUnresolved) ?? findings[0]) : undefined;
  const unresolved = state.findings.filter(isUnresolved);

  // ---- Which file is open ----
  const active = files.find((f) => f.status === "awaiting_approval") ?? files.find((f) => f.status === "writing");
  const followed = review ? finding : active;
  const followKey = review ? `finding:${finding?.id}` : active && `${fileKey(active)}#${active.revision}`;
  const { doc, open } = useOpenDocument(followed && { repo: followed.repo, path: followed.path }, followKey, files.at(-1));
  const taskFile = files.find((f) => sameFile(f, doc));
  const repo = state.context.repos.find((r) => r.name === doc?.repo);
  useFocus(doc && `file:${doc.repo}/${doc.path}`, doc && fileName(doc.path));

  // ---- Contents ----
  const [version, setVersion] = useState(0);
  const [discardCount, setDiscardCount] = useState(0);
  const hasTaskDiff = taskFile?.after !== undefined;
  const browsed = useRepoFile(hasTaskDiff ? null : (doc?.repo ?? null), doc?.path ?? null, version);
  const before = taskFile?.before;
  const after = taskFile?.after;
  const rows = useDiffRows(before, after);
  const [replayCode, setReplayCode] = usePreference("replayCode");
  const awaitingApproval = !review && taskFile?.status === "awaiting_approval";
  const replaying = awaitingApproval && replayCode;
  const replay = useReplay(rows, taskFile ? `${fileKey(taskFile)}#${taskFile.revision}` : "", replaying);
  const typed = replaying && !replay.done ? typedText(rows, replay.pos) : null;
  const fixShown = review && finding?.status === "fixing" && finding.fix?.ready && sameFile(finding, doc) ? finding : undefined;

  let view: { original: string; modified: string; readOnly: boolean } | null = null;
  if (fixShown) view = { original: fixShown.fix!.before, modified: fixShown.fix!.after, readOnly: true };
  else if (hasTaskDiff)
    view = {
      original: before ?? "",
      modified: typed?.text ?? after!,
      readOnly: repo?.role !== "change" || typed !== null || taskFile!.status === "writing",
    };
  else if (browsed.data && !browsed.data.binary)
    view = { original: browsed.data.head, modified: browsed.data.working, readOnly: !browsed.data.editable };

  // ---- Editing ----
  // Unsaved edits belong to one file; switching files mounts a fresh editor.
  const docKey = doc ? `${fileKey(doc)}#${discardCount}` : "";
  const [dirtyDoc, setDirtyDoc] = useState<string | null>(null);
  const dirty = dirtyDoc === docKey;
  const [saveError, setSaveError] = useState<string | null>(null);
  const editorHandle = useRef<DiffEditorHandle>(null);
  const save = async (content: string, base: string) => {
    const result = await saveFile(doc!.repo, doc!.path, content, base);
    if (result.ok) {
      setSaveError(null);
      setVersion((v) => v + 1);
      return true;
    }
    setSaveError(result.conflict ? `${doc!.path} changed on disk since you opened it.` : result.error);
    return false;
  };
  const askAboutSelection = (selection: CodeSelection, question: string) =>
    send({
      type: "chat",
      text: question,
      via: "text",
      about: `selection:${selection.repo}/${selection.path}:${selection.startLine}-${selection.endLine}`,
      selection,
    });

  // ---- Review zones ----
  const zones: Zone[] = review
    ? findings
        .filter((f) => sameFile(f, doc) && (!fixShown || f === fixShown))
        .map((f) => ({
          key: `finding-${f.id}`,
          afterLine: f.line,
          node: <FindingBox finding={f} selected={f === finding} onSelect={() => setFindingId(f.id)} />,
        }))
    : [];

  // ---- Layout state ----
  const [tab, setTab] = useState<SideTab>(review ? "findings" : "task");
  const [showLayers, setShowLayers] = usePreference("showLayers");
  const [sideBySide, setSideBySide] = useState(false);
  const slide = state.plan?.slides.find((s) => s.id === taskFile?.planRef);
  const layers = state.plan?.layers?.length ? state.plan.layers : [...new Set(files.map((f) => f.layer).filter((l) => l !== undefined))];
  const canApprove = awaitingApproval && replay.done && state.claudeWaiting && !dirty;
  const approve = () =>
    taskFile &&
    send({ type: "file_approved", repo: taskFile.repo, path: taskFile.path }, { handoff: "Claude is moving to the next file…" });
  const [feedback, setFeedback] = useState("");
  const index = taskFile ? files.indexOf(taskFile) : -1;
  const findingIndex = finding ? findings.indexOf(finding) : -1;

  useHotkeys((e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      if (canApprove) approve();
    } else if (review && e.key === "[") setFindingId(findings[Math.max(0, findingIndex - 1)]?.id);
    else if (review && e.key === "]") setFindingId(findings[Math.min(findings.length - 1, findingIndex + 1)]?.id);
    else if (review) return false;
    else if (e.key === "ArrowRight") replay.forward(e.shiftKey);
    else if (e.key === "ArrowLeft") replay.back(e.shiftKey);
    else if (e.key.toLowerCase() === "p" && !e.metaKey && !e.ctrlKey) replay.toggle();
    else if (e.key === "Escape") replay.skip();
    else if (e.key === "[" && files[index - 1]) open(files[index - 1]);
    else if (e.key === "]" && files[index + 1]) open(files[index + 1]);
    else if (e.key.toLowerCase() === "l") setShowLayers(!showLayers);
    else return false;
  });

  const tabs: SideTab[] = review ? ["findings", "task", "repo"] : ["task", "repo"];
  const TAB_LABEL: Record<SideTab, string> = {
    findings: `Findings (${unresolved.length})`,
    task: `Task files (${files.length})`,
    repo: "Repository",
  };

  return (
    <div className="workspace">
      <nav className="side">
        <div className="side-tabs">
          {tabs.map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="side-body">
          {tab === "findings" && (
            <>
              <FindingsList findings={findings} selected={finding} onSelect={(f) => setFindingId(f.id)} />
              <label className="toggle">
                <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} /> Show dismissed
              </label>
            </>
          )}
          {tab === "task" && <TaskFiles files={files} current={doc} showLayers={showLayers} onOpen={open} />}
          {tab === "repo" && (
            <RepoBrowser
              selected={doc}
              version={version + files.reduce((n, f) => n + f.revision, 0)}
              onOpen={(r, path) => open({ repo: r, path })}
            />
          )}
        </div>
      </nav>

      <section className="editor">
        <div className="tabs">
          {doc && (
            <span className="tab on" title={`${doc.repo}/${doc.path}`}>
              {taskFile && <span className={`st ${taskFile.status}`}>{FILE_STATUS_ICON[taskFile.status]}</span>}
              {doc.repo}/{doc.path}
              {dirty && (
                <span className="dirty" title="Unsaved changes">
                  ●
                </span>
              )}
              {repo?.role === "context" && <em className="readonly-tag">context only</em>}
            </span>
          )}
          <span className="tabs-spacer" />
          {dirty && (
            <button className="primary sm save-btn" onClick={() => editorHandle.current?.save()} title="Save to disk (⌘S)">
              Save <kbd>⌘S</kbd>
            </button>
          )}
          {!review && (
            <button
              className={`layers-toggle ${replayCode ? "on" : ""}`}
              onClick={() => setReplayCode(!replayCode)}
              title="Type each file's change out line by line, or show the whole change at once"
            >
              Typing {replayCode ? "on" : "off"}
            </button>
          )}
          <button
            className={`layers-toggle ${sideBySide ? "on" : ""}`}
            onClick={() => setSideBySide(!sideBySide)}
            title="Inline or side-by-side diff"
          >
            {sideBySide ? "Side by side" : "Inline"}
          </button>
        </div>

        {!review && taskFile && (
          <div className="why">
            {slide && <span className="plan-ref">Plan · {slide.title}</span>}
            <span className="why-text">{taskFile.intent ?? taskFile.path}</span>
            {layers.length > 0 && (
              <button
                className={`layers-toggle ${showLayers ? "on" : ""}`}
                onClick={() => setShowLayers(!showLayers)}
                title="Show architecture layers (L)"
              >
                ☰ Layers <kbd>L</kbd>
              </button>
            )}
          </div>
        )}
        {!review && taskFile && showLayers && layers.length > 0 && <LayerStrip layers={layers} files={files} current={taskFile} />}
        {fixShown && <FixBanner finding={fixShown} />}
        {review && unresolved.length === 0 && <div className="clear-banner">✓ Review clear. Claude is preparing the commit history…</div>}
        {saveError && (
          <div className="save-error">
            {saveError}
            <button className="ghost sm" onClick={() => (setSaveError(null), setDiscardCount((n) => n + 1), setVersion((v) => v + 1))}>
              Discard my edits and reload
            </button>
          </div>
        )}

        <div className="code-scroll editor-area">
          {!doc ? (
            <div className="writing">Claude is choosing the first file…</div>
          ) : taskFile?.status === "writing" && !hasTaskDiff ? (
            <div className="writing">
              <span className="spinner" /> Claude is writing <code>{doc.path}</code>
            </div>
          ) : browsed.data?.binary ? (
            <div className="writing">This file is binary or too large to open here.</div>
          ) : browsed.error ? (
            <div className="writing err">{browsed.error}</div>
          ) : view ? (
            <DiffEditor
              key={docKey}
              handle={editorHandle}
              repo={doc.repo}
              path={doc.path}
              original={view.original}
              modified={view.modified}
              readOnly={view.readOnly}
              sideBySide={sideBySide}
              zones={zones}
              revealLine={typed?.cursorLine ?? (review ? finding?.line : undefined)}
              onDirtyChange={(isDirty) => setDirtyDoc(isDirty ? docKey : null)}
              onSave={save}
              onAsk={askAboutSelection}
            />
          ) : (
            <div className="writing">
              <span className="spinner" /> Opening <code>{doc.path}</code>
            </div>
          )}
        </div>

        {replaying && replay.total > 0 && <ReplayBar replay={replay} />}

        {!review && taskFile && hasTaskDiff && (
          <footer className="file-foot">
            <button className="ghost" disabled={index <= 0} onClick={() => open(files[index - 1])} title="Previous file ([)">
              ‹ <kbd>[</kbd>
            </button>
            <button className="ghost" disabled={index >= files.length - 1} onClick={() => open(files[index + 1])} title="Next file (])">
              <kbd>]</kbd> ›
            </button>
            <input
              value={feedback}
              placeholder={taskFile.status === "approved" ? "Reopen with a change…" : "Request a change to this file…"}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && feedback.trim()) {
                  send(
                    { type: "file_feedback", repo: taskFile.repo, path: taskFile.path, text: feedback.trim() },
                    { handoff: "Claude is reworking the file…" },
                  );
                  setFeedback("");
                }
                if (e.key === "Escape") (e.target as HTMLElement).blur();
              }}
            />
            {taskFile.status === "approved" ? (
              <span className="ok-badge">✓ Approved</span>
            ) : (
              <button
                className="primary"
                disabled={!canApprove}
                onClick={approve}
                title={dirty ? "Save your edits first (⌘S)" : replay.done ? "" : "Finish or skip the replay first"}
              >
                Approve file <kbd>⌘⏎</kbd>
              </button>
            )}
          </footer>
        )}
        {review && finding && (
          <footer className="file-foot review-foot">
            <span className="muted">
              {findingLabel(finding)} of {findings.length} · <kbd>[</kbd> <kbd>]</kbd> to move · select code to ask about it
            </span>
          </footer>
        )}
      </section>
    </div>
  );
}
