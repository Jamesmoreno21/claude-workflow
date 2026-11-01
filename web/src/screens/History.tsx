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
  const [openBody, setOpenBody] = useState<string | null>(null);
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
              .map((p) => {
                const lines = prLines(p);
                return (
                  <article key={p.id} className="pr-card" onClick={() => setFocus({ about: `pr:${p.id}`, label: p.title })}>
                    <div className="pr-head">
                      <b>{p.title}</b>
                      <span className={`size ${prSize(lines)}`}>{lines} lines</span>
                    </div>
                    <code className="branch">
                      {p.branch} → {p.base}
                      {p.dependsOn && <span className="muted"> · stacked on {h.prs.find((x) => x.id === p.dependsOn)?.title ?? p.dependsOn}</span>}
                    </code>
                    <ol className="commits">
                      {p.commits.map((c, i) => (
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
                        setOpenBody(openBody === p.id ? null : p.id);
                      }}
                    >
                      {openBody === p.id ? "Hide description" : "PR description"}
                    </button>
                    {openBody === p.id && <Markdown className="pr-body" text={p.body} />}
                  </article>
                );
              })}
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
        <button className="primary big" disabled={!state.claudeWaiting} onClick={() => send({ type: "publish", reviewers })}>
          Publish {h.prs.length} PR{h.prs.length > 1 ? "s" : ""} to GitHub
        </button>
      </footer>
    </div>
  );
}
