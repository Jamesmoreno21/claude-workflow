import { useState } from "react";
import type { Answer, Question } from "../../../shared/protocol";
import { useApp, useFocus } from "../app/AppContext";
import { Markdown } from "../components/Markdown";
import { MIC_TOGGLE_LABEL } from "../constants/shortcuts";
import { ANSWER_ADVANCE_MS } from "../constants/ui";
import { useHotkeys } from "../hooks/useHotkeys";

const isAnswered = (answer: Answer | undefined) => Boolean(answer?.optionId || answer?.text?.trim());

/** Product questions first; technical ones once every product question has an answer. */
function currentStage(questions: Question[], answers: Record<string, Answer>): Question["stage"] {
  const productDone = questions.filter((q) => q.stage === "product").every((q) => answers[q.id]);
  return productDone && questions.some((q) => q.stage === "technical") ? "technical" : "product";
}

/**
 * One question at a time, with its full context on screen. Keys: 1-4 pick an
 * option, 5 jumps to "other", ←/→ move, E toggles the example, ⏎ submits.
 */
export function ValidationScreen() {
  const { state, send } = useApp();
  const stage = currentStage(state.questions, state.answers);
  const questions = state.questions.filter((q) => q.stage === stage);

  const [draft, setDraft] = useState<Record<string, Answer>>({});
  const [position, setPosition] = useState({ stage, index: 0 });
  const [exampleOpenFor, setExampleOpenFor] = useState<string | null>(null);
  const [seenAnswers, setSeenAnswers] = useState(state.answers);

  // Answers Claude filled in from voice replace the drafts for those questions.
  if (state.answers !== seenAnswers) {
    setSeenAnswers(state.answers);
    setDraft(Object.fromEntries(Object.entries(draft).filter(([id]) => !state.answers[id])));
  }
  // A new stage starts at its first question.
  const index = position.stage === stage ? Math.min(position.index, questions.length - 1) : 0;
  const goTo = (i: number) => setPosition({ stage, index: Math.max(0, Math.min(i, questions.length - 1)) });

  const question = questions[index];
  useFocus(question && `question:${question.id}`, `Q${index + 1}`);

  const answers = { ...state.answers, ...draft };
  const answeredCount = questions.filter((q) => isAnswered(answers[q.id])).length;
  const canSubmit = answeredCount === questions.length && state.claudeWaiting;

  const pick = (answer: Answer) => {
    setDraft({ ...draft, [question.id]: answer });
    if (answer.optionId && index < questions.length - 1) setTimeout(() => goTo(index + 1), ANSWER_ADVANCE_MS);
  };
  const submit = () => {
    send(
      { type: "answers", answers: Object.fromEntries(questions.map((q) => [q.id, answers[q.id]])) },
      {
        handoff:
          stage === "product"
            ? "Claude is reading your answers and preparing the technical questions…"
            : "Claude is building the plan from your answers…",
      },
    );
    setDraft({});
  };

  useHotkeys((e) => {
    if (!question) return false;
    const n = Number(e.key);
    if (n >= 1 && n <= question.options.length) pick({ optionId: question.options[n - 1].id });
    else if (n === question.options.length + 1) document.getElementById("other")?.focus();
    else if (e.key === "ArrowRight") goTo(index + 1);
    else if (e.key === "ArrowLeft") goTo(index - 1);
    else if (e.key.toLowerCase() === "e") setExampleOpenFor(exampleOpenFor === question.id ? null : question.id);
    else if (e.key === "Enter" && canSubmit) submit();
    else return false;
  });

  if (!question) return null;
  const answer = answers[question.id];
  const exampleOpen = exampleOpenFor === question.id;

  return (
    <div className="validation">
      <div className="v-top">
        <div className="stage-tabs">
          <span className={stage === "product" ? "on" : "done"}>Product decisions</span>
          <span className={stage === "technical" ? "on" : ""}>Technical decisions</span>
        </div>
        <div className="qdots">
          {questions.map((q, i) => (
            <button
              key={q.id}
              className={`${i === index ? "on" : ""} ${answers[q.id] ? "ok" : ""}`}
              onClick={() => goTo(i)}
              title={q.title}
            />
          ))}
        </div>
      </div>

      <article className="question" key={question.id}>
        <span className="qnum">
          Question {index + 1} of {questions.length}
        </span>
        <h2>{question.title}</h2>
        <Markdown className="qcontext" text={question.context} />

        {question.example && (
          <div className={`example ${exampleOpen ? "open" : ""}`}>
            <button onClick={() => setExampleOpenFor(exampleOpen ? null : question.id)}>
              <span>{exampleOpen ? "−" : "+"}</span> Example of this situation <kbd>E</kbd>
            </button>
            {exampleOpen && <Markdown text={question.example} />}
          </div>
        )}

        <div className="options">
          {question.options.map((option, i) => (
            <button
              key={option.id}
              className={`option ${answer?.optionId === option.id ? "picked" : ""}`}
              onClick={() => pick({ optionId: option.id })}
            >
              <kbd>{i + 1}</kbd>
              <div>
                <b>
                  {option.label}
                  {question.recommended === option.id && <em className="rec">Recommended</em>}
                </b>
                {option.description && <p>{option.description}</p>}
                {option.example && <p className="opt-example">e.g. {option.example}</p>}
              </div>
            </button>
          ))}
          <div className={`option other ${answer?.text && !answer.optionId ? "picked" : ""}`}>
            <kbd>{question.options.length + 1}</kbd>
            <textarea
              id="other"
              rows={2}
              placeholder={`Something else… (or ${MIC_TOGGLE_LABEL} and say it)`}
              value={answer?.optionId ? "" : (answer?.text ?? "")}
              onChange={(e) => setDraft({ ...draft, [question.id]: { text: e.target.value } })}
              onKeyDown={(e) => e.key === "Escape" && (e.target as HTMLElement).blur()}
            />
          </div>
        </div>
      </article>

      <footer className="v-foot">
        <button className="ghost" disabled={index === 0} onClick={() => goTo(index - 1)}>
          ← Back
        </button>
        <span className="muted">
          {answeredCount}/{questions.length} answered
        </span>
        {index < questions.length - 1 ? (
          <button className="ghost" onClick={() => goTo(index + 1)}>
            Next →
          </button>
        ) : (
          <button className="primary" disabled={!canSubmit} onClick={submit}>
            {stage === "product" ? "Send product answers" : "Send answers, build the plan"} ⏎
          </button>
        )}
      </footer>
    </div>
  );
}
