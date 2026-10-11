import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
for (const theme of ["light", "dark"]) {
  test(
    "workspace has no detected WCAG AA violations in " + theme + " theme",
    async ({ page }) => {
      await page.addInitScript(
        (value) => localStorage.setItem("thesisdesk-theme", value),
        theme,
      );
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(result.violations).toEqual([]);
    },
  );
}
test("auth and project dialog have no detected WCAG AA violations", async ({
  page,
}) => {
  await page.goto("/auth");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
