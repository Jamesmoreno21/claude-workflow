import { useApp } from "../app/AppContext";
import { LOADING_TITLES, PUBLISHING_TITLES } from "../constants/phases";
import { LOADING_LOG_LINES } from "../constants/ui";

/** Shown while Claude researches, plans or publishes. */
export function LoadingScreen() {
  const { state } = useApp();
  const earlierSteps = state.status.log.slice(-(LOADING_LOG_LINES + 1), -1);
  return (
    <div className="loading">
      <div className="orb" />
      <h2>{state.phase === "publishing" ? PUBLISHING_TITLES[state.publishMode ?? "local"] : (LOADING_TITLES[state.phase] ?? "Working")}</h2>
      <p className="status">{state.status.message}</p>
      <ul className="log">
        {earlierSteps.map((step, i) => (
          <li key={i} style={{ opacity: 0.25 + (i / earlierSteps.length) * 0.4 }}>
            ✓ {step}
          </li>
        ))}
      </ul>
    </div>
  );
}
