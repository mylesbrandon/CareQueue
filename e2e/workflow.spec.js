import { test, expect } from "@playwright/test";

const session = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("carequeue-demo-v1")));
async function publish(page) {
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await page.getByRole("button", { name: "Publish assignments", exact: true }).click();
  await page.getByRole("button", { name: "Confirm publish", exact: true }).click();
  await expect(page.locator(".stage-pill")).toHaveText("published");
}

test("reasoned override, fresh review, locked publish, reload, history and next run", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Publish assignments", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("button", { name: "Save override" })).toBeDisabled();
  await modal.getByRole("textbox", { name: "Override reason" }).fill("Supervisor requested follow-up before assignment.");
  await modal.getByRole("button", { name: "Save override" }).click();
  await expect(page.locator(".stage-pill")).toHaveText("draft");
  await expect(page.getByRole("button", { name: "Publish assignments", exact: true })).toBeDisabled();
  const before = (await session(page)).workspaces.adult.workflow;
  expect(before.overrideLog).toHaveLength(1);
  expect(before.plan.overflow.some((item) => item.reasonCode === "manual-hold")).toBeTruthy();
  await publish(page);
  await expect(page.getByRole("button", { name: "Remove", exact: true }).first()).toBeDisabled();
  const published = (await session(page)).workspaces.adult.workflow;
  await page.reload();
  await expect(page.locator(".stage-pill")).toHaveText("published");
  await page.getByRole("link", { name: "Assignment Runs", exact: true }).click();
  await expect(page.getByText("Published runs and audit history")).toBeVisible();
  await page.locator("tbody .link-button").first().click();
  await expect(page.getByRole("dialog")).toContainText("Supervisor requested follow-up before assignment.");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Adult Ops", exact: true }).click();
  await page.getByRole("button", { name: "Start next run" }).click();
  const next = (await session(page)).workspaces.adult.workflow;
  const committed = new Set(published.plan.assignments.map((item) => item.caseId));
  expect(next.plan.assignments.every((item) => !committed.has(item.caseId))).toBeTruthy();
  expect((await session(page)).history).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("choose a destination nurse for a held overflow case", async ({ page }) => {
  await page.goto("/");
  const firstRow = page.locator(".assignment-table tbody tr").first();
  const member = await firstRow.locator(".link-button").textContent();
  await firstRow.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("textbox", { name: "Override reason" }).fill("Hold for demonstration.");
  await page.getByRole("button", { name: "Save override" }).click();
  await page.getByRole("searchbox", { name: "Search overflow" }).fill(member);
  const overflowRow = page.locator(".workflow-side tbody tr").filter({ hasText: member });
  await overflowRow.getByRole("button", { name: "Assign", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox", { name: "Eligible nurse" })).toBeVisible();
  const nurseId = await dialog.getByRole("combobox").inputValue();
  expect(nurseId).toBeTruthy();
  await dialog.getByRole("textbox", { name: "Override reason" }).fill("Confirmed eligible destination after review.");
  await dialog.getByRole("button", { name: "Save override" }).click();
  const run = (await session(page)).workspaces.adult.workflow;
  expect(run.overrideLog).toHaveLength(2);
  expect(run.overrideLog[1].toNurseId).toBe(nurseId);
  expect(run.plan.manualHolds).toHaveLength(0);
});

test("roster changes invalidate review, affect routing and persist across navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  const original = await session(page);
  const nurse = original.workspaces.adult.workflow.plan.assignmentGroups[0].nurse;
  await page.getByRole("link", { name: "Teams & Nurses", exact: true }).click();
  await page.getByRole("button", { name: `Active status for ${nurse.nurseName}`, exact: true }).click();
  await page.getByRole("link", { name: "Adult Ops", exact: true }).click();
  await expect(page.getByText("Roster changed.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish assignments", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Generate assignments", exact: true }).click();
  const changed = (await session(page)).workspaces.adult;
  expect(changed.workflow.plan.assignments.some((item) => item.nurseId === nurse.nurseId)).toBeFalsy();
  expect(changed.nurses.find((item) => item.nurseId === nurse.nurseId).active).toBe(false);
  await page.reload();
  await expect(page.locator(".stage-pill")).toHaveText("draft");
});

test("empty history and metrics are honest, specialty publishes and reset clears records", async ({ page }) => {
  await page.goto("/runs");
  await expect(page.getByText("No published runs yet.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Metrics / Trends", exact: true }).click();
  await expect(page.getByText("Publish a run in this workspace", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Ped / Newborn / NICU Ops", exact: true }).click();
  await publish(page);
  await page.getByRole("link", { name: "Metrics / Trends", exact: true }).click();
  await page.getByRole("combobox", { name: "Workspace" }).selectOption("specialty");
  await expect(page.getByRole("heading", { name: "Coverage across published runs" })).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Reset demo data", exact: true }).click();
  await page.getByRole("button", { name: "Confirm reset", exact: true }).click();
  expect((await session(page)).history).toHaveLength(0);
});

test("invalid roster tokens are rejected before they can corrupt the workflow", async ({ page }) => {
  await page.goto("/teams");
  const input = page.getByRole("textbox", { name: "Licenses for Naomi Price", exact: true });
  await input.fill("INVALID");
  await input.press("Tab");
  await expect(page.getByText("Roster change was not saved:", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Adult Ops", exact: true }).click();
  await expect(page.locator(".stage-pill")).toHaveText("draft");
});

test("corrupt browser storage recovers to a usable demo with an explanation", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("carequeue-demo-v1", "invalid-json"));
  await page.goto("/");
  await expect(page.getByText("Saved data could not be loaded.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate assignments", exact: true })).toBeVisible();
});

test("mobile viewport stays within screen and dialogs support keyboard dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Inspect", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
