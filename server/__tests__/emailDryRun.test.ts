import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  sendEmail,
  isDryRun,
  getDryRunOutbox,
  clearDryRunOutbox,
  EMAIL_TEMPLATE_SAMPLES,
  EMAIL_TEMPLATE_KEYS,
} from "../email";

describe("EMAIL_DRY_RUN", () => {
  const original = process.env.EMAIL_DRY_RUN;

  beforeEach(() => {
    clearDryRunOutbox();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (original === undefined) delete process.env.EMAIL_DRY_RUN;
    else process.env.EMAIL_DRY_RUN = original;
    clearDryRunOutbox();
    vi.restoreAllMocks();
  });

  it("is off unless explicitly enabled", () => {
    delete process.env.EMAIL_DRY_RUN;
    expect(isDryRun()).toBe(false);
    process.env.EMAIL_DRY_RUN = "false";
    expect(isDryRun()).toBe(false);
    process.env.EMAIL_DRY_RUN = "";
    expect(isDryRun()).toBe(false);
  });

  it("accepts the usual truthy spellings", () => {
    for (const value of ["1", "true", "TRUE", "yes"]) {
      process.env.EMAIL_DRY_RUN = value;
      expect(isDryRun()).toBe(true);
    }
  });

  it("reports success and records the message instead of calling Brevo", async () => {
    process.env.EMAIL_DRY_RUN = "true";
    // No BREVO_API_KEY needed — the dry run short-circuits before the transport.
    delete process.env.BREVO_API_KEY;

    const ok = await sendEmail({ to: "dana@example.com", subject: "Week 3 is open", html: "<p>hi</p>" });

    expect(ok).toBe(true);
    expect(getDryRunOutbox()).toEqual([
      expect.objectContaining({ to: "dana@example.com", subject: "Week 3 is open" }),
    ]);
  });

  it("still refuses to send for real when Brevo is unconfigured", async () => {
    delete process.env.EMAIL_DRY_RUN;
    delete process.env.BREVO_API_KEY;

    const ok = await sendEmail({ to: "dana@example.com", subject: "Week 3 is open", html: "<p>hi</p>" });

    expect(ok).toBe(false);
    expect(getDryRunOutbox()).toHaveLength(0);
  });
});

describe("template preview registry", () => {
  it("covers both scheduled member emails in single- and multi-league form", () => {
    expect(EMAIL_TEMPLATE_KEYS).toEqual(
      expect.arrayContaining([
        "picks-live",
        "picks-live-multi",
        "one-hour-warning",
        "one-hour-warning-multi",
      ])
    );
  });

  it("renders every template with a subject, HTML and text part", () => {
    for (const key of EMAIL_TEMPLATE_KEYS) {
      const content = EMAIL_TEMPLATE_SAMPLES[key]("Commish");
      expect(content.subject, key).toBeTruthy();
      expect(content.html, key).toContain("<html>");
      expect(content.text, key).toBeTruthy();
    }
  });

  it("renders the pick-board deep link in the two emails that drive picks", () => {
    for (const key of ["picks-live", "one-hour-warning"]) {
      const content = EMAIL_TEMPLATE_SAMPLES[key]("Commish");
      expect(content.html, key).toContain("tab=spreads");
      expect(content.text, key).toContain("tab=spreads");
    }
  });
});
