import { marked } from "marked";
import mermaid from "mermaid";
import { useEffect, useId, useMemo, useRef } from "react";

// Links (docs, references) open beside the cockpit instead of replacing it.
marked.use({
  renderer: {
    link({ href, tokens }) {
      const safe = href.replace(/"/g, "&quot;");
      return `<a href="${safe}" target="_blank" rel="noreferrer">${this.parser.parseInline(tokens)}</a>`;
    },
  },
});

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const html = useMemo(() => marked.parse(text ?? "", { async: false }) as string, [text]);
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

mermaid.initialize({
  startOnLoad: false,
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
