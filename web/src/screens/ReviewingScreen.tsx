import type { Reviewer } from "../../../shared/protocol";
import { useApp } from "../app/AppContext";

const STATUS_LABEL: Record<Reviewer["status"], string> = { queued: "Queued", running: "Reviewing…", done: "Done", failed: "Failed" };

/** The pre-review while it runs: one card per reviewer agent, with what it checks and its progress. */
export function ReviewingScreen() {
  const { state } = useApp();
  const reviewers = state.reviewers;
  const done = reviewers.filter((r) => r.status === "done" || r.status === "failed").length;
  const findings = reviewers.reduce((sum, r) => sum + (r.findings ?? 0), 0);

  return (
    <div className="reviewing">
      <div className="orb" />
      <h2>{reviewers.length ? `Reviewers at work: ${done} of ${reviewers.length} done` : "Starting the reviewers…"}</h2>
      <p className="muted">
        {done === reviewers.length && reviewers.length
          ? `${findings} finding${findings === 1 ? "" : "s"} raised. Claude is merging them…`
          : "Each agent reads every changed file in the task's repositories."}
      </p>
      <div className="reviewer-cards">
        {reviewers.map((r) => (
          <article key={r.id} className={`reviewer-card ${r.status}`}>
            <div className="reviewer-head">
              <b>{r.name}</b>
              <span className={`reviewer-status ${r.status}`}>
                {r.status === "running" && <span className="spinner" />}
                {STATUS_LABEL[r.status]}
              </span>
            </div>
            <p>{r.focus}</p>
            {r.scope && <code className="reviewer-scope">{r.scope}</code>}
            {r.status === "done" && r.findings !== undefined && (
              <span className="reviewer-findings">
                {r.findings === 0 ? "No findings" : `${r.findings} finding${r.findings === 1 ? "" : "s"}`}
              </span>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
