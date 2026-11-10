import { useEffect, useState } from "react";
import type { Slide } from "../../../shared/protocol";
import { useApp, useFocus } from "../app/AppContext";
import { Diagram } from "../components/Diagram";
import { Markdown } from "../components/Markdown";
import { SLIDE_KIND_LABEL } from "../constants/labels";
import { SLIDE_ADVANCE_MS } from "../constants/ui";
import { useHotkeys } from "../hooks/useHotkeys";
import { prSizeClass } from "../lib/size";
import { onTalkStart } from "../services/speech-recognition";
import { prefetchNarration, speak, stopSpeaking } from "../services/tts";

/** Ids of slides whose content differs from the previous version of the plan. */
function changedSlideIds(before: Slide[], after: Slide[]) {
  const previous = new Map(before.map((s) => [s.id, JSON.stringify(s)]));
  return new Set(after.filter((s) => previous.get(s.id) !== JSON.stringify(s)).map((s) => s.id));
}

function SlideBody({ slide }: { slide: Slide }) {
  const { state } = useApp();
  const prs = state.plan!.prs;
  const totalLines = prs.reduce((sum, pr) => sum + pr.estimatedLines, 0);
  return (
    <div>
      <Markdown text={slide.body} />
      {slide.files?.length ? (
        <div className="slide-files">
          <h4>Files</h4>
          {slide.files.map((file) => (
            <div key={file.repo + file.path} className="file-ref">
              <code>
                {file.repo}/{file.path}
              </code>
              {file.note && <span>{file.note}</span>}
            </div>
          ))}
        </div>
      ) : null}
      {slide.tests?.length ? (
        <div className="slide-files">
          <h4>Tests</h4>
          <ul className="tests">
            {slide.tests.map((test) => (
              <li key={test}>{test}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {slide.kind === "prs" && (
        <div className="pr-plan">
          {prs.map((pr, i) => (
            <div key={i} className="pr-plan-row">
              <span className="repo-tag">{pr.repo}</span>
              <div>
                <b>{pr.title}</b>
                <small>{pr.scope}</small>
              </div>
              <span className={`size ${prSizeClass(pr.estimatedLines)}`}>~{pr.estimatedLines} lines</span>
            </div>
          ))}
          <small className="muted">
            {prs.length} PRs · ~{totalLines} lines total
          </small>
        </div>
      )}
    </div>
  );
}

/** Narrated slides. Talking (Space or ⌘P) pauses narration so you can interrupt. */
export function PlanScreen() {
  const { state, send } = useApp();
  const slides = state.plan!.slides;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shownSlides, setShownSlides] = useState(slides);
  const [changed, setChanged] = useState<Set<string>>(new Set());

  // Flag slides Claude rewrote after a question.
  if (slides !== shownSlides) {
    setChanged(changedSlideIds(shownSlides, slides));
    setShownSlides(slides);
  }

  const slide = slides[Math.min(index, slides.length - 1)];
  const goTo = (i: number) => setIndex(Math.max(0, Math.min(i, slides.length - 1)));
  useFocus(`slide:${slide.id}`, `slide ${index + 1}`);

  useEffect(() => onTalkStart(() => setPlaying(false)), []);

  useEffect(() => {
    if (!playing) return stopSpeaking();
    let current = true;
    const speaking = speak(slide.narration);
    // Generate the next slide's audio while this one plays, so there's no gap.
    const next = slides[index + 1];
    if (next) prefetchNarration(next.narration);
    void speaking.then(() => {
      if (!current) return;
      if (index < slides.length - 1) setTimeout(() => current && setIndex((i) => i + 1), SLIDE_ADVANCE_MS);
      else setPlaying(false);
    });
    return () => {
      current = false;
    };
  }, [playing, slide.narration, index, slides]);

  // Ready the slide on screen before Narrate is pressed.
  useEffect(() => prefetchNarration(slide.narration), [slide.narration]);

  useHotkeys((e) => {
    if (e.key === "ArrowRight") goTo(index + 1);
    else if (e.key === "ArrowLeft") goTo(index - 1);
    else if (e.key.toLowerCase() === "p" && !e.metaKey && !e.ctrlKey) setPlaying(!playing);
    else return false;
  });

  return (
    <div className="plan">
      <section className="slide" key={slide.id}>
        <div className="slide-kind">
          {SLIDE_KIND_LABEL[slide.kind]}
          {changed.has(slide.id) && <em className="updated">Updated</em>}
        </div>
        <h2>{slide.title}</h2>
        <div className={`slide-grid ${slide.diagram ? "two" : ""}`}>
          <SlideBody slide={slide} />
          {slide.diagram && <Diagram source={slide.diagram} />}
        </div>
        <p className="narration">{slide.narration}</p>
      </section>

      <footer className="plan-foot">
        <div className="controls">
          <button className="ghost" onClick={() => goTo(index - 1)}>
            ←
          </button>
          <button className="play" onClick={() => setPlaying(!playing)}>
            {playing ? "❚❚ Pause" : "▶ Narrate"} <kbd>P</kbd>
          </button>
          <button className="ghost" onClick={() => goTo(index + 1)}>
            →
          </button>
        </div>
        <div className="thumbs">
          {slides.map((s, i) => (
            <button key={s.id} className={`${i === index ? "on" : ""} ${changed.has(s.id) ? "changed" : ""}`} onClick={() => goTo(i)}>
              <small>{i + 1}</small>
              {s.title}
            </button>
          ))}
        </div>
        <button
          className="primary"
          disabled={!state.claudeWaiting}
          onClick={() => send({ type: "plan_approved" }, { handoff: "Claude is starting on the first file…" })}
        >
          Approve plan, start coding
        </button>
      </footer>
    </div>
  );
}
