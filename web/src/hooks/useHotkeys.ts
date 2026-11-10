import { useEffect, useEffectEvent } from "react";

/**
 * Whether keys go to a text field. Monaco takes input through Chrome's
 * EditContext (not a textarea), so anything inside an editor counts too.
 */
export function isTyping(el: Element | null = document.activeElement) {
  if (!el) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return (
    (el as HTMLElement).isContentEditable ||
    ("editContext" in el && !!(el as HTMLElement & { editContext?: unknown }).editContext) ||
    !!el.closest(".monaco-editor")
  );
}

/**
 * Screen shortcuts, ignored while the user types in a field. Return false
 * from the handler to let the key through.
 */
export function useHotkeys(handler: (e: KeyboardEvent) => boolean | void) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (isTyping()) return;
    if (handler(e) !== false) e.preventDefault();
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}
