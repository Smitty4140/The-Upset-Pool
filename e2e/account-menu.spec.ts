import { expect, test, type Page } from "@playwright/test";

const user = {
  id: "browser-test-user",
  username: "Jamie Test",
  email: "jamie.test@example.com",
  firstName: "Jamie",
  lastName: "Test",
  profileImageUrl: null,
  totalPoints: 0,
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:00:00.000Z",
};

type SessionState = {
  authenticated: boolean;
  logoutAttempts: number;
  profileUpdates: Array<Record<string, string>>;
};

async function mockAuthenticatedSession(page: Page): Promise<SessionState> {
  const state: SessionState = {
    authenticated: true,
    logoutAttempts: 0,
    profileUpdates: [],
  };

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

  await page.route("**/api/user/leagues", (route) =>
    route.fulfill({
      json: [{ id: 1, name: "Browser Test League", sportType: "nfl" }],
    }),
  );

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

  await page.route("**/api/auth/profile", async (route) => {
    state.profileUpdates.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({ json: { ...user } });
  });

  return state;
}

async function openDesktopAccountMenu(page: Page) {
  const accountMenu = page.locator(
    `button[aria-label="Account menu for ${user.username}"]`,
  );

  await expect(accountMenu).toBeVisible();
  await expect(accountMenu).toHaveAttribute("aria-expanded", "false");
  await accountMenu.click();
  await expect(accountMenu).toHaveAttribute("aria-expanded", "true");
  return accountMenu;
}

test("desktop account menu supports profile navigation and a failed sign-out retry", async ({
  page,
}) => {
  const state = await mockAuthenticatedSession(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rules");

  const desktopAccountMenu = page.getByRole("button", {
    name: `Account menu for ${user.username}`,
  });
  await expect(desktopAccountMenu).toBeVisible();
  await expect(desktopAccountMenu.getByText("J", { exact: true })).toBeVisible();

  await openDesktopAccountMenu(page);
  await expect(page.getByRole("menuitem", { name: "Profile" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sign Out" })).toBeVisible();

  await page.getByRole("menuitem", { name: "Profile" }).press("Enter");
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();

  await page.goto("/rules");
  await openDesktopAccountMenu(page);
  await page.getByRole("menuitem", { name: "Sign Out" }).press("Enter");

  await expect(page.getByText("Couldn't sign out", { exact: true })).toBeVisible();
  await expect(
    page.locator(`button[aria-label="Account menu for ${user.username}"]`),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menuitem", { name: "Sign Out" })).toBeEnabled();
  await page.getByRole("menuitem", { name: "Sign Out" }).press("Enter");

  await expect.poll(() => state.logoutAttempts).toBe(2);
  await expect(page.getByRole("heading", { name: "NFL Upset Pool" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Account menu for ${user.username}` }),
  ).toHaveCount(0);
});

test("mobile hamburger account area keeps email private and recovers from sign-out failure", async ({
  page,
}) => {
  const state = await mockAuthenticatedSession(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/rules");

  const menuButton = page.getByRole("button", { name: "Open main menu" });
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await menuButton.press("Enter");
  await expect(
    page.getByRole("button", { name: "Close main menu" }),
  ).toHaveAttribute("aria-expanded", "true");

  const mobileNavigation = page.locator("#mobile-navigation");
  await expect(mobileNavigation.getByText(user.username)).toBeVisible();
  await expect(mobileNavigation.getByText(user.email)).toHaveCount(0);
  await expect(mobileNavigation.getByText("Profile", { exact: true })).toBeVisible();
  await expect(mobileNavigation.getByRole("button", { name: "Sign Out" })).toBeVisible();

  await mobileNavigation.getByRole("link", { name: "Profile" }).press("Enter");
  await expect(page).toHaveURL(/\/profile$/);
  await expect(mobileNavigation).toHaveCount(0);

  await page.getByRole("button", { name: "Open main menu" }).press("Enter");
  await page.getByRole("button", { name: "Sign Out" }).press("Enter");
  await expect(page.getByText("Couldn't sign out", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign Out" })).toBeEnabled();

  await page.getByRole("button", { name: "Sign Out" }).press("Enter");
  await expect.poll(() => state.logoutAttempts).toBe(2);
  await expect(page.getByRole("heading", { name: "NFL Upset Pool" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open main menu" })).toHaveCount(0);
});

test("profile editing retains the email and provides no page-level sign-out controls", async ({
  page,
}) => {
  const state = await mockAuthenticatedSession(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/profile");

  const profileContent = page.locator("main");
  await expect(profileContent.getByText("Default Username", { exact: true })).toHaveCount(2);
  await expect(profileContent.getByText(user.username, { exact: true }).first()).toBeVisible();
  await expect(profileContent.getByText(user.email, { exact: true })).toHaveCount(2);
  await expect(profileContent.getByText(/notification/i)).toHaveCount(0);
  await expect(profileContent.getByRole("button", { name: /sign out/i })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit Profile" }).press("Enter");
  await expect(page.getByLabel("Default Username")).toHaveValue(user.username);
  await expect(page.getByLabel("Email Address")).toHaveValue(user.email);

  await page.getByRole("button", { name: "Change profile image" }).press("Enter");
  await expect(page.getByRole("dialog", { name: "Update Profile Image" })).toBeVisible();
  await page.getByLabel("Image URL").fill("https://example.com/jamie-updated.png");
  await page.getByRole("button", { name: "Done" }).press("Enter");
  await expect(page.getByRole("dialog", { name: "Update Profile Image" })).toHaveCount(0);

  await page.getByRole("button", { name: "Save Changes" }).press("Enter");
  await expect.poll(() => state.profileUpdates).toEqual([
    {
      username: user.username,
      email: user.email,
      profileImageUrl: "https://example.com/jamie-updated.png",
    },
  ]);
});