import { expect, test, type Page } from "@playwright/test";

// One run through all seven phases against the scripted demo.

// Finding boxes live inside Monaco's aria-hidden text layer, so find their buttons by text, not role.
const finding = (page: Page, id: number) =>
  page.locator(".zone-content .finding-box").filter({ has: page.locator(".num", { hasText: new RegExp(`^${id}$`) }) });

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

  await test.step("coding: Monaco workspace, replay, edit and save, ask about a selection, approve", async () => {
    const editor = page.locator(".editor.modified .lines-content > .view-lines");
    await expect(page.locator(".tab.on")).toContainText("limiter.ts");
    await expect(editor).toBeVisible();
    await page.locator(".why").click(); // keyboard focus outside the editor
    await page.keyboard.press("l");
    await expect(page.locator(".layer.on")).toContainText("Service");

    // limiter.ts: skip the replay, edit the file in Monaco and save it to disk.
    await expect(page.getByRole("button", { name: /Approve file/ })).toBeDisabled(); // replay first
    await page.keyboard.press("Escape");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("// edited in the cockpit\n");
    await expect(page.locator(".tab .dirty")).toBeVisible();
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.locator(".tab .dirty")).toHaveCount(0);
    const saved = await page.request.get("/api/file?repo=api&path=src/auth/limiter.ts").then((r) => r.json());
    expect(saved.working).toContain("// edited in the cockpit");

    // Select code and ask about it.
    // Double-click the word itself: a line element is as wide as the editor.
    await editor.getByText("MAX_PER_EMAIL", { exact: true }).first().dblclick();
    await page.getByRole("button", { name: /Ask about line/ }).click();
    await page.getByPlaceholder(/Why is this here/).fill("Should this come from config?");
    await page.keyboard.press("Enter");
    await expect(page.locator(".msg.user .selection-snippet")).toBeVisible();

    await page.locator(".why").click();
    await page.getByRole("button", { name: /Approve file/ }).click();

    // login.ts
    await expect(page.locator(".tab.on")).toContainText("login.ts");
    await page.locator(".why").click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Approve file/ }).click();
  });

  await test.step("pre-review inside the editor: fix one, fix one by hand, dismiss one", async () => {
    await page.getByRole("button", { name: "Start pre-review" }).click();
    await expect(page.getByText(/Reviewers at work/)).toBeVisible();
    await expect(page.locator(".finding-item")).toHaveCount(3);
    await expect(finding(page, 1)).toBeVisible();

    await finding(page, 1).locator("button", { hasText: /^Fix$/ }).click();
    await expect(page.locator(".fix-banner")).toContainText("Proposed fix for #1");
    await page.locator(".fix-banner").getByRole("button", { name: "Approve fix" }).click();
    await expect(finding(page, 1).getByText("✓ Fixed")).toBeVisible();

    await page.getByRole("button", { name: "Repository" }).click();
    await expect(page.locator(".file-tree .tree-file", { hasText: "limiter.ts" })).toBeVisible();
    await page.getByRole("button", { name: "All files" }).click();
    await expect(page.locator(".file-tree .tree-file", { hasText: "README.md" })).toBeVisible();
    await page.getByRole("button", { name: /^Findings/ }).click();

    await page.locator(".finding-item", { hasText: "req.ip" }).click();
    await finding(page, 2).locator("button", { hasText: "Fixed manually" }).click();
    await expect(finding(page, 2).getByText("✓ Fixed")).toBeVisible();
    await page.locator(".finding-item", { hasText: "Magic numbers" }).click();
    await finding(page, 3).locator("button", { hasText: "Dismiss" }).click();
  });

  await test.step("commit history: edit the PR, choose how to finish, pick a reviewer", async () => {
    await page.getByTitle(/Edit title/).click();
    await page.getByLabel("Title").fill("Lock accounts after failed logins");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".pr-head b")).toHaveText("Lock accounts after failed logins");

    await page.getByRole("radio", { name: "Commit locally" }).click();
    await expect(page.getByPlaceholder("add reviewer…")).toHaveCount(0); // reviewers only for PRs
    await page.getByRole("radio", { name: "Push and open PRs" }).click();
    await page.getByPlaceholder("add reviewer…").fill("octocat");
    await page.keyboard.press("Enter");
    await expect(page.locator(".chip")).toContainText("@octocat");

    const state = await page.request.get("/api/state").then((r) => r.json());
    expect(state.history.prs[0].title).toBe("Lock accounts after failed logins");

    await page.getByRole("button", { name: /Open 1 PR/ }).click();
  });

  await expect(page.getByText("Shipped for review")).toBeVisible();
  await expect(page.locator(".turn")).toHaveText("Done");
});
