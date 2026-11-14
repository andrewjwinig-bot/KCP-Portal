import { describe, expect, it } from "vitest";
import { TENANT_TEMPLATES, dueTemplates, renderTenantEmail, templateById } from "./templates";
import { scheduleSubject } from "./schedule";

const ids = (d: ReturnType<typeof dueTemplates>) => d.map((x) => x.template.id);

describe("tenant email schedule", () => {
  it("prompts Winter Tips from Nov 1, due Nov 15, until it is sent", () => {
    expect(ids(dueTemplates("2026-10-31", {}))).not.toContain("winter-tips");
    const d = dueTemplates("2026-11-11", {});
    expect(ids(d)).toContain("winter-tips");
    expect(d.find((x) => x.template.id === "winter-tips")).toMatchObject({ dueISO: "2026-11-15", overdue: false });
    expect(dueTemplates("2026-11-20", {}).find((x) => x.template.id === "winter-tips")?.overdue).toBe(true);
    expect(ids(dueTemplates("2026-11-20", { "winter-tips": "2026-11-12T15:00:00Z" }))).not.toContain("winter-tips");
  });

  it("a send last season does not count for this one", () => {
    expect(ids(dueTemplates("2026-11-05", { "winter-tips": "2025-11-14T15:00:00Z" }))).toContain("winter-tips");
  });

  it("stops prompting 60 days after the reminder starts", () => {
    expect(ids(dueTemplates("2027-01-15", {}))).not.toContain("winter-tips");
  });

  it("prompts Summer Tips from May 15, due Jun 1", () => {
    const d = dueTemplates("2027-05-20", {});
    expect(d.find((x) => x.template.id === "summer-tips")).toMatchObject({ dueISO: "2027-06-01" });
  });

  it("never prompts a weather alert", () => {
    const weather = TENANT_TEMPLATES.filter((t) => t.kind === "weather").map((t) => t.id);
    for (const day of ["2026-01-15", "2026-06-01", "2026-11-11"]) {
      expect(ids(dueTemplates(day, {})).filter((i) => weather.includes(i))).toEqual([]);
    }
  });
});

describe("tenant email", () => {
  it("is the graphic and a live button, nothing else", () => {
    const { html, text } = renderTenantEmail(templateById("winter-tips")!);
    expect(html).toContain("/site/email/tenant/winter-tips-top.png");
    expect(html).toContain("/site/email/tenant/winter-tips-bottom.png");
    expect(html).toContain('href="https://kormancommercial.com/site/maintenance"');
    expect(html).toContain("Submit a request");
    expect(html).not.toMatch(/Dear|Thank you/);
    expect(text).toContain("https://kormancommercial.com/site/maintenance");
  });
});

describe("building notices", () => {
  it("prompts for window cleaning in spring AND fall, fire alarm in April", () => {
    expect(dueTemplates("2027-03-05", {}).map((d) => d.template.id)).toContain("window-cleaning");
    expect(dueTemplates("2027-09-20", {}).find((d) => d.template.id === "window-cleaning")?.dueISO).toBe("2027-10-01");
    // a spring send does not clear the fall prompt
    expect(dueTemplates("2027-09-20", { "window-cleaning": "2027-03-10T12:00:00Z" }).map((d) => d.template.id)).toContain("window-cleaning");
    expect(dueTemplates("2027-04-05", {}).find((d) => d.template.id === "fire-alarm")?.dueISO).toBe("2027-04-20");
  });
  it("names the buildings in an outage subject", () => {
    const spec = templateById("power-outage")!.work!;
    expect(scheduleSubject(spec, [{ building: "4050", cells: ["Today, 2 PM", ""] }])).toBe("Power Outage: Building 5");
  });
  it("lays a text column into the email", () => {
    const t = templateById("elevator")!;
    const { html } = renderTenantEmail(t, undefined, { rows: [{ building: "4060", cells: ["Main lobby", "2027-01-11", "Friday"] }], building: "4060" });
    expect(html).toContain("Main lobby");
    expect(html).toContain("Your building");
  });
});
