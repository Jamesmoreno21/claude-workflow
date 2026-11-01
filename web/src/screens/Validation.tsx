import { useEffect, useMemo, useState } from "react";
import type { Answer } from "../../../shared/protocol";
import { Markdown } from "../components/Markdown";
import { useApp } from "../connection";
import { MIC_TOGGLE_LABEL } from "../voice";

/**
 * One question at a time, full context on screen. Keys: 1-4 pick an option,
 * 5 jumps to "other", ←/→ move, E toggles the example, ⌘P or hold Space answers by voice.
 */
export function Validation() {
  const { state, send, setFocus } = useApp();
  const productDone = state.questions.filter((q) => q.stage === "product").every((q) => state.answers[q.id]);
  const stage = productDone && state.questions.some((q) => q.stage === "technical") ? "technical" : "product";
  const questions = useMemo(() => state.questions.filter((q) => q.stage === stage), [state.questions, stage]);

  const [draft, setDraft] = useState<Record<string, Answer>>({});
  const [index, setIndex] = useState(0);
  const [showExample, setShowExample] = useState(false);
  const answers = { ...state.answers, ...draft };

  // Answers Claude filled in from voice arrive through state; drop stale drafts.
  useEffect(() => setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !state.answers[k]))), [state.answers]);
  useEffect(() => setIndex(0), [stage]);

  const q = questions[Math.min(index, questions.length - 1)];
  useEffect(() => {
    if (q) setFocus({ about: `question:${q.id}`, label: `Q${index + 1}` });
    setShowExample(false);
  }, [q?.id]);

  const answered = questions.filter((x) => answers[x.id]?.optionId || answers[x.id]?.text?.trim()).length;
  const all = answered === questions.length;
  const pick = (a: Answer) => {
    setDraft({ ...draft, [q.id]: a });
    if (a.optionId && index < questions.length - 1) setTimeout(() => setIndex(index + 1), 250);
  };
  const submit = () => {
    send({ type: "answers", answers: Object.fromEntries(questions.map((x) => [x.id, answers[x.id]])) });
    setDraft({});
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (!q || el?.tagName === "TEXTAREA" || el?.tagName === "INPUT") return;
      const n = Number(e.key);
      if (n >= 1 && n <= q.options.length) pick({ optionId: q.options[n - 1].id });
      else if (n === q.options.length + 1) document.getElementById("other")?.focus();
      else if (e.key === "ArrowRight") setIndex(Math.min(index + 1, questions.length - 1));
      else if (e.key === "ArrowLeft") setIndex(Math.max(index - 1, 0));
      else if (e.key.toLowerCase() === "e") setShowExample((s) => !s);
      else if (e.key === "Enter" && all && state.claudeWaiting) submit();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!q) return null;
  const a = answers[q.id];

  return (
    <div className="validation">
      <div className="v-top">
        <div className="stage-tabs">
          <span className={stage === "product" ? "on" : "done"}>Product decisions</span>
          <span className={stage === "technical" ? "on" : ""}>Technical decisions</span>
        </div>
        <div className="qdots">
          {questions.map((x, i) => (
            <button
              key={x.id}
              className={`${i === index ? "on" : ""} ${answers[x.id] ? "ok" : ""}`}
              onClick={() => setIndex(i)}
              title={x.title}
            />
          ))}
        </div>
      </div>

      <article className="question" key={q.id}>
        <span className="qnum">
          Question {index + 1} of {questions.length}
        </span>
        <h2>{q.title}</h2>
        <Markdown className="qcontext" text={q.context} />

        {q.example && (
          <div className={`example ${showExample ? "open" : ""}`}>
            <button onClick={() => setShowExample(!showExample)}>
              <span>{showExample ? "−" : "+"}</span> Example of this situation <kbd>E</kbd>
            </button>
            {showExample && <Markdown text={q.example} />}
          </div>
        )}

        <div className="options">
          {q.options.map((o, i) => (
            <button key={o.id} className={`option ${a?.optionId === o.id ? "picked" : ""}`} onClick={() => pick({ optionId: o.id })}>
              <kbd>{i + 1}</kbd>
              <div>
                <b>
                  {o.label}
                  {q.recommended === o.id && <em className="rec">Recommended</em>}
                </b>
                {o.description && <p>{o.description}</p>}
                {o.example && <p className="opt-example">e.g. {o.example}</p>}
              </div>
            </button>
          ))}
          <div className={`option other ${a?.text && !a.optionId ? "picked" : ""}`}>
            <kbd>{q.options.length + 1}</kbd>
            <textarea
              id="other"
              rows={2}
              placeholder={`Something else… (or ${MIC_TOGGLE_LABEL} and say it)`}
              value={!a?.optionId ? (a?.text ?? "") : ""}
              onChange={(e) => setDraft({ ...draft, [q.id]: { text: e.target.value } })}
              onKeyDown={(e) => e.key === "Escape" && (e.target as HTMLElement).blur()}
            />
          </div>
        </div>

      </article>

      <footer className="v-foot">
        <button className="ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          ← Back
        </button>
        <span className="muted">
          {answered}/{questions.length} answered
        </span>
        {index < questions.length - 1 ? (
          <button className="ghost" onClick={() => setIndex(index + 1)}>
            Next →
          </button>
        ) : (
          <button className="primary" disabled={!all || !state.claudeWaiting} onClick={submit}>
            {stage === "product" ? "Send product answers" : "Send answers, build the plan"} ⏎
          </button>
        )}
      </footer>
    </div>
  );
}
