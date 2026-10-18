import { test, expect } from "@playwright/test";
import { createThesis } from "./helpers";
import AxeBuilder from "@axe-core/playwright";

test("upload, ask, cited answer, exact source page and honest abstention", async ({
  page,
}) => {
  await createThesis(page, "Evidence chat test");
  await page
    .getByRole("button", { name: "Upload sources", exact: true })
    .click();
  await page
    .getByLabel("Choose source files")
    .setInputFiles(".source-test-fixtures/study.pdf");
  await expect(page.getByText("1 source saved.", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  // Return to the manuscript; Otto lives beside the editor.
  await page
    .getByRole("button", { name: "Back to editor", exact: true })
    .click();
  await page.getByRole("button", { name: "Open Otto assistant" }).click();
  await page.getByRole("checkbox", { name: /Send extracted source chunks/ }).check();
  await page
    .getByRole("textbox", { name: "Ask Otto" })
    .fill("What are the interview results?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(
    page.getByRole("article", { name: "Otto answer" }).first(),
  ).toContainText("The source identifies interview results");
  await expect(
    page.getByRole("article", { name: "Otto answer" }).first(),
  ).toContainText("Page two: interview results.");
  await expect(
    page.getByRole("status").filter({ hasText: "Response complete." }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include("#otto-panel").analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/otto-cited-answer.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "study.pdf · page 2", exact: true })
    .click();
  await expect(page.locator("canvas")).toHaveAttribute("aria-label", /page 2/i);
  await page
    .getByRole("button", { name: "Back to editor", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Ask Otto" })
    .fill("Can you explain that more?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(
    page.getByRole("article", { name: "Otto answer" }).last(),
  ).toContainText("In plain language");
  await expect(
    page.getByRole("article", { name: "Otto answer" }).last(),
  ).toContainText("Page two: interview results.");
  await page
    .getByRole("textbox", { name: "Ask Otto" })
    .fill("Which telescope observed Jupiter?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(
    page.getByRole("article", { name: "Otto answer" }).last(),
  ).toContainText("I can't find this in your documents.");
  await expect(
    page
      .getByRole("article", { name: "Otto answer" })
      .last()
      .getByRole("button", { name: "study.pdf · page 2", exact: true }),
  ).toHaveCount(0);
  await createThesis(page, "Separate project");
  await page.getByRole("button", { name: "Open Otto assistant" }).click();
  await expect(
    page.getByRole("checkbox", { name: /Send extracted source chunks/ }),
  ).not.toBeChecked();
  await page.getByRole("checkbox", { name: /Send extracted source chunks/ }).check();
  await page
    .getByRole("textbox", { name: "Ask Otto" })
    .fill("What are the interview results?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".otto-error")).toContainText(
    "No sources are uploaded for this project in this browser.",
  );
  await expect(page.getByRole("article", { name: "Otto answer" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "study.pdf · page 2", exact: true }),
  ).toHaveCount(0);
});
