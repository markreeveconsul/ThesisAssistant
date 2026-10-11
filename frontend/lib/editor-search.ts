import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
export function findText(
  doc: ProseMirrorNode,
  query: string,
): { from: number; to: number }[] {
  if (!query) return [];
  const matches: { from: number; to: number }[] = [];
  doc.descendants((node, position) => {
    if (!node.isTextblock) return;
    // textBetween preserves one position for inline atoms; matches may cross marks.
    const text = node.textBetween(0, node.content.size, "", "\ufffc");
    let start = 0;
    while (start <= text.length - query.length) {
      const index = text
        .toLocaleLowerCase()
        .indexOf(query.toLocaleLowerCase(), start);
      if (index < 0) break;
      matches.push({
        from: position + 1 + index,
        to: position + 1 + index + query.length,
      });
      start = index + query.length;
    }
    return false;
  });
  return matches;
}
