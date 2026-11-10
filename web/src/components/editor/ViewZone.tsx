import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { monaco } from "./monaco";

/** Renders React content as a block between the editor's lines, under `afterLine`. */
export function ViewZone({ editor, afterLine, children }: { editor: monaco.editor.ICodeEditor; afterLine: number; children: ReactNode }) {
  const [domNode] = useState(() => document.createElement("div"));

  useLayoutEffect(() => {
    let zoneId: string | null = null;
    const zone = { afterLineNumber: afterLine, domNode, heightInPx: 120 };
    const measure = () => (domNode.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0;

    // Zones belong to a model: add once one is attached, and again whenever it's swapped.
    const add = () => {
      if (!editor.getModel()) return;
      zone.heightInPx = (measure() || 112) + 8;
      editor.changeViewZones((zones) => {
        if (zoneId) zones.removeZone(zoneId);
        zoneId = zones.addZone(zone);
      });
    };
    add();
    const modelChange = editor.onDidChangeModel(add);

    // Keep the gap as tall as the content, which grows when a fix or reply appears.
    const observer = new ResizeObserver(() => {
      const height = measure() + 8;
      if (!zoneId || height <= 8 || height === zone.heightInPx) return;
      zone.heightInPx = height;
      editor.changeViewZones((zones) => zones.layoutZone(zoneId!));
    });
    if (domNode.firstElementChild) observer.observe(domNode.firstElementChild);

    return () => {
      modelChange.dispose();
      observer.disconnect();
      editor.changeViewZones((zones) => zoneId && zones.removeZone(zoneId));
    };
  }, [editor, afterLine, domNode]);

  return createPortal(<div className="zone-content">{children}</div>, domNode);
}
