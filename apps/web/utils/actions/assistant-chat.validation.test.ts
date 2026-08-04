import { describe, expect, it } from "vitest";
import {
  assistantInputSchema,
  confirmAssistantUpdateRuleBody,
} from "./assistant-chat.validation";

describe("confirmAssistantUpdateRuleBody", () => {
  // The approval names which tool call is being approved, nothing more. The
  // patch comes from the tool input the server persisted, so a caller cannot
  // approve one change and have a different one applied.
  it("carries no rule payload a caller could substitute", () => {
    const result = confirmAssistantUpdateRuleBody.safeParse({
      chatId: "chat-1",
      chatMessageId: "message-1",
      toolCallId: "call-1",
      ruleName: "Factory",
      updates: { actions: [{ type: "ARCHIVE" }] },
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      chatId: "chat-1",
      chatMessageId: "message-1",
      toolCallId: "call-1",
    });
  });
});

describe("assistantInputSchema", () => {
  it("rejects blank chat and message ids", () => {
    const result = assistantInputSchema.safeParse({
      id: "   ",
      message: {
        id: "   ",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["id"] }),
        expect.objectContaining({ path: ["message", "id"] }),
      ]),
    );
  });
});
