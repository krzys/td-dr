// Start tags of a text, counted the way the dev UI counts them (adapters/dev/ui/link.js scanTags):
// comments (Outlook conditionals too) and doctypes are skipped, so are the insides of raw-text elements.
const RAW = new Set(["script", "style", "textarea", "title"]);

export type StartTag = { tag: string; start: number; end: number };

export const startTags = (text: string): StartTag[] => {
  const lower = text.toLowerCase();
  const tags: StartTag[] = [];
  const re = /<!--(?:>|->)|<!--[\s\S]*?-->|<[!?][^>]*>|<([a-zA-Z][^\s/>]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!m[1]) continue;
    const tag = m[1].toLowerCase();
    let j = m.index + m[0].length;
    let quote = "";
    for (; j < text.length; j++) {
      const c = text[j]!;
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    const end = Math.min(j + 1, text.length);
    tags.push({ tag, start: m.index, end });
    re.lastIndex = end;
    if (RAW.has(tag)) {
      const close = lower.indexOf(`</${tag}`, end);
      if (close >= 0) re.lastIndex = close;
    }
  }
  return tags;
};
