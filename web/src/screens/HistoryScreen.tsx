import { useState } from "react";
import { PUBLISH_MODES, type ProposedPR } from "../../../shared/protocol";
import { useApp } from "../app/AppContext";
import { Markdown } from "../components/Markdown";
import { usePreference } from "../config/settings";
import { FINISH_MODE } from "../constants/labels";
import { PUBLISHING_TITLES } from "../constants/phases";
import { REVIEWER_SUGGESTIONS } from "../constants/ui";
import { commitSizeClass, prLines, prSizeClass } from "../lib/size";

function CommitSize({ added, removed }: { added: number; removed: number }) {
  return (
    <span className={`c-size ${commitSizeClass(added + removed)}`}>
      <span className="add">+{added}</span> <span className="del">−{removed}</span>
    </span>
  );
}

/** Inline editor for a PR's title, branch, commit messages and description. */
function PREditor({ pr, onSave, onCancel }: { pr: ProposedPR; onSave(pr: ProposedPR): void; onCancel(): void }) {
  const [draft, setDraft] = useState(() => structuredClone(pr));
  const [preview, setPreview] = useState(false);
  const setCommitMessage = (index: number, message: string) =>
    setDraft({ ...draft, commits: draft.commits.map((c, i) => (i === index ? { ...c, message } : c)) });

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
        {draft.commits.map((commit, i) => (
          <div key={i} className="commit-edit">
            <input className="mono" value={commit.message} onChange={(e) => setCommitMessage(i, e.target.value)} />
            <CommitSize added={commit.added} removed={commit.removed} />
          </div>
        ))}
      </div>
      <div className="edit-field">
        <span>
          Description
          <span className="seg body-mode">
            <button className={preview ? "" : "on"} onClick={() => setPreview(false)}>
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
        <button className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary" onClick={() => onSave(draft)}>
          Save
        </button>
      </div>
    </article>
  );
}

function PRCard({ pr, stackedOn, onFocus, onSave }: { pr: ProposedPR; stackedOn?: string; onFocus(): void; onSave(pr: ProposedPR): void }) {
  const [editing, setEditing] = useState(false);
  const [showBody, setShowBody] = useState(false);
  const lines = prLines(pr);

  if (editing)
    return (
      <PREditor
        pr={pr}
        onCancel={() => setEditing(false)}
        onSave={(next) => {
          onSave(next);
          setEditing(false);
        }}
      />
    );

  return (
    <article className="pr-card" onClick={onFocus}>
      <div className="pr-head">
        <b>{pr.title}</b>
        <span className={`size ${prSizeClass(lines)}`}>{lines} lines</span>
        <button
          className="icon pencil"
          title="Edit title, branch, commits and description"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          ✎
        </button>
      </div>
      <code className="branch">
        {pr.branch} → {pr.base}
        {stackedOn && <span className="muted"> · stacked on {stackedOn}</span>}
      </code>
      <ol className="commits">
        {pr.commits.map((commit, i) => (
          <li key={i}>
            <span className="c-dot" />
            <span className="c-msg">{commit.message}</span>
            <CommitSize added={commit.added} removed={commit.removed} />
            <small className="c-files">{commit.files.join(", ")}</small>
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

function ReviewerPicker({ reviewers, onChange }: { reviewers: string[]; onChange(reviewers: string[]): void }) {
  const { state } = useApp();
  const [input, setInput] = useState("");
  const query = input.replace(/^@/, "");
  const suggestions = state.memory.reviewers.filter((r) => !reviewers.includes(r) && r.includes(query));

  const add = (login: string) => {
    const name = login.trim().replace(/^@/, "");
    if (name && !reviewers.includes(name)) onChange([...reviewers, name]);
    setInput("");
  };

  return (
    <>
      <span className="muted">Reviewers</span>
      {reviewers.map((r) => (
        <span key={r} className="chip">
          @{r} <button onClick={() => onChange(reviewers.filter((x) => x !== r))}>✕</button>
        </span>
      ))}
      <div className="reviewer-input">
        <input
          value={input}
          placeholder="add reviewer…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add(input)}
        />
        {input && suggestions.length > 0 && (
          <div className="suggest">
            {suggestions.slice(0, REVIEWER_SUGGESTIONS.whileTyping).map((s) => (
              <button key={s} onClick={() => add(s)}>
                @{s}
              </button>
            ))}
          </div>
        )}
      </div>
      {!input &&
        suggestions.slice(0, REVIEWER_SUGGESTIONS.idle).map((s) => (
          <button key={s} className="chip ghost-chip" onClick={() => add(s)}>
            + @{s}
          </button>
        ))}
    </>
  );
}

/** Proposed PRs and commits per repo: editable, then committed, pushed, or opened as PRs. */
export function HistoryScreen() {
  const { state, send, setFocus } = useApp();
  const history = state.history!;
  const [reviewers, setReviewers] = useState(history.reviewers);
  const [finishMode, setFinishMode] = usePreference("finishMode");
  const repos = [...new Set(history.prs.map((pr) => pr.repo))];

  const changeReviewers = (next: string[]) => {
    setReviewers(next);
    send({ type: "history_changed", reviewers: next });
  };
  const savePR = (edited: ProposedPR) =>
    send({ type: "history_edited", prs: history.prs.map((pr) => (pr.id === edited.id ? edited : pr)) });

  return (
    <div className="history">
      <div className="history-cols">
        {repos.map((repo) => (
          <section key={repo} className="history-col">
            <h3 className="repo-tag">{repo}</h3>
            {history.prs
              .filter((pr) => pr.repo === repo)
              .map((pr) => (
                <PRCard
                  key={pr.id}
                  pr={pr}
                  stackedOn={history.prs.find((p) => p.id === pr.dependsOn)?.title}
                  onFocus={() => setFocus({ about: `pr:${pr.id}`, label: pr.title })}
                  onSave={savePR}
                />
              ))}
          </section>
        ))}
      </div>

      <footer className="publish-bar">
        <div className="finish-modes" role="radiogroup" aria-label="How to finish">
          {PUBLISH_MODES.map((mode) => (
            <button
              key={mode}
              role="radio"
              aria-checked={finishMode === mode}
              className={finishMode === mode ? "on" : ""}
              title={FINISH_MODE[mode].hint}
              onClick={() => setFinishMode(mode)}
            >
              {FINISH_MODE[mode].label}
            </button>
          ))}
        </div>
        {finishMode === "pr" && (
          <div className="people">
            {history.assignee && (
              <span className="person">
                Assignee <b>@{history.assignee}</b>
              </span>
            )}
            <ReviewerPicker reviewers={reviewers} onChange={changeReviewers} />
          </div>
        )}
        <button
          className="primary big"
          disabled={!state.claudeWaiting}
          onClick={() =>
            send({ type: "publish", mode: finishMode, reviewers, prs: history.prs }, { handoff: `${PUBLISHING_TITLES[finishMode]}…` })
          }
        >
          {FINISH_MODE[finishMode].action(history.prs.length)}
        </button>
      </footer>
    </div>
  );
}
