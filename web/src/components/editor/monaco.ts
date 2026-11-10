// Monaco, bundled locally (no CDN) and loaded only by the workspace screens.
import * as monaco from "monaco-editor";
import CssWorker from "monaco-editor/language/css/css.worker.js?worker";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import HtmlWorker from "monaco-editor/language/html/html.worker.js?worker";
import JsonWorker from "monaco-editor/language/json/json.worker.js?worker";
import TsWorker from "monaco-editor/language/typescript/ts.worker.js?worker";

self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === "json") return new JsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new CssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new HtmlWorker();
    if (label === "typescript" || label === "javascript") return new TsWorker();
    return new EditorWorker();
  },
};

// Without the project's tsconfig and node_modules every import looks broken, so
// keep highlighting and editing help but drop the (false) error squiggles.
for (const defaults of [monaco.typescript.typescriptDefaults, monaco.typescript.javascriptDefaults]) {
  defaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true, noSuggestionDiagnostics: true });
}

monaco.editor.defineTheme("cockpit", {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#0e1116",
    "editorGutter.background": "#0e1116",
    "diffEditor.insertedLineBackground": "#4fbf7f1c",
    "diffEditor.removedLineBackground": "#ef6b6b1c",
  },
});

export { monaco };
