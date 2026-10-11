import { describe, it, expect } from "vitest";
import {
  validateDocument,
  wordCount,
  isSafeImage,
  documentText,
  type DocumentNode,
} from "../../lib/document";
import { Schema } from "@tiptap/pm/model";
import { findText } from "../../lib/editor-search";
const doc: DocumentNode = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Learning", marks: [{ type: "bold" }] },
        { type: "text", text: " matters." },
      ],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Evidence-based ideas." }],
    },
  ],
};
describe("document boundaries", () => {
  it("counts actual words across paragraphs and preserves adjacent marks", () => {
    expect(wordCount(doc)).toBe(4);
    expect(documentText(doc)).toBe("Learning matters.\nEvidence-based ideas.");
  });
  it("rejects scripts, unsupported nodes and unsafe images", () => {
    expect(
      validateDocument({
        type: "doc",
        content: [{ type: "script", text: "bad" }],
      }),
    ).toBe(false);
    expect(
      validateDocument({
        type: "doc",
        content: [{ type: "image", attrs: { src: "javascript:alert(1)" } }],
      }),
    ).toBe(false);
    expect(isSafeImage("https://example.org/image.png")).toBe(true);
    expect(isSafeImage("data:image/svg+xml,evil")).toBe(false);
  });
  it("rejects oversized chapters and excessively deep trees", () => {
    expect(
      validateDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "x".repeat(1000001) }],
          },
        ],
      }),
    ).toBe(false);
    let node: DocumentNode = { type: "paragraph" };
    for (let i = 0; i < 35; i++) node = { type: "blockquote", content: [node] };
    expect(validateDocument({ type: "doc", content: [node] })).toBe(false);
  });
  it("accepts ordinary rich text and rejects unsafe links", () => {
    expect(validateDocument(doc)).toBe(true);
    expect(
      validateDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "link",
                marks: [{ type: "link", attrs: { href: "javascript:evil" } }],
              },
            ],
          },
        ],
      }),
    ).toBe(false);
  });
  it("finds text across formatting boundaries without crossing paragraph boundaries", () => {
    const schema = new Schema({
      nodes: {
        doc: { content: "paragraph+" },
        paragraph: { content: "text*" },
        text: {},
      },
      marks: { bold: {} },
    });
    const value = schema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "research ", marks: [{ type: "bold" }] },
            { type: "text", text: "question" },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Research question" }],
        },
      ],
    });
    expect(findText(value, "research question")).toEqual([
      { from: 1, to: 18 },
      { from: 20, to: 37 },
    ]);
    expect(findText(value, "questionResearch")).toEqual([]);
    expect(findText(value, "")).toEqual([]);
  });
});
