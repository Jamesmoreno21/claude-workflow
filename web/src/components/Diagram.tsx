import mermaid from "mermaid";
import { useEffect, useId, useRef } from "react";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "dark",
  themeVariables: { background: "transparent", fontFamily: "inherit", fontSize: "15px" },
});

/** Renders mermaid source; shows the source itself if it doesn't parse. */
export function Diagram({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = "m" + useId().replace(/[^a-z0-9]/gi, "");
  useEffect(() => {
    let current = true;
    mermaid
      .render(id, source)
      .then(({ svg }) => current && ref.current && (ref.current.innerHTML = svg))
      .catch(() => current && ref.current && (ref.current.textContent = source));
    return () => {
      current = false;
    };
  }, [id, source]);
  return <div className="diagram" ref={ref} />;
}
