import { describe, expect, it } from "vitest";
import { mergeContactActivity } from "@/utils/contacts";

describe("mergeContactActivity", () => {
  const activity = (overrides = {}) => ({
    email: "jane@example.com",
    name: "Jane Doe",
    receivedCount: 5,
    sentCount: 2,
    lastInteractionAt: new Date("2026-07-01"),
    ...overrides,
  });

  it("returns activity entries as unsaved contacts when nothing is saved", () => {
    const result = mergeContactActivity({ activity: [activity()], saved: [] });

    expect(result).toEqual([
      {
        email: "jane@example.com",
        name: "Jane Doe",
        company: null,
        notes: null,
        receivedCount: 5,
        sentCount: 2,
        lastInteractionAt: new Date("2026-07-01"),
        isSaved: false,
      },
    ]);
  });

  it("saved details override derived ones, matching case-insensitively", () => {
    const result = mergeContactActivity({
      activity: [activity()],
      saved: [
        {
          email: "Jane@Example.com",
          name: "Jane D.",
          company: "Acme",
          notes: "Met at conf",
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "Jane D.",
      company: "Acme",
      notes: "Met at conf",
      isSaved: true,
      receivedCount: 5,
    });
  });

  it("keeps the derived name when the saved contact has none", () => {
    const result = mergeContactActivity({
      activity: [activity()],
      saved: [
        { email: "jane@example.com", name: null, company: null, notes: "hi" },
      ],
    });

    expect(result[0].name).toBe("Jane Doe");
  });

  it("appends saved contacts that have no email activity", () => {
    const result = mergeContactActivity({
      activity: [activity()],
      saved: [
        {
          email: "New@Person.com",
          name: "New Person",
          company: null,
          notes: null,
        },
      ],
    });

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      email: "new@person.com",
      name: "New Person",
      receivedCount: 0,
      lastInteractionAt: null,
      isSaved: true,
    });
  });
});
