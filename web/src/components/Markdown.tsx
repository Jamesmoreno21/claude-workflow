import DOMPurify from "dompurify";
import { marked } from "marked";
import mermaid from "mermaid";
import { useEffect, useId, useMemo, useRef } from "react";

// Text shown here can come from task descriptions anyone can write (issues,
// cards), so the HTML is sanitized and links are limited to safe schemes.
const SAFE_LINK = /^(https?:|mailto:|#)/i;

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName !== "A") return;
  if (!SAFE_LINK.test(node.getAttribute("href") ?? "")) node.removeAttribute("href");
  // Links open beside the cockpit instead of replacing it.
  node.setAttribute("target", "_blank");
  node.setAttribute("rel", "noreferrer noopener");
});

export function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(marked.parse(text ?? "", { async: false }) as string);
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "dark",
  themeVariables: { background: "transparent", fontFamily: "inherit", fontSize: "15px" },
});

export function Diagram({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = "m" + useId().replace(/[^a-z0-9]/gi, "");
  useEffect(() => {
    let alive = true;
    mermaid
      .render(id, source)
      .then(({ svg }) => alive && ref.current && (ref.current.innerHTML = svg))
      .catch(() => alive && ref.current && (ref.current.textContent = source));
    return () => {
      alive = false;
    };
  }, [id, source]);
  return <div className="diagram" ref={ref} />;
}
