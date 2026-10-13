import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { createThesis, saved } from "./helpers";

test("Otto toggles and docks without losing edits; evidence viewer uses the saved draft", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await createThesis(page);
  const editor = page.getByRole("textbox", {
    name: "Chapter content",
    exact: true,
  });
  await editor.fill("Keep this paragraph while comparing evidence.");
  const before = await editor.boundingBox();
  await page.keyboard.press("Control+k");
  const panel = page.getByRole("dialog", { name: "Otto assistant" });
  await expect(panel).toBeVisible();
  await expect(page.getByRole("button", { name: "Close Otto" })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Ask Otto" })).toBeDisabled();
  await page.getByRole("button", { name: "Dock", exact: true }).click();
  await expect(page.locator(".otto-panel")).toHaveClass(/docked/);
  expect((await editor.boundingBox())!.width).toBeLessThan(before!.width);
  await expect(editor).toHaveText(
    "Keep this paragraph while comparing evidence.",
  );
  await saved(page);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open Otto assistant" }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Upload sources", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/sources-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open evidence viewer" }).click();
  await expect(page.locator(".reader-excerpt")).toHaveText(
    "Keep this paragraph while comparing evidence.",
  );
  await expect(
    page.getByRole("button", { name: "Choose a source", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/evidence-reader.png",
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
    .getByRole("button", { name: "Back to editor", exact: true })
    .click();
  await expect(editor).toHaveText(
    "Keep this paragraph while comparing evidence.",
  );
});
