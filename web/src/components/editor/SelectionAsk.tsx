import { useState } from "react";

/** The box that appears under selected code: ask Claude about exactly those lines. */
export function SelectionAsk({
  top,
  left,
  lines,
  onAsk,
  onClose,
}: {
  top: number;
  left: number;
  lines: { startLineNumber: number; endLineNumber: number };
  onAsk(question: string): void;
  onClose(): void;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const label =
    lines.startLineNumber === lines.endLineNumber
      ? `line ${lines.startLineNumber}`
      : `lines ${lines.startLineNumber}–${lines.endLineNumber}`;

  if (!open)
    return (
      <button className="selection-ask-chip" style={{ top, left }} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(true)}>
        💬 Ask about {label}
      </button>
    );

  const submit = () => {
    if (!question.trim()) return;
    onAsk(question.trim());
    setQuestion("");
    setOpen(false);
  };

  return (
    <div className="selection-ask" style={{ top, left }}>
      <small className="muted">Ask Claude about {label}</small>
      <textarea
        autoFocus
        rows={2}
        value={question}
        placeholder="Why is this here? Could it be simpler?"
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") onClose();
        }}
      />
      <div className="fb-actions">
        <button className="ghost sm" onClick={onClose}>
          Cancel
        </button>
        <button className="primary" disabled={!question.trim()} onClick={submit}>
          Ask
        </button>
      </div>
    </div>
  );
}
