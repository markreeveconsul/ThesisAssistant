import { z } from "zod";

export type DocumentNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: DocumentNode[];
};
export const emptyDocument: DocumentNode = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
const nodeTypes = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "hardBreak",
  "horizontalRule",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "image",
  "footnote",
]);
const markTypes = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
]);
export function isSafeImage(src: string) {
  try {
    return new URL(src).protocol === "https:";
  } catch {
    return false;
  }
}
export function validateDocument(value: unknown): value is DocumentNode {
  if (
    !value ||
    typeof value !== "object" ||
    JSON.stringify(value).length > 1_000_000
  )
    return false;
  let nodes = 0;
  function visit(input: unknown, depth: number): boolean {
    if (!input || typeof input !== "object" || depth > 30 || ++nodes > 20000)
      return false;
    const node = input as DocumentNode;
    if (
      !nodeTypes.has(node.type) ||
      (node.text !== undefined && typeof node.text !== "string")
    )
      return false;
    if (node.type === "text" && typeof node.text !== "string") return false;
    if (node.type === "image" && !isSafeImage(String(node.attrs?.src ?? "")))
      return false;
    if (
      node.type === "footnote" &&
      (typeof node.attrs?.text !== "string" ||
        String(node.attrs?.text).length > 2000 ||
        !/^[a-zA-Z0-9-]+$/.test(String(node.attrs?.id ?? "")))
    )
      return false;
    if (
      node.marks &&
      (!Array.isArray(node.marks) ||
        !node.marks.every(
          (mark) =>
            markTypes.has(mark.type) &&
            (mark.type !== "link" ||
              /^https?:\/\//i.test(String(mark.attrs?.href))),
        ))
    )
      return false;
    return (
      node.content === undefined ||
      (Array.isArray(node.content) &&
        node.content.every((child) => visit(child, depth + 1)))
    );
  }
  return (value as DocumentNode).type === "doc" && visit(value, 0);
}
export const documentSchema = z.custom<DocumentNode>(
  validateDocument,
  "This document is invalid or exceeds the chapter size limit.",
);
export function documentText(node: DocumentNode): string {
  if (node.type === "text") return node.text ?? "";
  const separator = [
    "doc",
    "bulletList",
    "orderedList",
    "table",
    "tableRow",
  ].includes(node.type)
    ? "\n"
    : "";
  return node.content?.map(documentText).join(separator) ?? "";
}
export function wordCount(node: DocumentNode): number {
  return (
    documentText(node).match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)
      ?.length ?? 0
  );
}
export const chapterTitles = [
  "Introduction",
  "Review of related literature",
  "Methodology",
  "Results and discussion",
  "Conclusions",
];
