import { Markdown } from "../components/Markdown";
import { useApp } from "../connection";

export function CodeReady() {
  const { state, send } = useApp();
  const s = state.summary!;
  return (
    <div className="code-ready">
      <section className="summary">
        <span className="eyebrow">Code ready</span>
        <h2>What was built</h2>
        <Markdown text={s.markdown} />
      </section>
      <section className="launch">
        <h3>Changes</h3>
        {s.stats.map((r) => (
          <div key={r.repo} className="stat-row">
            <span className="repo-tag">{r.repo}</span>
            <span>{r.files} files</span>
            <span className="add">+{r.added}</span>
            <span className="del">−{r.removed}</span>
          </div>
        ))}
        <div className="review-box">
          <h3>Pre-review</h3>
          <p>Independent reviewer agents check every changed file for bugs, security issues, missing constraints and style-guide violations.</p>
          {state.claudeWaiting ? (
            <button className="primary big" onClick={() => send({ type: "start_review" })}>
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
