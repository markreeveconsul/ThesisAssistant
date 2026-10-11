"use client";
import { useEffect, useRef, useState } from "react";
import type { Section } from "@/lib/workspace";
import type { DocumentNode } from "@/lib/document";
import { SaveQueue, type SaveState } from "@/lib/save-queue";
import { saveLocal } from "@/lib/local-workspace";
import { saveChapter } from "@/app/editor-actions";

export function useChapterSave(
  section: Section,
  local: boolean,
  onSaved: (section: Section) => void,
) {
  const [status, setStatus] = useState<SaveState>("saved"),
    [error, setError] = useState("");
  const [recovery, setRecovery] = useState<Section | null>(null);
  const latest = useRef(section),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedCallback = useRef(onSaved);
  savedCallback.current = onSaved;
  const recoveryKey =
    "thesisdesk-recovery:" + section.project_id + ":" + section.id;
  const queue = useRef<SaveQueue | null>(null);
  if (!queue.current)
    queue.current = new SaveQueue(
      section.revision,
      async (next) =>
        local ? saveLocal(next, next.revision) : saveChapter(next),
      (state, message) => {
        setStatus(state);
        setError(message ?? "");
        if (state === "saved") {
          try {
            sessionStorage.removeItem(recoveryKey);
          } catch {}
        }
      },
      (next) => {
        latest.current = { ...latest.current, revision: next.revision };
        savedCallback.current(next);
      },
    );
  const controller = queue.current;
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(recoveryKey);
      if (raw) {
        const candidate = JSON.parse(raw) as Section;
        if (
          candidate.id === section.id &&
          (candidate.title !== section.title ||
            JSON.stringify(candidate.content) !==
              JSON.stringify(section.content))
        )
          setRecovery(candidate);
      }
    } catch {}
    const unload = (event: BeforeUnloadEvent) => {
      if (controller.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const save = () => {
      void controller.flush();
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("online", save);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("online", save);
    };
  }, [controller, recoveryKey, section.id]);
  function change(content: DocumentNode, title: string) {
    const next = {
      ...latest.current,
      content,
      title,
      revision: controller.version,
    };
    latest.current = next;
    controller.enqueue(next);
    try {
      sessionStorage.setItem(recoveryKey, JSON.stringify(next));
    } catch {
      setError(
        "Recovery storage is unavailable. Keep this tab open until the save completes.",
      );
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void controller.flush();
    }, 700);
  }
  function downloadDraft(value = latest.current) {
    const blob = new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "thesisdesk-chapter-backup.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return {
    status,
    error,
    recovery,
    hideRecovery: () => setRecovery(null),
    clearRecovery: () => {
      setRecovery(null);
      sessionStorage.removeItem(recoveryKey);
    },
    change,
    flush: () => controller.flush(),
    retry: () => controller.retry(),
    downloadDraft,
    revision: controller.version,
  };
}
