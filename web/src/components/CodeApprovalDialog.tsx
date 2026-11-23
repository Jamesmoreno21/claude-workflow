import { useState } from "react";
import { CODE_APPROVALS, type CodeApproval } from "../../../shared/protocol";
import { usePreference } from "../config/settings";
import { CODE_APPROVAL } from "../constants/labels";
import { useHotkeys } from "../hooks/useHotkeys";

/** The pre-coding question: how much of the code the user wants to approve file by file. */
export function CodeApprovalDialog({ onStart, onClose }: { onStart(approval: CodeApproval): void; onClose(): void }) {
  const [defaultApproval, setDefaultApproval] = usePreference("codeApproval");
  const [, setAsk] = usePreference("askCodeApproval");
  const [choice, setChoice] = useState<CodeApproval>(defaultApproval);
  const [remember, setRemember] = useState(false);

  const start = () => {
    if (remember) {
      setDefaultApproval(choice);
      setAsk(false);
    }
    onStart(choice);
  };
  useHotkeys((e) => {
    const picked = CODE_APPROVALS[Number(e.key) - 1];
    if (picked) setChoice(picked);
    else if (e.key === "Enter") start();
    else if (e.key === "Escape") onClose();
    else return false;
  });

  return (
    <div className="scrim center" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="How do you want to review the code?" onClick={(e) => e.stopPropagation()}>
        <h2>How do you want to review the code?</h2>
        <div className="options">
          {CODE_APPROVALS.map((id, i) => (
            <button
              key={id}
              role="radio"
              aria-checked={choice === id}
              className={`option ${choice === id ? "picked" : ""}`}
              onClick={() => setChoice(id)}
            >
              <kbd>{i + 1}</kbd>
              <div>
                <b>{CODE_APPROVAL[id].label}</b>
                <p>{CODE_APPROVAL[id].hint}</p>
              </div>
            </button>
          ))}
        </div>
        <footer>
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Use this from now on and don't ask (change it in ⚙)
          </label>
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" onClick={start}>
            Start coding <kbd>↵</kbd>
          </button>
        </footer>
      </div>
    </div>
  );
}
