import { test, expect } from "@playwright/test";

test("workspace is an honest preview with working navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Literature review", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Preview only · changes are not saved"),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Ask your sources" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Sources", exact: false })
    .filter({ hasText: /^Sources/ })
    .click();
  await expect(page.getByText("Your evidence belongs here.")).toBeVisible();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(page.getByText("Keep useful ideas close.")).toBeVisible();
  await page
    .getByRole("button", { name: "Outline", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "01 Introduction" }).click();
  await expect(
    page.getByRole("heading", { name: "Introduction", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "02 Literature review" }).click();
  await page.screenshot({
    path: "test-results/workspace-light.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("focus mode, keyboard resize, theme and command search work", async ({
  page,
}) => {
  await page.goto("/");
  const handle = page.getByRole("separator", { name: "Resize assistant" });
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(handle).toHaveAttribute("aria-valuenow", "346");
  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await expect(
    page.getByRole("complementary", {
      name: "Research assistant",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("complementary", {
      name: "Research assistant",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("dialog", { name: "Command palette" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search commands" }).fill("dark");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "test-results/workspace-dark.png",
    fullPage: true,
  });
});

test("creating a preview project never claims cloud persistence", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Project title" })
    .fill("Urban learning");
  await page
    .getByRole("button", { name: "Create preview project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Urban learning", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "no data has been saved",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Literature review", exact: true }),
  ).toBeVisible();
});

test("account setup and invalid recovery links are explicit", async ({
  page,
}) => {
  await page.goto("/auth");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Account setup is pending.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/auth.png", fullPage: true });
  await page.goto("/auth/callback?code=invalid&next=https://evil.example");
  await expect(page).toHaveURL(/\/auth\?error=link$/);
  await expect(
    page.getByRole("alert").filter({ hasText: "This sign-in link" }),
  ).toContainText("invalid or expired");
});

test("mobile reading and panel switching fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Literature review", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("complementary", {
      name: "Research assistant",
      exact: true,
    }),
  ).toHaveCount(0);
  const mobile = page.getByRole("navigation", { name: "Mobile workspace" });
  await mobile.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(
    page.getByRole("complementary", {
      name: "Research assistant",
      exact: true,
    }),
  ).toBeVisible();
  await mobile.getByRole("button", { name: "Document", exact: true }).click();
  await page.screenshot({
    path: "test-results/workspace-mobile.png",
    fullPage: true,
  });
  await mobile.getByRole("button", { name: "Outline", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Project navigation" }),
  ).toBeVisible();
});

test("unavailable functionality and offline state have actionable feedback", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "Review the structure of my RRL",
      exact: false,
    })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "RRL review is not connected yet",
  );
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await context.setOffline(true);
  await expect(page.getByRole("status")).toContainText("You’re offline");
  await context.setOffline(false);
  await expect(page.getByText("You’re offline.", { exact: false })).toHaveCount(
    0,
  );
});
