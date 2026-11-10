import { createContext, useContext, useEffect } from "react";
import type { UserEvent, WorkflowState } from "../../../shared/protocol";

/** What a chat or voice message refers to right now, e.g. "question:q2". */
export interface Focus {
  about?: string;
  label?: string;
}

export interface SendOptions {
  /** Shows a loader with this text until Claude has handled the event. */
  handoff?: string;
}

export const AppContext = createContext<{
  state: WorkflowState;
  send: (event: UserEvent, options?: SendOptions) => void;
  focus: Focus;
  setFocus: (focus: Focus) => void;
}>(null!);

export const useApp = () => useContext(AppContext);

/** Points chat and voice at what the screen is showing. */
export function useFocus(about: string | undefined, label: string | undefined) {
  const { setFocus } = useApp();
  useEffect(() => {
    if (about) setFocus({ about, label });
  }, [about, label, setFocus]);
}
