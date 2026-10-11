import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { createThesis } from "./helpers";
for (const theme of ["light", "dark"]) {
  test(
    "dashboard and editor have no detected WCAG AA violations in " + theme,
    async ({ page }) => {
      await page.addInitScript(
        (value) => localStorage.setItem("thesisdesk-theme", value),
        theme,
      );
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({
        path: "test-results/dashboard-" + theme + ".png",
        fullPage: true,
      });
      await createThesis(page);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        result.violations.map((item) => ({
          id: item.id,
          nodes: item.nodes.map((node) => ({
            target: node.target,
            summary: node.failureSummary,
          })),
        })),
      ).toEqual([]);
    },
  );
}
