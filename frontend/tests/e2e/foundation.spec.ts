import { test, expect } from "@playwright/test";
import { createThesis, saved } from "./helpers";

test("dashboard creates a five-chapter thesis and persists writing across reloads", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await createThesis(page);
  await expect(
    page.getByRole("button", {
      name: "2 Review of related literature",
      exact: true,
    }),
  ).toBeVisible();
  const content = page.getByRole("textbox", {
    name: "Chapter content",
    exact: true,
  });
  await content.fill("Feedback helps students reflect on their learning.");
  await saved(page);
  await page.reload();
  await expect(content).toContainText("Feedback helps students reflect");
  await expect(page.getByText("7 words · Browser draft")).toBeVisible();
  await page.getByRole("link", { name: "Thesa", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your theses", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Learning and feedback/ }).click();
  await expect(content).toContainText("Feedback helps students reflect");
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "test-results/editor-desktop.png",
    fullPage: true,
  });
});

test("formatting, find/replace, tables and footnotes are real editor operations", async ({
  page,
}) => {
  await createThesis(page);
  const content = page.getByRole("textbox", {
    name: "Chapter content",
    exact: true,
  });
  await content.fill("Students learn. Students compare.");
  await page.locator(".more-tools summary").click();
  await page
    .getByRole("button", { name: "Find and replace", exact: true })
    .click();
  await page.getByLabel("Find", { exact: true }).fill("Students");
  await page.getByLabel("Replace with", { exact: true }).fill("Researchers");
  await page.getByRole("button", { name: "Replace all", exact: true }).click();
  await expect(content).toContainText(
    "Researchers learn. Researchers compare.",
  );
  await page.getByRole("button", { name: "Close editor tool" }).click();
  await content.click();
  await page.keyboard.press("Control+End");
  await page
    .getByRole("button", { name: "Insert footnote", exact: true })
    .click();
  await page
    .getByLabel("Footnote text", { exact: true })
    .fill("Define engagement consistently.");
  await page
    .locator(".inline-editor-form")
    .getByRole("button", { name: "Insert footnote", exact: true })
    .click();
  await expect(page.getByRole("list", { name: "Footnotes" })).toContainText(
    "Define engagement consistently.",
  );
  await page.getByRole("button", { name: "Insert table", exact: true }).click();
  await expect(content.locator("table")).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(content.locator("table")).toBeVisible();
  await expect(page.getByRole("list", { name: "Footnotes" })).toContainText(
    "Define engagement consistently.",
  );
});

test("chapter switching flushes pending edits and chapter order survives reload", async ({
  page,
}) => {
  await createThesis(page);
  const content = page.getByRole("textbox", {
    name: "Chapter content",
    exact: true,
  });
  await content.fill("A draft typed immediately before changing chapters.");
  await page
    .getByRole("button", {
      name: "2 Review of related literature",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Chapter title", exact: true }),
  ).toHaveValue("Review of related literature");
  await page
    .getByRole("button", { name: "1 Introduction", exact: true })
    .click();
  await expect(content).toContainText("A draft typed immediately");
  await page
    .getByRole("button", { name: "Move Introduction down", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "2 Introduction", exact: true }),
  ).toBeVisible();
  await expect(content).toContainText("A draft typed immediately");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "2 Introduction", exact: true }),
  ).toBeVisible();
});

test("stale tabs cannot overwrite newer chapter content", async ({
  page,
  context,
}) => {
  await createThesis(page);
  const other = await context.newPage();
  await other.goto(page.url());
  const editor = page.getByRole("textbox", {
    name: "Chapter content",
    exact: true,
  });
  const otherEditor = other.getByRole("textbox", {
    name: "Chapter content",
    exact: true,
  });
  await expect(otherEditor).toBeVisible();
  await editor.fill("Version saved by the first tab.");
  await saved(page);
  await otherEditor.fill("Conflicting words from an older tab.");
  await expect(
    other.getByRole("alert").filter({ hasText: "This chapter changed" }),
  ).toContainText("changed in another tab");
  await expect(otherEditor).toContainText("Conflicting words");
  await page.reload();
  await expect(editor).toContainText("Version saved by the first tab.");
  await other.close({ runBeforeUnload: false });
});

test("research problem changes persist and blank projects have usable starting choices", async ({
  page,
}) => {
  await createThesis(page, "A new question", "blank");
  await expect(
    page.getByRole("heading", {
      name: "Start your first section",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Write from scratch/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Chapter content", exact: true }),
  ).toBeVisible();
  await page.locator(".research-problem summary").click();
  await page
    .getByRole("textbox", { name: "Research problem", exact: true })
    .fill("How do students act on feedback?");
  await page
    .getByRole("button", { name: "Save research problem", exact: true })
    .click();
  await expect(page.locator(".research-problem summary")).toContainText(
    "How do students act on feedback?",
  );
  await page.reload();
  await expect(page.locator(".research-problem summary")).toContainText(
    "How do students act on feedback?",
  );
});

test("theme, command palette, focus and source navigation work", async ({
  page,
}) => {
  await createThesis(page);
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await expect(
    page.getByRole("dialog", {
      name: "Otto assistant",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open Otto assistant" }).click();
  await expect(
    page.getByRole("dialog", { name: "Otto assistant" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dock", exact: true }).click();
  await expect(page.locator(".otto-panel")).toHaveClass(/docked/);
  await page.getByRole("button", { name: "Float", exact: true }).click();
  await page.screenshot({
    path: "test-results/otto-floating.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open Otto assistant" }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Use dark theme", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Control+Shift+k");
  await page.getByRole("textbox", { name: "Search commands" }).fill("sources");
  await page.getByRole("button", { name: "Show sources", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Sources/ })).toBeVisible();
  await page.screenshot({
    path: "test-results/sources-thesa.png",
    fullPage: true,
  });
  await expect(page.getByLabel("Choose source files")).toHaveAttribute(
    "accept",
    ".pdf,.docx,.txt",
  );
  await page
    .getByRole("button", { name: "Back to editor", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/editor-dark.png",
    fullPage: true,
  });
});

test("mobile editor and panel navigation fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createThesis(page);
  const mobile = page.getByRole("navigation", { name: "Mobile workspace" });
  await expect(
    page.getByRole("textbox", { name: "Chapter content", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mobile.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(
    page.getByRole("dialog", {
      name: "Otto assistant",
      exact: true,
    }),
  ).toBeVisible();
  await mobile.getByRole("button", { name: "Document", exact: true }).click();
  await page.screenshot({
    path: "test-results/editor-mobile.png",
    fullPage: true,
  });
});

test("account setup remains explicit and invalid recovery links stay on site", async ({
  page,
}) => {
  await page.goto("/auth");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/auth-thesa.png",
    fullPage: true,
  });
  await page.goto("/auth/callback?code=invalid&next=https://evil.example");
  await expect(page).toHaveURL(/\/auth\?error=link$/);
  await expect(
    page.getByRole("alert").filter({ hasText: "This sign-in link" }),
  ).toContainText("invalid or expired");
});

test("restored unsaved drafts survive a failed save and another reload", async ({
  page,
}) => {
  await createThesis(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("thesisdesk-drafts-v1")!);
    const section = data.sections[0];
    section.title = "Recovered introduction";
    section.content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Keep this recovered draft." }],
        },
      ],
    };
    sessionStorage.setItem(
      `thesisdesk-recovery:${section.project_id}:${section.id}`,
      JSON.stringify(section),
    );
  });
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "thesisdesk-drafts-v1")
        throw new DOMException("Storage full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Chapter content", exact: true }),
  ).toContainText("Keep this recovered draft.");
  await expect(
    page.getByRole("button", { name: "Retry save", exact: true }),
  ).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Restore draft", exact: true }),
  ).toBeVisible();
});
