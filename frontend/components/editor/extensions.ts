import { Node, mergeAttributes } from "@tiptap/core";
import { Image } from "@tiptap/extension-image";
import { isSafeImage } from "@/lib/document";

export const SafeImage = Image.extend({
  parseHTML() {
    return [
      {
        tag: "img[src]",
        getAttrs: (element) =>
          isSafeImage((element as HTMLElement).getAttribute("src") ?? "")
            ? null
            : false,
      },
    ];
  },
}).configure({
  allowBase64: false,
  HTMLAttributes: { referrerpolicy: "no-referrer", loading: "lazy" },
});
export const Footnote = Node.create({
  name: "footnote",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { id: { default: "" }, text: { default: "" } };
  },
  parseHTML() {
    return [];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "sup",
      mergeAttributes(HTMLAttributes, { "data-footnote": node.attrs.id }),
      [
        "a",
        {
          href: "#footnote-" + node.attrs.id,
          title: String(node.attrs.text),
          "aria-label": "Footnote: " + String(node.attrs.text),
        },
        "†",
      ],
    ];
  },
});
