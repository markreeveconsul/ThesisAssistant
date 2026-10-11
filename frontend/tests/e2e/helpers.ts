import { expect, type Page } from "@playwright/test";
export async function createThesis(
  page: Page,
  title = "Learning and feedback",
  structure = "five-chapter",
) {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Working title", exact: true })
    .fill(title);
  await page
    .getByRole("textbox", { name: "Research problem", exact: true })
    .fill("How does feedback influence student engagement?");
  await page
    .getByRole("combobox", { name: "Structure", exact: true })
    .selectOption(structure);
  await page
    .getByRole("button", { name: "Create thesis", exact: true })
    .click();
  await expect(page).toHaveURL(/\/project\/[a-f0-9-]+$/);
  if (structure !== "blank")
    await expect(
      page.getByRole("textbox", { name: "Chapter content", exact: true }),
    ).toBeVisible();
}
export async function saved(page: Page) {
  await expect(
    page.getByRole("status").filter({ hasText: "Saved in this browser" }),
  ).toBeVisible();
}
