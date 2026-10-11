"use client";
import { useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Quote,
  Undo2,
  Redo2,
  Table2,
  Search,
  ImagePlus,
  Footprints,
  X,
} from "lucide-react";
import { findText } from "@/lib/editor-search";
import { isSafeImage } from "@/lib/document";
export function EditorTools({ editor }: { editor: Editor }) {
  const [tool, setTool] = useState<"find" | "image" | "footnote" | null>(null),
    [find, setFind] = useState(""),
    [replacement, setReplacement] = useState(""),
    [message, setMessage] = useState("");
  function replaceAll() {
    const matches = findText(editor.state.doc, find);
    const chain = editor.chain();
    [...matches]
      .reverse()
      .forEach((match) =>
        chain.insertContentAt(
          match,
          replacement ? { type: "text", text: replacement } : [],
        ),
      );
    chain.run();
    setMessage(matches.length + " replacements.");
  }
  return (
    <>
      <div className="editor-toolbar" aria-label="Document formatting">
        <select
          aria-label="Text style"
          value={
            editor.isActive("heading", { level: 1 })
              ? "1"
              : editor.isActive("heading", { level: 2 })
                ? "2"
                : editor.isActive("heading", { level: 3 })
                  ? "3"
                  : "p"
          }
          onChange={(event) => {
            if (event.target.value === "p")
              editor.chain().focus().setParagraph().run();
            else
              editor
                .chain()
                .focus()
                .toggleHeading({
                  level: Number(event.target.value) as 1 | 2 | 3,
                })
                .run();
          }}
        >
          <option value="p">Normal text</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>
        {[
          {
            name: "Bold",
            Icon: Bold,
            active: editor.isActive("bold"),
            run: () => editor.chain().focus().toggleBold().run(),
          },
          {
            name: "Italic",
            Icon: Italic,
            active: editor.isActive("italic"),
            run: () => editor.chain().focus().toggleItalic().run(),
          },
          {
            name: "Underline",
            Icon: Underline,
            active: editor.isActive("underline"),
            run: () => editor.chain().focus().toggleUnderline().run(),
          },
          {
            name: "Bullet list",
            Icon: List,
            active: editor.isActive("bulletList"),
            run: () => editor.chain().focus().toggleBulletList().run(),
          },
          {
            name: "Numbered list",
            Icon: ListOrdered,
            active: editor.isActive("orderedList"),
            run: () => editor.chain().focus().toggleOrderedList().run(),
          },
          {
            name: "Block quote",
            Icon: Quote,
            active: editor.isActive("blockquote"),
            run: () => editor.chain().focus().toggleBlockquote().run(),
          },
        ].map(({ name, Icon, active, run }) => (
          <button
            key={name}
            aria-label={name}
            title={name}
            aria-pressed={active}
            onClick={run}
          >
            <Icon size={16} />
          </button>
        ))}
        <button
          aria-label="Insert table"
          title="Insert table"
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          <Table2 size={16} />
        </button>
        <button
          aria-label="Insert image"
          title="Insert image"
          onClick={() => setTool(tool === "image" ? null : "image")}
        >
          <ImagePlus size={16} />
        </button>
        <button
          aria-label="Insert footnote"
          title="Insert footnote"
          onClick={() => setTool(tool === "footnote" ? null : "footnote")}
        >
          <Footprints size={16} />
        </button>
        <button
          aria-label="Find and replace"
          title="Find and replace"
          onClick={() => setTool(tool === "find" ? null : "find")}
        >
          <Search size={16} />
        </button>
        <button
          aria-label="Undo"
          title="Undo"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={16} />
        </button>
        <button
          aria-label="Redo"
          title="Redo"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={16} />
        </button>
      </div>
      {editor.isActive("table") && (
        <div className="table-tools">
          <button onClick={() => editor.chain().focus().addRowAfter().run()}>
            Add row
          </button>
          <button onClick={() => editor.chain().focus().addColumnAfter().run()}>
            Add column
          </button>
          <button onClick={() => editor.chain().focus().deleteRow().run()}>
            Delete row
          </button>
          <button onClick={() => editor.chain().focus().deleteColumn().run()}>
            Delete column
          </button>
          <button onClick={() => editor.chain().focus().deleteTable().run()}>
            Remove table
          </button>
        </div>
      )}
      {tool && (
        <div className="editor-tool-panel">
          <button
            className="tool-close icon-button"
            aria-label="Close editor tool"
            onClick={() => {
              setTool(null);
              setMessage("");
            }}
          >
            <X size={16} />
          </button>
          {tool === "find" ? (
            <div className="find-fields">
              <label>
                Find
                <input
                  value={find}
                  onChange={(event) => setFind(event.target.value)}
                />
              </label>
              <label>
                Replace with
                <input
                  value={replacement}
                  onChange={(event) => setReplacement(event.target.value)}
                />
              </label>
              <button
                className="secondary"
                disabled={!find}
                onClick={() => {
                  const matches = findText(editor.state.doc, find);
                  if (matches[0])
                    editor.chain().focus().setTextSelection(matches[0]).run();
                  setMessage(matches.length + " matches.");
                }}
              >
                Find
              </button>
              <button
                className="secondary"
                disabled={!find}
                onClick={replaceAll}
              >
                Replace all
              </button>
            </div>
          ) : (
            <form
              className="inline-editor-form"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget),
                  value = String(data.get("value") ?? "").trim();
                if (!value) return;
                if (tool === "image") {
                  if (!isSafeImage(value)) {
                    setMessage("Use an HTTPS image URL.");
                    return;
                  }
                  editor
                    .chain()
                    .focus()
                    .setImage({
                      src: value,
                      alt: String(data.get("alt") ?? ""),
                    })
                    .run();
                } else
                  editor
                    .chain()
                    .focus()
                    .insertContent({
                      type: "footnote",
                      attrs: { id: crypto.randomUUID(), text: value },
                    })
                    .run();
                setTool(null);
                setMessage("");
              }}
            >
              <label>
                {tool === "image" ? "Image URL (HTTPS)" : "Footnote text"}
                <input name="value" required maxLength={2000} />
              </label>
              {tool === "image" && (
                <>
                  <label>
                    Image description
                    <input name="alt" required maxLength={300} />
                  </label>
                  <p className="field-help">
                    External images load from their host. Private file uploads
                    arrive with the source library.
                  </p>
                </>
              )}
              <button className="primary">Insert {tool}</button>
            </form>
          )}
          {message && <p role="status">{message}</p>}
        </div>
      )}
    </>
  );
}
