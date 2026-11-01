import { useApp } from "../connection";

const TITLES = {
  research: "Understanding the task",
  planning: "Building the plan",
  publishing: "Publishing to GitHub",
} as Record<string, string>;

export function Loading() {
  const { state } = useApp();
  const log = state.status.log.slice(-5, -1);
  return (
    <div className="loading">
      <div className="orb" />
      <h2>{TITLES[state.phase] ?? "Working"}</h2>
      <p className="status">{state.status.message}</p>
      <ul className="log">
        {log.map((l, i) => (
          <li key={i} style={{ opacity: 0.25 + (i / log.length) * 0.4 }}>
            ✓ {l}
          </li>
        ))}
      </ul>
    </div>
  );
}
