import { useEffect, useEffectEvent } from "react";

export function isTyping(el: Element | null = document.activeElement) {
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el as HTMLElement).isContentEditable);
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
