import { useApp } from "../app/AppContext";

const TITLES = { local: "Committed locally", push: "Branches pushed", pr: "Shipped for review" };
const SUBTITLES = {
  local: "Nothing was pushed; the branches are ready on your machine.",
  push: "The branches are on GitHub, without pull requests.",
  pr: "Assigned to you, with reviewers requested.",
};

/** The end of the run: what the commit step produced, or that the workflow was ended. */
export function PublishedScreen() {
  const { state } = useApp();
  const outcome = state.outcome;

  if (!outcome)
    return (
      <div className="published">
        <div className="rocket">⏹</div>
        <h2>Workflow ended</h2>
        <p className="muted">Claude is back in the terminal. Start again with /workflow:start.</p>
      </div>
    );

  return (
    <div className="published">
      <div className="rocket">{outcome.mode === "local" ? "✅" : "🚀"}</div>
      <h2>{TITLES[outcome.mode]}</h2>
      <p className="muted">{SUBTITLES[outcome.mode]}</p>
      <div className="links">
        {outcome.links.map((link) => (
          <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="pr-link">
            <span className="repo-tag">{link.repo}</span>
            <b>{link.title}</b>
            <span className="muted">↗</span>
          </a>
        ))}
        {outcome.mode !== "pr" &&
          outcome.branches.map((b) => (
            <div key={b.repo + b.branch} className="pr-link">
              <span className="repo-tag">{b.repo}</span>
              <code>{b.branch}</code>
              <span className="muted">
                {b.commits} commit{b.commits === 1 ? "" : "s"}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
