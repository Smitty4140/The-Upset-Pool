import { expect, test, type Page } from "@playwright/test";

const user = {
  id: "leagueless-test-user",
  username: "Riley Test",
  email: "riley.test@example.com",
  firstName: "Riley",
  lastName: "Test",
  profileImageUrl: null,
  totalPoints: 0,
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:00:00.000Z",
};

type SessionState = {
  authenticated: boolean;
  logoutAttempts: number;
};

async function mockLeaguelessSession(page: Page): Promise<SessionState> {
  const state: SessionState = { authenticated: true, logoutAttempts: 0 };

  await page.route("**/api/auth/user", async (route) => {
    if (state.authenticated) {
      await route.fulfill({ json: user });
      return;
    }

    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Unauthorized" }),
    });
  });

  // Signed in, but a member of no leagues: the dead-end this screen exists for.
  await page.route("**/api/user/leagues", (route) => route.fulfill({ json: [] }));

  await page.route("**/api/logout", async (route) => {
    state.logoutAttempts += 1;

    if (state.logoutAttempts === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Temporary session error" }),
      });
      return;
    }

    state.authenticated = false;
    await route.fulfill({ json: { message: "Logged out successfully" } });
  });

  return state;
}

test("a signed-in user with no leagues can sign out of the join screen", async ({
  page,
}) => {
  const state = await mockLeaguelessSession(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByText("Join a League", { exact: true })).toBeVisible();
  // No header renders here, so the page-level control is the only way out.
  await expect(page.getByRole("button", { name: "Open main menu" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `Account menu for ${user.username}` }),
  ).toHaveCount(0);
  await expect(page.getByText(`Signed in as ${user.email}`)).toBeVisible();

  const signOut = page.getByRole("button", { name: "Sign Out" });
  await expect(signOut).toBeVisible();

  await signOut.press("Enter");
  await expect(page.getByText("Couldn't sign out", { exact: true })).toBeVisible();
  await expect(signOut).toBeEnabled();

  await signOut.press("Enter");
  await expect.poll(() => state.logoutAttempts).toBe(2);
  await expect(page.getByRole("heading", { name: "NFL Upset Pool" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign Out" })).toHaveCount(0);
});

test("the join-league route inside the app does not duplicate the header sign-out", async ({
  page,
}) => {
  await mockLeaguelessSession(page);
  await page.unroute("**/api/user/leagues");
  await page.route("**/api/user/leagues", (route) =>
    route.fulfill({ json: [{ id: 1, name: "Browser Test League", sportType: "nfl" }] }),
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/join-league");

  await expect(page.getByText("Join a League", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Account menu for ${user.username}` }),
  ).toBeVisible();
  await expect(page.locator("main").getByRole("button", { name: "Sign Out" })).toHaveCount(0);
});
