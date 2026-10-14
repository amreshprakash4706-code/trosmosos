/** Lightweight syntax highlighter for Editor. Returns HTML-escaped spans. */

export type HighlightLang = "markdown" | "javascript" | "typescript" | "json" | "css" | "plain";

export function langFromName(name: string): HighlightLang {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "ts" || ext === "tsx") return "typescript";
  if (ext === "js" || ext === "jsx" || ext === "mjs") return "javascript";
  if (ext === "json") return "json";
  if (ext === "css") return "css";
  return "plain";
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "\u0026amp;";
      case "<":
        return "\u0026lt;";
      case ">":
        return "\u0026gt;";
      case '"':
        return "\u0026quot;";
      default:
        return "\u0026#39;";
    }
  });
}

function span(cls: string, text: string): string {
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

function tokenizeCode(src: string, keywords: Set<string>): string {
  const re =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|[A-Za-z_$][\w$]*|[^\s])/g;
  let out = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const t = m[0];
    if (t.startsWith("//") || t.startsWith("/*")) out += span("tok-cmt", t);
    else if (t[0] === '"' || t[0] === "'" || t[0] === "`") out += span("tok-str", t);
    else if (/^\d/.test(t)) out += span("tok-num", t);
    else if (keywords.has(t)) out += span("tok-kw", t);
    else out += escapeHtml(t);
  }
  return out;
}

const JS_KW = new Set(
  "break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null return static super switch this throw true try typeof var void while with yield async await of from as".split(
    " ",
  ),
);
const TS_KW = new Set([
  ...JS_KW,
  "interface",
  "type",
  "enum",
  "implements",
  "private",
  "public",
  "protected",
  "readonly",
  "namespace",
  "abstract",
  "declare",
  "satisfies",
  "keyof",
  "infer",
]);

function highlightJson(src: string): string {
  const re = /"(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let last = 0;
  let out = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    out += escapeHtml(src.slice(last, m.index));
    const t = m[0];
    if (t[0] === '"') out += span("tok-str", t);
    else if (t === "true" || t === "false" || t === "null") out += span("tok-kw", t);
    else out += span("tok-num", t);
    last = m.index + t.length;
  }
  return out + escapeHtml(src.slice(last));
}

function highlightCss(src: string): string {
  const re =
    /(\/\*[\s\S]*?\*\/)|("[^"]*"|'[^']*')|(:[a-z-]+)|([.#]?[a-zA-Z_][\w-]*)|(\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw)?)/g;
  return src.replace(re, (all, cmt, str, pseudo, ident, num) => {
    if (cmt) return span("tok-cmt", cmt);
    if (str) return span("tok-str", str);
    if (pseudo) return span("tok-kw", pseudo);
    if (num) return span("tok-num", num);
    if (ident) return span("tok-ident", ident);
    return escapeHtml(all);
  });
}

function highlightMarkdown(src: string): string {
  return src
    .split("\n")
    .map((line) => {
      if (/^#{1,6}\s/.test(line)) return span("tok-kw", line);
      if (/^>\s/.test(line)) return span("tok-cmt", line);
      if (/^```/.test(line)) return span("tok-kw", line);
      if (/^[-*]\s/.test(line) || /^\d+\.\s/.test(line))
        return span("tok-num", line.slice(0, 2)) + escapeHtml(line.slice(2));
      let html = escapeHtml(line);
      html = html.replace(/`([^`]+)`/g, '<span class="tok-str">`$1`</span>');
      html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="tok-ident">[$1]($2)</span>');
      return html;
    })
    .join("\n");
}

export function highlight(src: string, lang: HighlightLang): string {
  if (lang === "json") return highlightJson(src);
  if (lang === "css") return highlightCss(src);
  if (lang === "markdown") return highlightMarkdown(src);
  if (lang === "javascript") return tokenizeCode(src, JS_KW);
  if (lang === "typescript") return tokenizeCode(src, TS_KW);
  return escapeHtml(src);
}

export function findMatches(
  hay: string,
  needle: string,
  opts: { caseSensitive?: boolean; wholeWord?: boolean } = {},
): number[] {
  if (!needle) return [];
  const flags = opts.caseSensitive ? "g" : "gi";
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = opts.wholeWord ? `\\b${escaped}\\b` : escaped;
  const re = new RegExp(pattern, flags);
  const idx: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(hay))) {
    idx.push(m.index);
    if (m[0].length === 0) re.lastIndex += 1;
  }
  return idx;
}

export function replaceMatches(
  hay: string,
  needle: string,
  replacement: string,
  opts: { caseSensitive?: boolean; wholeWord?: boolean; all?: boolean } = {},
): { next: string; count: number } {
  const idxs = findMatches(hay, needle, opts);
  if (!idxs.length) return { next: hay, count: 0 };
  if (!opts.all) {
    const i = idxs[0];
    return { next: hay.slice(0, i) + replacement + hay.slice(i + needle.length), count: 1 };
  }
  const flags = opts.caseSensitive ? "g" : "gi";
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = opts.wholeWord ? `\\b${escaped}\\b` : escaped;
  return { next: hay.replace(new RegExp(pattern, flags), replacement), count: idxs.length };
}
