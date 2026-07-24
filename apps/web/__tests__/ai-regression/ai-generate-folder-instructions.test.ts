import { describe, expect, test } from "vitest";
import { aiGenerateFolderInstructions } from "@/utils/ai/label/generate-folder-instructions";
import { getEmail, getEmailAccount } from "@/__tests__/helpers";
import { judgeBinary } from "@/__tests__/eval/judge";
// Run with: pnpm test-ai ai-regression/ai-generate-folder-instructions

const isAiTest = process.env.RUN_AI_TESTS === "true";
const TIMEOUT = 15_000;

describe.runIf(isAiTest)("aiGenerateFolderInstructions", () => {
  test(
    "generates filing instructions and sender patterns from receipt emails",
    async () => {
      const emails = [
        getEmail({
          from: "receipts@stripe.com",
          subject: "Your receipt from Acme Inc #1234",
          content:
            "Receipt from Acme Inc. Amount paid: $49.00. Payment method: Visa ending 4242.",
        }),
        getEmail({
          from: "receipts@stripe.com",
          subject: "Your receipt from Beta LLC #5678",
          content:
            "Receipt from Beta LLC. Amount paid: $120.00. Payment method: Visa ending 4242.",
        }),
        getEmail({
          from: "billing@vercel.com",
          subject: "Invoice INV-9012 for your Vercel team",
          content:
            "Your invoice for the Pro plan is attached. Total: $20.00. Thanks for your business.",
        }),
      ];

      const result = await aiGenerateFolderInstructions({
        emailAccount: getEmailAccount(),
        labelName: "Receipts",
        emails,
      });

      expect(result).toBeTruthy();
      expect(result?.instructions.length).toBeGreaterThan(10);

      const verdict = await judgeBinary({
        input: "Sample emails were payment receipts and invoices.",
        output: result?.instructions ?? "",
        criterion:
          "The instructions describe filing payment receipts, invoices, or billing emails (not the specific sampled companies only), suitable for classifying future emails.",
      });
      expect(verdict.pass).toBe(true);
    },
    TIMEOUT,
  );

  test(
    "returns null for an empty folder",
    async () => {
      const result = await aiGenerateFolderInstructions({
        emailAccount: getEmailAccount(),
        labelName: "Receipts",
        emails: [],
      });

      expect(result).toBeNull();
    },
    TIMEOUT,
  );

  test(
    "throws on an invalid API key",
    async () => {
      const emailAccount = getEmailAccount();

      await expect(
        aiGenerateFolderInstructions({
          emailAccount: {
            ...emailAccount,
            user: {
              ...emailAccount.user,
              aiProvider: "openai",
              aiModel: "gpt-4o-mini",
              aiApiKey: "invalid-api-key",
            },
          },
          labelName: "Receipts",
          emails: [getEmail({ content: "Receipt for $10" })],
        }),
      ).rejects.toThrow();
    },
    TIMEOUT,
  );
});
