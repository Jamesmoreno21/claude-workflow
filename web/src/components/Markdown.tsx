import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";

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
