/** Wiki-style [[Note Title]] links and backlinks. */

const LINK_RE = /\[\[([^[\]]{1,160})\]\]/g;

export function extractWikiLinks(content: string | null | undefined): string[] {
  if (!content) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(LINK_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const title = m[1].trim();
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    out.push(title);
  }
  return out;
}

export function replaceWikiLink(content: string, fromTitle: string, toTitle: string): string {
  const from = fromTitle.trim();
  if (!from) return content;
  return content.replace(LINK_RE, (all, inner: string) => {
    if (inner.trim().toLowerCase() === from.toLowerCase()) return `[[${toTitle}]]`;
    return all;
  });
}

export type NoteLike = { id: string; title: string; content?: string | null };

export function resolveWikiLink(notes: NoteLike[], title: string): NoteLike | undefined {
  const key = title.trim().toLowerCase();
  return notes.find((n) => n.title.trim().toLowerCase() === key);
}

export function backlinksTo(notes: NoteLike[], target: NoteLike): NoteLike[] {
  const key = target.title.trim().toLowerCase();
  return notes.filter((n) => {
    if (n.id === target.id) return false;
    return extractWikiLinks(n.content || "").some((t) => t.toLowerCase() === key);
  });
}

export function markdownExport(title: string, content: string, tags: string[] = []): string {
  const tagLine = tags.length ? `tags: ${tags.join(", ")}\n` : "";
  return `---\ntitle: ${title}\n${tagLine}---\n\n${content.trim()}\n`;
}
