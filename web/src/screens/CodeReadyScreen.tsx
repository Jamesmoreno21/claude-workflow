import { useApp } from "../app/AppContext";
import { Markdown } from "../components/Markdown";

/** Summary of what was built, and the button that starts the pre-review. */
export function CodeReadyScreen() {
  const { state, send } = useApp();
  const summary = state.summary!;
  return (
    <div className="code-ready">
      <section className="summary">
        <span className="eyebrow">Code ready</span>
        <h2>What was built</h2>
        <Markdown text={summary.markdown} />
      </section>
      <section className="launch">
        <h3>Changes</h3>
        {summary.stats.map((repo) => (
          <div key={repo.repo} className="stat-row">
            <span className="repo-tag">{repo.repo}</span>
            <span>{repo.files} files</span>
            <span className="add">+{repo.added}</span>
            <span className="del">−{repo.removed}</span>
          </div>
        ))}
        <div className="review-box">
          <h3>Pre-review</h3>
          <p>
            Independent reviewer agents check every changed file for bugs, security issues, missing constraints and style-guide violations.
          </p>
          {state.claudeWaiting ? (
            <button
              className="primary big"
              onClick={() => send({ type: "start_review" }, { handoff: "Reviewer agents are reading the changes…" })}
            >
              Start pre-review
            </button>
          ) : (
            <div className="fb-fixing">
              <span className="spinner" /> {state.status.message}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
