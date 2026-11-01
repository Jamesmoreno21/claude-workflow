import { useEffect, useRef, useState } from "react";
import type { Slide } from "../../../shared/protocol";
import { Diagram, Markdown } from "../components/Markdown";
import { useApp } from "../connection";
import { speak, stopSpeaking } from "../voice";

const KIND: Record<Slide["kind"], string> = {
  overview: "Overview",
  feature: "Product",
  edge_cases: "Edge cases",
  implementation: "Implementation",
  tests: "Tests",
  prs: "Pull requests",
};

const sizeClass = (lines: number) => (lines > 1500 ? "bad" : lines > 1000 ? "warn" : "ok");

/** Narrated slides. Holding Space pauses narration so you can interrupt. */
export function PlanScreen() {
  const { state, send, setFocus } = useApp();
  const plan = state.plan!;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const previous = useRef<Slide[]>(plan.slides);
  const slide = plan.slides[Math.min(index, plan.slides.length - 1)];

  // Flag slides Claude rewrote after a question.
  useEffect(() => {
    const before = new Map(previous.current.map((s) => [s.id, JSON.stringify(s)]));
    const diff = plan.slides.filter((s) => before.get(s.id) !== JSON.stringify(s)).map((s) => s.id);
    if (diff.length && previous.current !== plan.slides) setChanged(new Set(diff));
    previous.current = plan.slides;
  }, [plan.slides]);

  useEffect(() => setFocus({ about: `slide:${slide.id}`, label: `slide ${index + 1}` }), [slide.id]);

  useEffect(() => {
    const pause = () => setPlaying(false);
    window.addEventListener("wf:ptt-start", pause);
    return () => window.removeEventListener("wf:ptt-start", pause);
  }, []);

  useEffect(() => {
    if (!playing) return stopSpeaking();
    let cancelled = false;
    speak(slide.narration).then(() => {
      if (cancelled) return;
      if (index < plan.slides.length - 1) setTimeout(() => !cancelled && setIndex((i) => i + 1), 700);
      else setPlaying(false);
    });
    return () => {
      cancelled = true;
    };
  }, [playing, slide.id, slide.narration]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, plan.slides.length - 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
      else if (e.key.toLowerCase() === "p") setPlaying((p) => !p);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plan.slides.length]);

  const totalLines = plan.prs.reduce((n, p) => n + p.estimatedLines, 0);

  return (
    <div className="plan">
      <section className="slide" key={slide.id}>
        <div className="slide-kind">
          {KIND[slide.kind]}
          {changed.has(slide.id) && <em className="updated">Updated</em>}
        </div>
        <h2>{slide.title}</h2>
        <div className={`slide-grid ${slide.diagram ? "two" : ""}`}>
          <div>
            <Markdown text={slide.body} />
            {slide.files?.length ? (
              <div className="slide-files">
                <h4>Files</h4>
                {slide.files.map((f) => (
                  <div key={f.repo + f.path} className="file-ref">
                    <code>
                      {f.repo}/{f.path}
                    </code>
                    {f.note && <span>{f.note}</span>}
                  </div>
                ))}
              </div>
            ) : null}
            {slide.tests?.length ? (
              <div className="slide-files">
                <h4>Tests</h4>
                <ul className="tests">
                  {slide.tests.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {slide.kind === "prs" && (
              <div className="pr-plan">
                {plan.prs.map((p, i) => (
                  <div key={i} className="pr-plan-row">
                    <span className="repo-tag">{p.repo}</span>
                    <div>
                      <b>{p.title}</b>
                      <small>{p.scope}</small>
                    </div>
                    <span className={`size ${sizeClass(p.estimatedLines)}`}>~{p.estimatedLines} lines</span>
                  </div>
                ))}
                <small className="muted">
                  {plan.prs.length} PRs · ~{totalLines} lines total
                </small>
              </div>
            )}
          </div>
          {slide.diagram && <Diagram source={slide.diagram} />}
        </div>
        <p className="narration">{slide.narration}</p>
      </section>

      <footer className="plan-foot">
        <div className="controls">
          <button className="ghost" onClick={() => setIndex(Math.max(index - 1, 0))}>
            ←
          </button>
          <button className="play" onClick={() => setPlaying(!playing)}>
            {playing ? "❚❚ Pause" : "▶ Narrate"} <kbd>P</kbd>
          </button>
          <button className="ghost" onClick={() => setIndex(Math.min(index + 1, plan.slides.length - 1))}>
            →
          </button>
        </div>
        <div className="thumbs">
          {plan.slides.map((s, i) => (
            <button key={s.id} className={`${i === index ? "on" : ""} ${changed.has(s.id) ? "changed" : ""}`} onClick={() => setIndex(i)}>
              <small>{i + 1}</small>
              {s.title}
            </button>
          ))}
        </div>
        <button className="primary" disabled={!state.claudeWaiting} onClick={() => send({ type: "plan_approved" })}>
          Approve plan, start coding
        </button>
      </footer>
    </div>
  );
}
