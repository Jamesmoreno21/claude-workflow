import { expect, test, type Page } from "@playwright/test";

// One run through all seven phases against the scripted demo.

const finding = (page: Page, id: number) =>
  page.locator(".finding-box").filter({ has: page.locator(".num", { hasText: new RegExp(`^${id}$`) }) });

test("a task goes from validation to published PRs", async ({ page }) => {
  // No narration in CI: muted, and never download the Kokoro model.
  await page.addInitScript(() =>
    localStorage.setItem("wf.tts", JSON.stringify({ provider: "browser", muted: true, speed: 1, voices: {} })),
  );
  await page.goto("/");

  await test.step("validation: product then technical, by keyboard", async () => {
    await expect(page.getByText("Question 1 of 3")).toBeVisible({ timeout: 20_000 });
    for (const [n, next] of [
      ["2", "Question 2 of 3"],
      ["2", "Question 3 of 3"],
    ]) {
      await page.keyboard.press(n);
      await expect(page.getByText(next)).toBeVisible();
    }
    await page.keyboard.press("3");
    await expect(page.getByText("3/3 answered")).toBeVisible();
    await page.keyboard.press("Enter");

    await expect(page.locator(".stage-tabs .on")).toHaveText("Technical decisions");
    await page.keyboard.press("1");
    await expect(page.getByText("Question 2 of 2")).toBeVisible();
    await page.keyboard.press("2");
    await page.keyboard.press("Enter");
  });

  await test.step("plan: diagrams render and chat gets an answer", async () => {
    await expect(page.getByRole("heading", { name: "Lock accounts after repeated failed logins" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".diagram svg")).toBeVisible();

    await page.getByPlaceholder("Ask or suggest a change…").fill("Why fail open?");
    await page.keyboard.press("Enter");
    await expect(page.locator(".msg.claude")).toContainText("Why fail open?");

    await page.getByRole("button", { name: "Approve plan, start coding" }).click();
  });

  await test.step("coding: replay, layers, approve each file", async () => {
    await expect(page.locator(".tab.on")).toContainText("limiter.ts");
    await page.locator(".code").click();
    await page.keyboard.press("l");
    await expect(page.locator(".layer.on")).toContainText("Service");

    for (const file of ["limiter.ts", "login.ts"]) {
      await expect(page.locator(".tab.on")).toContainText(file);
      await expect(page.getByRole("button", { name: /Approve file/ })).toBeDisabled(); // replay first
      await page.locator(".code").click();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /Approve file/ }).click();
    }
  });

  await test.step("pre-review: fix one finding, dismiss the rest", async () => {
    await page.getByRole("button", { name: "Start pre-review" }).click();
    await expect(page.locator(".finding-item")).toHaveCount(3);

    await finding(page, 1).getByRole("button", { name: "Fix" }).click();
    await expect(finding(page, 1).getByText("Proposed fix")).toBeVisible();
    await finding(page, 1).getByRole("button", { name: "Approve fix" }).click();
    await expect(finding(page, 1).getByText("✓ Fixed")).toBeVisible();

    for (const id of [2, 3]) {
      await page.locator(".finding-item", { hasText: id === 2 ? "req.ip" : "Magic numbers" }).click();
      await finding(page, id).getByRole("button", { name: "Dismiss" }).click();
    }
  });

  await test.step("commit history: edit the PR, pick a reviewer, publish", async () => {
    await page.getByTitle(/Edit title/).click();
    await page.getByLabel("Title").fill("Lock accounts after failed logins");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".pr-head b")).toHaveText("Lock accounts after failed logins");

    await page.getByPlaceholder("add reviewer…").fill("octocat");
    await page.keyboard.press("Enter");
    await expect(page.locator(".chip")).toContainText("@octocat");

    const state = await page.request.get("/api/state").then((r) => r.json());
    expect(state.history.prs[0].title).toBe("Lock accounts after failed logins");

    await page.getByRole("button", { name: /Publish 1 PR/ }).click();
  });

  await expect(page.getByText("Shipped for review")).toBeVisible();
  await expect(page.locator(".turn")).toHaveText("Done");
});
