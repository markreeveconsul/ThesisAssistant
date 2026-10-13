import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createThesis } from "./helpers";
import path from "node:path";

const fixture = (name: string) => path.resolve(".source-test-fixtures", name);

test("real upload, PDF page rendering, DOCX/TXT locators, persistence, project filtering and deletion", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await createThesis(page, "Source reading project");
  const projectUrl = page.url();
  await page
    .getByRole("button", { name: "Upload sources", exact: true })
    .click();
  await page
    .getByLabel("Choose source files")
    .setInputFiles([
      fixture("study.pdf"),
      fixture("study.docx"),
      fixture("notes.txt"),
    ]);
  await expect(page.getByText("3 sources saved.", { exact: true })).toBeVisible(
    { timeout: 60000 },
  );
  const row = (name: string) =>
    page.locator(".source-rows>li").filter({ hasText: name });
  await row("study.pdf")
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "study.pdf, page 1" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".pdf-preview").getByRole("status")).toHaveCount(0);
  expect(
    await page
      .locator(".pdf-canvas canvas")
      .evaluate((canvas: HTMLCanvasElement) => canvas.width),
  ).toBeGreaterThan(100);
  await expect(page.locator(".extracted-text")).toContainText(
    "Page one: study aim.",
  );
  await page.getByRole("button", { name: "Next location" }).click();
  await expect(page.locator(".extracted-text")).toContainText(
    "Page two: interview results.",
  );
  await expect(
    page.getByRole("img", { name: "study.pdf, page 2" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.getByText("125%", { exact: true })).toBeVisible();
  await page.getByLabel("Search source text").fill("study aim");
  await page.getByRole("button", { name: "Find next" }).click();
  await expect(page.getByLabel("Go to page")).toHaveValue("1");
  await page.screenshot({
    path: "test-results/source-pdf-reader.png",
    fullPage: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Back to sources", exact: true })
    .click();
  await row("study.docx")
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await expect(page.getByLabel("Go to paragraph")).toHaveValue("1");
  await page.getByRole("button", { name: "Next location" }).click();
  await expect(page.locator(".extracted-text")).toContainText(
    "Table findings.",
  );
  await page
    .getByRole("button", { name: "Back to sources", exact: true })
    .click();
  await row("notes.txt")
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await page.getByRole("button", { name: "Next location" }).click();
  await expect(page.getByLabel("Go to line")).toHaveValue("3");
  await page.getByRole("button", { name: "Next location" }).click();
  await expect(page.locator(".extracted-text")).toContainText(
    "<script>untrusted()</script>",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Upload sources", exact: true })
    .click();
  await expect(page.locator(".source-rows>li")).toHaveCount(3);
  await page
    .getByLabel("Choose source files")
    .setInputFiles(fixture("study.pdf"));
  await expect(page.locator(".source-errors")).toContainText(
    "already in this project's source library",
  );
  await page.screenshot({
    path: "test-results/source-library-populated.png",
    fullPage: true,
  });
  await createThesis(page, "Separate project");
  await expect(page.getByText("Sources (0)", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Upload sources", exact: true })
    .click();
  await expect(page.locator(".source-rows>li")).toHaveCount(0);
  await page.goto(projectUrl);
  await page
    .getByRole("button", { name: "Upload sources", exact: true })
    .click();
  await row("study.pdf")
    .getByRole("button", { name: "Delete study.pdf", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete source", exact: true })
    .click();
  await expect(page.locator(".source-rows>li")).toHaveCount(2);
  const counts = await page.evaluate(
    () =>
      new Promise<number[]>((resolve, reject) => {
        const request = indexedDB.open("thesa-sources-v1");
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(["sources", "documents"]);
          const a = tx.objectStore("sources").count(),
            b = tx.objectStore("documents").count();
          tx.oncomplete = () => {
            db.close();
            resolve([a.result, b.result]);
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  expect(counts).toEqual([2, 2]);
  expect(errors).toEqual([]);
});

test("scanned, corrupt, unsupported and offline uploads fail honestly; retry works", async ({
  page,
}) => {
  await createThesis(page);
  await page
    .getByRole("button", { name: "Upload sources", exact: true })
    .click();
  await page
    .getByLabel("Choose source files")
    .setInputFiles([fixture("scan.pdf"), fixture("broken.pdf")]);
  await expect(page.locator(".source-errors")).toContainText(
    "OCR is not supported",
  );
  await expect(page.locator(".source-errors")).toContainText("corrupt");
  await expect(page.locator(".source-rows>li")).toHaveCount(0);
  await page.getByLabel("Choose source files").setInputFiles({
    name: "bad.html",
    mimeType: "text/html",
    buffer: Buffer.from("test"),
  });
  await expect(page.locator(".source-errors")).toContainText(
    "Choose a PDF, DOCX or UTF-8 TXT",
  );
  await page.route("**:8012/parse", (route) =>
    route.abort("connectionrefused"),
  );
  await page
    .getByLabel("Choose source files")
    .setInputFiles(fixture("notes.txt"));
  await expect(page.locator(".source-errors")).toContainText(
    "Cannot reach the document service",
  );
  await page.unroute("**:8012/parse");
  await page
    .getByLabel("Choose source files")
    .setInputFiles(fixture("notes.txt"));
  await expect(
    page.getByText("1 source saved.", { exact: true }),
  ).toBeVisible();
});

test("storage failures roll back the whole source; mobile PDF reader fits", async ({
  page,
}) => {
  await createThesis(page);
  await page
    .getByRole("button", { name: "Upload sources", exact: true })
    .click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    let fail = true;
    IDBObjectStore.prototype.add = function (
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === "documents" && fail) {
        fail = false;
        throw new DOMException("Storage full", "QuotaExceededError");
      }
      return original.call(this, value, key);
    };
  });
  await page
    .getByLabel("Choose source files")
    .setInputFiles(fixture("study.pdf"));
  await expect(page.locator(".source-errors")).toContainText(
    "Browser storage is full",
  );
  await expect(page.locator(".source-rows>li")).toHaveCount(0);
  await page
    .getByLabel("Choose source files")
    .setInputFiles(fixture("study.pdf"));
  await expect(
    page.getByText("1 source saved.", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator(".source-rows")
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "study.pdf, page 1" }),
  ).toBeVisible();
  await expect(page.locator(".pdf-preview").getByRole("status")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/source-reader-mobile.png",
    fullPage: true,
  });
});
