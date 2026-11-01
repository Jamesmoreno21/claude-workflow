import { useApp } from "../connection";

export function Published() {
  const { state } = useApp();
  return (
    <div className="published">
      <div className="rocket">🚀</div>
      <h2>Shipped for review</h2>
      <p className="muted">Assigned to you, with reviewers requested.</p>
      <div className="links">
        {state.published.map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="pr-link">
            <span className="repo-tag">{l.repo}</span>
            <b>{l.title}</b>
            <span className="muted">↗</span>
          </a>
        ))}
      </div>
    </div>
  );
}
