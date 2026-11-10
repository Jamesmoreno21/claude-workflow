import { useState } from "react";
import type { Answer, Question } from "../../../shared/protocol";
import { useApp } from "../app/AppContext";
import { SLIDE_KIND_LABEL } from "../constants/labels";
import { prSizeClass } from "../lib/size";
import { Diagram } from "./Diagram";
import { Markdown } from "./Markdown";

export type PastStep = "validation" | "plan";

function answerText(question: Question, answer: Answer | undefined) {
  if (!answer) return "Not answered";
  const option = question.options.find((o) => o.id === answer.optionId);
  return option ? option.label : (answer.text ?? "Not answered");
}

function Decisions() {
  const { state } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const stages: Question["stage"][] = ["product", "technical"];
  return (
    <>
      {stages.map((stage) => {
        const questions = state.questions.filter((q) => q.stage === stage);
        if (!questions.length) return null;
        return (
          <section key={stage} className="past-section">
            <h3>{stage === "product" ? "Product decisions" : "Technical decisions"}</h3>
            {questions.map((q) => {
              const answer = state.answers[q.id];
              const option = q.options.find((o) => o.id === answer?.optionId);
              return (
                <article key={q.id} className="past-question">
                  <button className="past-question-head" onClick={() => setOpenId(openId === q.id ? null : q.id)}>
                    <span className="past-q">{q.title}</span>
                    <span className="past-a">{answerText(q, answer)}</span>
                  </button>
                  {option?.description && <p className="muted past-detail">{option.description}</p>}
                  {openId === q.id && <Markdown className="qcontext" text={q.context} />}
                </article>
              );
            })}
          </section>
        );
      })}
    </>
  );
}

function PlanSummary() {
  const { state } = useApp();
  const plan = state.plan;
  if (!plan) return <p className="muted">No plan yet.</p>;
  return (
    <>
      {plan.slides.map((slide, i) => (
        <section key={slide.id} className="past-section">
          <span className="slide-kind">
            {i + 1}. {SLIDE_KIND_LABEL[slide.kind]}
          </span>
          <h3>{slide.title}</h3>
          <Markdown text={slide.body} />
          {slide.diagram && <Diagram source={slide.diagram} />}
          {slide.files?.length ? (
            <div className="slide-files">
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
            <ul className="tests">
              {slide.tests.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
      <section className="past-section">
        <h3>Pull requests</h3>
        {plan.prs.map((pr, i) => (
          <div key={i} className="pr-plan-row">
            <span className="repo-tag">{pr.repo}</span>
            <div>
              <b>{pr.title}</b>
              <small>{pr.scope}</small>
            </div>
            <span className={`size ${prSizeClass(pr.estimatedLines)}`}>~{pr.estimatedLines} lines</span>
          </div>
        ))}
      </section>
    </>
  );
}

/** Read-only look back at the decisions and the plan, from any later step. */
export function PastSteps({ step, onStep, onClose }: { step: PastStep; onStep(step: PastStep): void; onClose(): void }) {
  return (
    <div className="scrim" onClick={onClose}>
      <aside className="drawer past-steps" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="seg">
            <button className={step === "validation" ? "on" : ""} onClick={() => onStep("validation")}>
              Decisions
            </button>
            <button className={step === "plan" ? "on" : ""} onClick={() => onStep("plan")}>
              Plan
            </button>
          </div>
          <span className="muted">Read only</span>
          <button className="icon" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        {step === "validation" ? <Decisions /> : <PlanSummary />}
      </aside>
    </div>
  );
}
