import mermaid from "mermaid";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useHotkeys } from "../hooks/useHotkeys";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "dark",
  themeVariables: { background: "transparent", fontFamily: "inherit", fontSize: "15px" },
});

const ZOOM_STEPS = [1, 1.5, 2, 3];

/** Full-screen view of a diagram: fits the screen, zooms with − / +, closes with Esc or a click outside. */
function DiagramLightbox({ svg, onClose }: { svg: string; onClose(): void }) {
  const [zoomStep, setZoomStep] = useState(0);
  const zoom = ZOOM_STEPS[zoomStep];
  useHotkeys((e) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "+" || e.key === "=") setZoomStep((s) => Math.min(ZOOM_STEPS.length - 1, s + 1));
    else if (e.key === "-") setZoomStep((s) => Math.max(0, s - 1));
    else return false;
  });

  return createPortal(
    <div className="lightbox" onClick={onClose} role="dialog" aria-label="Diagram">
      <div className="lightbox-tools" onClick={(e) => e.stopPropagation()}>
        <button className="ghost sm" disabled={zoomStep === 0} onClick={() => setZoomStep(zoomStep - 1)} title="Zoom out (−)">
          −
        </button>
        <span className="muted">{zoom === 1 ? "Fit" : `${zoom * 100}%`}</span>
        <button
          className="ghost sm"
          disabled={zoomStep === ZOOM_STEPS.length - 1}
          onClick={() => setZoomStep(zoomStep + 1)}
          title="Zoom in (+)"
        >
          +
        </button>
        <button className="ghost sm" onClick={onClose} title="Close (Esc)">
          ✕
        </button>
      </div>
      <div className="lightbox-body" onClick={(e) => e.stopPropagation()}>
        <div
          className={`lightbox-diagram ${zoom === 1 ? "fit" : ""}`}
          style={zoom === 1 ? undefined : { width: `${zoom * 100}%` }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>,
    document.body,
  );
}

/** Renders mermaid source (or shows the source if it doesn't parse); click to view it large. */
export function Diagram({ source }: { source: string }) {
  const id = "m" + useId().replace(/[^a-z0-9]/gi, "");
  const [rendered, setRendered] = useState<{ source: string; svg: string | null } | null>(null);
  const [enlarged, setEnlarged] = useState(false);

  useEffect(() => {
    let current = true;
    mermaid
      .render(id, source)
      .then(({ svg }) => current && setRendered({ source, svg }))
      .catch(() => current && setRendered({ source, svg: null }));
    return () => {
      current = false;
    };
  }, [id, source]);

  const svg = rendered?.source === source ? rendered.svg : undefined;
  if (svg === null) return <pre className="diagram">{source}</pre>;
  return (
    <>
      <button className="diagram" onClick={() => svg && setEnlarged(true)} title="Click to enlarge">
        {svg ? <span dangerouslySetInnerHTML={{ __html: svg }} /> : <span className="spinner" />}
        {svg && <span className="diagram-hint">⤢ Enlarge</span>}
      </button>
      {enlarged && svg && <DiagramLightbox svg={svg} onClose={() => setEnlarged(false)} />}
    </>
  );
}
