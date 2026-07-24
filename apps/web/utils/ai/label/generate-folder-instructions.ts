import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import { createGenerateObject } from "@/utils/llms";
import { getEmailListPrompt, getUserInfoPrompt } from "@/utils/ai/helpers";

const schema = z.object({
  instructions: z
    .string()
    .describe(
      "Filing instructions describing which emails belong in this folder, written so an AI assistant can classify future incoming emails. 1-3 sentences.",
    ),
  senderPatterns: z
    .array(z.string())
    .describe(
      'Email addresses or @domain patterns whose emails ALWAYS belong in this folder (e.g. "billing@stripe.com", "@newsletter.example.com"). Only include senders where every sampled email from them fits the folder. Empty array if none.',
    ),
});
export type GenerateFolderInstructionsResult = z.infer<typeof schema>;

const MAX_SAMPLE_EMAILS = 15;

export async function aiGenerateFolderInstructions({
  emailAccount,
  labelName,
  emails,
}: {
  emailAccount: EmailAccountWithAI;
  labelName: string;
  emails: EmailForLLM[];
}): Promise<GenerateFolderInstructionsResult | null> {
  if (!emails.length) return null;

  const system = `You are an AI assistant that writes email filing rules by studying the emails a user has already placed in a folder.

<instructions>
The user has an email folder named "${labelName}". You are given a sample of emails currently in that folder.

Your task:
1. Infer what this folder is FOR — the common purpose, topic, or sender type that unites the sampled emails.
2. Write concise filing instructions (1-3 sentences) that an AI assistant will use to decide whether FUTURE incoming emails belong in this folder. Describe the kind of email, not the specific sampled emails.
3. Identify sender patterns that always belong here: exact addresses for automated senders (receipts, notifications), or @domain patterns when everything from that domain fits. Be conservative — only include a sender if all of their sampled emails fit the folder's purpose, and never include generic personal domains like @gmail.com.

Write the instructions in the same language the sampled emails predominantly use.
The folder name is a strong hint but the email content is the ground truth — if they disagree, trust the content.
</instructions>

${getUserInfoPrompt({ emailAccount })}

<outputFormat>
Respond with a JSON object with the following fields:
- "instructions": string — the filing instructions.
- "senderPatterns": string[] — email addresses or @domain patterns that always belong in this folder. Empty array if none qualify.
</outputFormat>`;

  const prompt = `Analyze these emails from the "${labelName}" folder:

<sample_emails>
${getEmailListPrompt({
  messages: emails,
  messageMaxLength: 500,
  maxMessages: MAX_SAMPLE_EMAILS,
})}
</sample_emails>`;

  const modelOptions = getModelForUseCase(
    emailAccount.user,
    LlmUseCase.GenerateFolderInstructions,
  );

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Generate folder instructions",
    modelOptions,
    promptHardening: { trust: "untrusted", level: "compact" },
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema,
  });

  return aiResponse.object;
}
