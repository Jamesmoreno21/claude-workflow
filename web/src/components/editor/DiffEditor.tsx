import { useCallback, useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import type { CodeSelection } from "../../../../shared/protocol";
import { monaco } from "./monaco";
import { SelectionAsk } from "./SelectionAsk";
import { ViewZone } from "./ViewZone";

export interface Zone {
  key: string;
  afterLine: number;
  node: ReactNode;
}

export interface DiffEditorHandle {
  save(): void;
}

export interface DiffEditorProps {
  /** Lets the screen offer a Save button next to ⌘S. */
  handle?: Ref<DiffEditorHandle>;
  repo: string;
  path: string;
  /** As committed (left side / removed lines). */
  original: string;
  /** What to show; replaces the editor's text unless the user has unsaved edits. */
  modified: string;
  readOnly: boolean;
  sideBySide: boolean;
  /** Collapse long unchanged stretches (off in review, so every finding's line stays visible). */
  foldUnchanged?: boolean;
  zones?: Zone[];
  /** Keeps this line in view (the replay's typing cursor, a selected finding). */
  revealLine?: number;
  onDirtyChange?(dirty: boolean): void;
  /** ⌘S: `base` is the text the user started editing from, for conflict checks. Resolves true once saved. */
  onSave?(content: string, base: string): Promise<boolean>;
  onAsk?(selection: CodeSelection, question: string): void;
}

/** Replaces only the part of the model that changed, so typing replays don't jump. */
function applyText(model: monaco.editor.ITextModel, next: string) {
  const current = model.getValue();
  if (current === next) return;
  let start = 0;
  while (start < current.length && start < next.length && current[start] === next[start]) start++;
  let endCurrent = current.length;
  let endNext = next.length;
  while (endCurrent > start && endNext > start && current[endCurrent - 1] === next[endNext - 1]) {
    endCurrent--;
    endNext--;
  }
  const range = monaco.Range.fromPositions(model.getPositionAt(start), model.getPositionAt(endCurrent));
  model.applyEdits([{ range, text: next.slice(start, endNext) }]);
}

/** Monaco's diff editor: inline (GitHub-like) or side by side, editable on the right. Mount one per file. */
export function DiffEditor(props: DiffEditorProps) {
  const { repo, path, original, modified, readOnly, sideBySide, zones = [], revealLine } = props;
  const host = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<monaco.editor.IStandaloneDiffEditor | null>(null);
  const applied = useRef(modified);
  const [dirty, setDirty] = useState(false);
  const [selection, setSelection] = useState<{ range: monaco.Selection; top: number; left: number } | null>(null);

  // The parent hears about unsaved edits through the latest callback it passed.
  const onDirtyChange = useRef(props.onDirtyChange);
  useEffect(() => {
    onDirtyChange.current = props.onDirtyChange;
  });
  const reportDirty = useCallback((value: boolean) => {
    setDirty(value);
    onDirtyChange.current?.(value);
  }, []);
  const save = async () => {
    const content = editor?.getModifiedEditor().getValue();
    if (content === undefined || !props.onSave || content === applied.current) return;
    if (!(await props.onSave(content, applied.current))) return;
    applied.current = content; // the saved text is the new baseline
    reportDirty(false);
  };
  const onSave = useEffectEvent(() => save());
  useImperativeHandle(props.handle, () => ({ save: () => void save() }));

  useEffect(() => {
    const diff = monaco.editor.createDiffEditor(host.current!, {
      theme: "cockpit",
      automaticLayout: true,
      renderSideBySide: false,
      originalEditable: false,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderOverviewRuler: false,
      hideUnchangedRegions: { enabled: true, contextLineCount: 4, minimumLineCount: 6 },
    });
    diff.getModifiedEditor().addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void onSave());
    setEditor(diff);
    return () => {
      const models = diff.getModel();
      diff.dispose();
      models?.original.dispose();
      models?.modified.dispose();
    };
  }, []);

  // A new file gets fresh models; Monaco picks the language from the file name.
  useEffect(() => {
    if (!editor) return;
    const uri = monaco.Uri.file(`/${repo}/${path}`);
    const previous = editor.getModel();
    editor.setModel({
      original: monaco.editor.createModel(original, undefined, uri.with({ query: "head" })),
      modified: monaco.editor.createModel(modified, undefined, uri),
    });
    previous?.original.dispose();
    previous?.modified.dispose();
    applied.current = modified;
    const subscription = editor.getModifiedEditor().onDidChangeModelContent(() => {
      reportDirty(editor.getModifiedEditor().getValue() !== applied.current);
    });
    return () => subscription.dispose();
    // Content changes are handled below; only a different file recreates models.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, repo, path]);

  useEffect(() => {
    const models = editor?.getModel();
    if (!models) return;
    applyText(models.original, original);
    if (dirty) return; // keep the user's unsaved edits
    applied.current = modified;
    applyText(models.modified, modified);
  }, [editor, original, modified, dirty]);

  const foldUnchanged = props.foldUnchanged ?? true;
  useEffect(() => {
    editor?.updateOptions({ renderSideBySide: sideBySide, hideUnchangedRegions: { enabled: foldUnchanged } });
    editor?.getModifiedEditor().updateOptions({ readOnly });
  }, [editor, sideBySide, readOnly, foldUnchanged]);

  useEffect(() => {
    if (editor && revealLine) editor.getModifiedEditor().revealLineInCenterIfOutsideViewport(revealLine);
  }, [editor, revealLine]);

  // Selecting code offers an "Ask" box next to the selection.
  useEffect(() => {
    if (!editor || !props.onAsk) return;
    const code = editor.getModifiedEditor();
    const place = () => {
      const range = code.getSelection();
      if (!range || range.isEmpty()) return setSelection(null);
      const end = code.getScrolledVisiblePosition(range.getEndPosition());
      if (end) setSelection({ range, top: end.top + end.height + 4, left: Math.max(8, end.left - 40) });
    };
    const subscriptions = [code.onDidChangeCursorSelection(place), code.onDidScrollChange(place)];
    return () => subscriptions.forEach((s) => s.dispose());
  }, [editor, props.onAsk]);

  const ask = (question: string) => {
    const code = editor!.getModifiedEditor();
    const range = selection!.range;
    props.onAsk!(
      { repo, path, startLine: range.startLineNumber, endLine: range.endLineNumber, text: code.getModel()!.getValueInRange(range) },
      question,
    );
    code.setSelection(new monaco.Selection(range.endLineNumber, range.endColumn, range.endLineNumber, range.endColumn));
  };

  return (
    <div className="monaco-wrap">
      <div className="monaco-host" ref={host} />
      {editor &&
        zones.map((z) => (
          <ViewZone key={z.key} editor={editor.getModifiedEditor()} afterLine={z.afterLine}>
            {z.node}
          </ViewZone>
        ))}
      {selection && (
        <SelectionAsk top={selection.top} left={selection.left} lines={selection.range} onAsk={ask} onClose={() => setSelection(null)} />
      )}
    </div>
  );
}
