import type { monaco as Monaco } from "./monaco";

// Monaco has no Vue language. This one colors a single-file component as HTML,
// with <script> as TypeScript or JavaScript and <style> as CSS, SCSS or Less,
// following their `lang` attribute.

const SCRIPT_LANGS: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript" };
const STYLE_LANGS: Record<string, string> = { css: "css", scss: "scss", sass: "scss", less: "less" };

/** The states that read a block's attributes until `>`, then hand its body to `defaultLang` or the `lang` one. */
function block(
  tag: "script" | "style",
  langs: Record<string, string>,
  defaultLang: string,
): Record<string, Monaco.languages.IMonarchLanguageRule[]> {
  const embedded = `${tag}Embedded`;
  const withLang = `${tag}WithLang`;
  // The block's body pops back here; its closing tag pops back to the top level.
  const close: Monaco.languages.IMonarchLanguageRule = [
    new RegExp(`(</)(${tag}\\s*)(>)`),
    ["delimiter", "tag", { token: "delimiter", next: "@pop" }],
  ];
  return {
    [tag]: [
      ...Object.entries(langs).map(([lang, id]): Monaco.languages.IMonarchLanguageRule => [
        new RegExp(`(lang)(\\s*=\\s*)(["']${lang}["'])`),
        ["attribute.name", "delimiter", { token: "attribute.value", switchTo: `@${withLang}.${id}` }],
      ]),
      [/"[^"]*"|'[^']*'/, "attribute.value"],
      [/[\w\-:@]+/, "attribute.name"],
      [/=/, "delimiter"],
      [/>/, { token: "delimiter", next: `@${embedded}.${defaultLang}`, nextEmbedded: defaultLang }],
      [/[ \t\r\n]+/, ""],
      close,
    ],
    [withLang]: [
      [/"[^"]*"|'[^']*'/, "attribute.value"],
      [/[\w\-:@]+/, "attribute.name"],
      [/=/, "delimiter"],
      [/>/, { token: "delimiter", next: `@${embedded}.$S2`, nextEmbedded: "$S2" }],
      [/[ \t\r\n]+/, ""],
      close,
    ],
    [embedded]: [
      [new RegExp(`</${tag}`), { token: "@rematch", next: "@pop", nextEmbedded: "@pop" }],
      [/[^<]+/, ""],
      [/</, ""],
    ],
  };
}

const language: Monaco.languages.IMonarchLanguage = {
  defaultToken: "",
  tokenPostfix: ".vue",
  ignoreCase: true,
  tokenizer: {
    root: [
      [/<!--/, "comment", "@comment"],
      [/\{\{/, { token: "delimiter.bracket", next: "@interpolation", nextEmbedded: "typescript" }],
      [/(<)(script)/, ["delimiter", { token: "tag", next: "@script" }]],
      [/(<)(style)/, ["delimiter", { token: "tag", next: "@style" }]],
      [/(<\/?)([\w\-.:]+)/, ["delimiter", { token: "tag", next: "@tag" }]],
      [/</, "delimiter"],
      [/[^<{]+/, ""],
      [/\{/, ""],
    ],
    comment: [
      [/-->/, "comment", "@pop"],
      [/[^-]+/, "comment.content"],
      [/./, "comment.content"],
    ],
    interpolation: [[/\}\}/, { token: "delimiter.bracket", next: "@pop", nextEmbedded: "@pop" }]],
    tag: [
      [/\/?>/, "delimiter", "@pop"],
      [/"[^"]*"|'[^']*'/, "attribute.value"],
      // Vue directives and bindings: v-if, :prop, @event, #slot
      [/(v-[\w\-]+|[:@#][\w\-.[\]]+)/, "keyword"],
      [/[\w\-]+/, "attribute.name"],
      [/=/, "delimiter"],
      [/[ \t\r\n]+/, ""],
    ],
    ...block("script", SCRIPT_LANGS, "javascript"),
    ...block("style", STYLE_LANGS, "css"),
  },
};

export function registerVue(monaco: typeof Monaco) {
  monaco.languages.register({ id: "vue", extensions: [".vue"], aliases: ["Vue"] });
  monaco.languages.setMonarchTokensProvider("vue", language);
  monaco.languages.setLanguageConfiguration("vue", {
    comments: { blockComment: ["<!--", "-->"] },
    brackets: [
      ["<!--", "-->"],
      ["<", ">"],
      ["{", "}"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });
}
