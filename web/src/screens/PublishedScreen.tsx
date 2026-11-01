import { useApp } from "../app/AppContext";

export function PublishedScreen() {
  const { state } = useApp();
  return (
    <div className="published">
      <div className="rocket">🚀</div>
      <h2>Shipped for review</h2>
      <p className="muted">Assigned to you, with reviewers requested.</p>
      <div className="links">
        {state.published.map((link) => (
          <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="pr-link">
            <span className="repo-tag">{link.repo}</span>
            <b>{link.title}</b>
            <span className="muted">↗</span>
          </a>
        ))}
      </div>
    </div>
  );
}
