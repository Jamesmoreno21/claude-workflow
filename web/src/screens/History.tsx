import { useState } from "react";
import type { ProposedPR } from "../../../shared/protocol";
import { Markdown } from "../components/Markdown";
import { useApp } from "../connection";

const prLines = (p: ProposedPR) => p.commits.reduce((n, c) => n + c.added + c.removed, 0);
const prSize = (n: number) => (n > 1500 ? "bad" : n > 1000 ? "warn" : "ok");
const commitSize = (n: number) => (n > 400 ? "bad" : n > 300 ? "warn" : "ok");

export function History() {
  const { state, send, setFocus } = useApp();
  const h = state.history!;
  const [reviewers, setReviewers] = useState<string[]>(h.reviewers);
  const [input, setInput] = useState("");
  const repos = [...new Set(h.prs.map((p) => p.repo))];

  const addReviewer = (login: string) => {
    const l = login.trim().replace(/^@/, "");
    if (!l || reviewers.includes(l)) return;
    const next = [...reviewers, l];
    setReviewers(next);
    send({ type: "history_changed", reviewers: next });
    setInput("");
  };
  const removeReviewer = (l: string) => {
    const next = reviewers.filter((x) => x !== l);
    setReviewers(next);
    send({ type: "history_changed", reviewers: next });
  };
  const suggestions = state.memory.reviewers.filter((r) => !reviewers.includes(r) && r.includes(input.replace(/^@/, "")));

  return (
    <div className="history">
      <div className="history-cols">
        {repos.map((repo) => (
          <section key={repo} className="history-col">
            <h3 className="repo-tag">{repo}</h3>
            {h.prs
              .filter((p) => p.repo === repo)
              .map((p) => (
                <PRCard
                  key={p.id}
                  pr={p}
                  parent={h.prs.find((x) => x.id === p.dependsOn)?.title}
                  onFocus={() => setFocus({ about: `pr:${p.id}`, label: p.title })}
                  onSave={(next) => send({ type: "history_edited", prs: h.prs.map((x) => (x.id === next.id ? next : x)) })}
                />
              ))}
          </section>
        ))}
      </div>

      <footer className="publish-bar">
        <div className="people">
          {h.assignee && (
            <span className="person">
              Assignee <b>@{h.assignee}</b>
            </span>
          )}
          <span className="muted">Reviewers</span>
          {reviewers.map((r) => (
            <span key={r} className="chip">
              @{r} <button onClick={() => removeReviewer(r)}>✕</button>
            </span>
          ))}
          <div className="reviewer-input">
            <input
              value={input}
              placeholder="add reviewer…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addReviewer(input)}
            />
            {input && suggestions.length > 0 && (
              <div className="suggest">
                {suggestions.slice(0, 5).map((s) => (
                  <button key={s} onClick={() => addReviewer(s)}>
                    @{s}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!input &&
            suggestions.slice(0, 3).map((s) => (
              <button key={s} className="chip ghost-chip" onClick={() => addReviewer(s)}>
                + @{s}
              </button>
            ))}
        </div>
        <button className="primary big" disabled={!state.claudeWaiting} onClick={() => send({ type: "publish", reviewers, prs: h.prs })}>
          Publish {h.prs.length} PR{h.prs.length > 1 ? "s" : ""} to GitHub
        </button>
      </footer>
    </div>
  );
}

function PRCard({ pr, parent, onFocus, onSave }: { pr: ProposedPR; parent?: string; onFocus(): void; onSave(pr: ProposedPR): void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(pr);
  const [showBody, setShowBody] = useState(false);
  const [preview, setPreview] = useState(false);
  const lines = prLines(pr);

  const start = () => {
    setDraft(structuredClone(pr));
    setPreview(false);
    setEditing(true);
  };
  const save = () => {
    onSave(draft);
    setEditing(false);
  };
  const setCommit = (i: number, message: string) =>
    setDraft({ ...draft, commits: draft.commits.map((c, j) => (j === i ? { ...c, message } : c)) });

  if (editing)
    return (
      <article className="pr-card editing">
        <label className="edit-field">
          <span>Title</span>
          <input autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </label>
        <label className="edit-field">
          <span>Branch</span>
          <input className="mono" value={draft.branch} onChange={(e) => setDraft({ ...draft, branch: e.target.value })} />
        </label>
        <div className="edit-field">
          <span>Commits</span>
          {draft.commits.map((c, i) => (
            <div key={i} className="commit-edit">
              <input className="mono" value={c.message} onChange={(e) => setCommit(i, e.target.value)} />
              <span className="c-size">
                <span className="add">+{c.added}</span> <span className="del">−{c.removed}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="edit-field">
          <span>
            Description
            <span className="seg body-mode">
              <button className={!preview ? "on" : ""} onClick={() => setPreview(false)}>
                Write
              </button>
              <button className={preview ? "on" : ""} onClick={() => setPreview(true)}>
                Preview
              </button>
            </span>
          </span>
          {preview ? (
            <Markdown className="pr-body" text={draft.body} />
          ) : (
            <textarea rows={10} className="mono" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          )}
        </div>
        <div className="edit-actions">
          <button className="ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button className="primary" onClick={save}>
            Save
          </button>
        </div>
      </article>
    );

  return (
    <article className="pr-card" onClick={onFocus}>
      <div className="pr-head">
        <b>{pr.title}</b>
        <span className={`size ${prSize(lines)}`}>{lines} lines</span>
        <button
          className="icon pencil"
          title="Edit title, branch, commits and description"
          onClick={(e) => {
            e.stopPropagation();
            start();
          }}
        >
          ✎
        </button>
      </div>
      <code className="branch">
        {pr.branch} → {pr.base}
        {parent && <span className="muted"> · stacked on {parent}</span>}
      </code>
      <ol className="commits">
        {pr.commits.map((c, i) => (
          <li key={i}>
            <span className="c-dot" />
            <span className="c-msg">{c.message}</span>
            <span className={`c-size ${commitSize(c.added + c.removed)}`}>
              <span className="add">+{c.added}</span> <span className="del">−{c.removed}</span>
            </span>
            <small className="c-files">{c.files.join(", ")}</small>
          </li>
        ))}
      </ol>
      <button
        className="link"
        onClick={(e) => {
          e.stopPropagation();
          setShowBody(!showBody);
        }}
      >
        {showBody ? "Hide description" : "PR description"}
      </button>
      {showBody && <Markdown className="pr-body" text={pr.body} />}
    </article>
  );
}
