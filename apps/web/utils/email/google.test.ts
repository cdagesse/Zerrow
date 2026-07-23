import { afterEach, describe, expect, it, vi } from "vitest";
import type { EmailThread } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import { GmailLabel } from "@/utils/gmail/label";
import * as gmailLabelModule from "@/utils/gmail/label";
import { GmailProvider } from "./google";

const {
  envMock,
  gmailMailMock,
  gmailDraftMock,
  gmailSignatureMock,
  gmailThreadMock,
} = vi.hoisted(() => ({
  envMock: {
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
    EMAIL_ENCRYPT_SECRET: "test-encrypt-secret",
    EMAIL_ENCRYPT_SALT: "test-encrypt-salt",
  },
  gmailMailMock: {
    draftEmail: vi.fn().mockResolvedValue({ data: { id: "draft-1" } }),
    forwardEmail: vi.fn(),
    replyToEmail: vi.fn(),
    sendEmailWithPlainText: vi.fn(),
    sendEmailWithHtml: vi.fn(),
  },
  gmailDraftMock: {
    getDraft: vi.fn(),
    deleteDraft: vi.fn(),
    sendDraft: vi.fn(),
  },
  gmailSignatureMock: {
    getGmailSignatures: vi.fn().mockResolvedValue([]),
  },
  gmailThreadMock: {
    getThreadsWithNextPageToken: vi.fn(),
    getThreadsBatch: vi.fn(),
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/gmail/mail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/gmail/mail")>();
  return { ...actual, ...gmailMailMock };
});

vi.mock("@/utils/gmail/draft", () => gmailDraftMock);

vi.mock("@/utils/gmail/signature-settings", () => gmailSignatureMock);

vi.mock("@/utils/gmail/thread", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/gmail/thread")>();
  return { ...actual, ...gmailThreadMock };
});

vi.mock("@/utils/gmail/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/gmail/client")>();
  return { ...actual, getAccessTokenFromClient: () => "test-access-token" };
});

describe("GmailProvider.getLatestMessageInThread", () => {
  afterEach(() => {
    envMock.NEXT_PUBLIC_AUTO_DRAFT_DISABLED = false;
    vi.clearAllMocks();
    gmailMailMock.draftEmail.mockResolvedValue({ data: { id: "draft-1" } });
    gmailSignatureMock.getGmailSignatures.mockResolvedValue([]);
  });

  it("returns latest non-draft message when newest message is a draft", async () => {
    const provider = new GmailProvider({} as any);

    vi.spyOn(provider, "getThread").mockResolvedValue(
      createThread([
        createParsedMessage({
          id: "non-draft-older",
          internalDate: "1000",
        }),
        createParsedMessage({
          id: "draft-newest",
          internalDate: "3000",
          labelIds: [GmailLabel.DRAFT],
        }),
        createParsedMessage({
          id: "non-draft-newest",
          internalDate: "2000",
        }),
      ]),
    );

    const latest = await provider.getLatestMessageInThread("thread-1");

    expect(latest?.id).toBe("non-draft-newest");
  });

  it("returns null when all thread messages are drafts", async () => {
    const provider = new GmailProvider({} as any);

    vi.spyOn(provider, "getThread").mockResolvedValue(
      createThread([
        createParsedMessage({
          id: "draft-1",
          internalDate: "1000",
          labelIds: [GmailLabel.DRAFT],
        }),
        createParsedMessage({
          id: "draft-2",
          internalDate: "2000",
          labelIds: [GmailLabel.DRAFT],
        }),
      ]),
    );

    const latest = await provider.getLatestMessageInThread("thread-1");

    expect(latest).toBeNull();
  });

  it("no-ops draftEmail when auto-drafting is disabled", async () => {
    envMock.NEXT_PUBLIC_AUTO_DRAFT_DISABLED = true;
    const provider = new GmailProvider({} as any);

    const result = await provider.draftEmail(
      createParsedMessage({
        id: "message-1",
        internalDate: "1000",
      }),
      { content: "Follow up" },
      "user@example.com",
    );

    expect(result).toEqual({ draftId: "" });
    expect(gmailMailMock.draftEmail).not.toHaveBeenCalled();
  });

  it("passes Gmail send-as aliases when creating drafts", async () => {
    gmailSignatureMock.getGmailSignatures.mockResolvedValue([
      {
        email: "user@example.com",
        signature: "",
        isDefault: true,
      },
      {
        email: "alias@example.com",
        signature: "",
        isDefault: false,
      },
    ]);
    const provider = new GmailProvider({} as any);
    const message = createParsedMessage({
      id: "message-1",
      internalDate: "1000",
    });
    const args = { content: "Follow up" };

    const result = await provider.draftEmail(message, args, "user@example.com");

    expect(result).toEqual({ draftId: "draft-1" });
    expect(gmailMailMock.draftEmail).toHaveBeenCalledWith(
      expect.anything(),
      message,
      args,
      ["user@example.com", "alias@example.com"],
    );
  });
});

describe("GmailProvider.getSentMessageIds", () => {
  it("filters sent messages with Gmail labelIds and second-accurate date bounds", async () => {
    const list = vi.fn().mockResolvedValue({
      data: {
        messages: [{ id: "message-1", threadId: "thread-1" }],
        nextPageToken: "next-page",
      },
    });
    const provider = new GmailProvider({
      users: { messages: { list } },
    } as any);

    const result = await provider.getSentMessageIds({
      maxResults: 50,
      after: new Date("2026-03-31T12:00:00.000Z"),
      before: new Date("2026-04-30T17:00:00.000Z"),
      pageToken: "page-1",
    });

    expect(list).toHaveBeenCalledWith({
      userId: "me",
      maxResults: 50,
      q: "after:1774958399 before:1777568401",
      pageToken: "page-1",
      labelIds: [GmailLabel.SENT],
    });
    expect(result).toEqual({
      messages: [{ id: "message-1", threadId: "thread-1" }],
      nextPageToken: "next-page",
    });
  });

  it("omits the Gmail search query when no date range is provided", async () => {
    const list = vi.fn().mockResolvedValue({ data: { messages: [] } });
    const provider = new GmailProvider({
      users: { messages: { list } },
    } as any);

    await provider.getSentMessageIds({
      maxResults: 50,
    });

    expect(list).toHaveBeenCalledWith({
      userId: "me",
      maxResults: 50,
      q: undefined,
      pageToken: undefined,
      labelIds: [GmailLabel.SENT],
    });
  });
});

describe("GmailProvider.updateDraft", () => {
  it("keeps Gmail threading metadata and MIME-encodes non-ASCII subjects", async () => {
    const update = vi.fn().mockResolvedValue({ data: {} });
    const provider = new GmailProvider({
      users: { drafts: { update } },
    } as any);
    const subject = "Re: ok but you NEED to share your secrets 👀🔍";

    gmailDraftMock.getDraft.mockResolvedValueOnce(
      createParsedMessage({
        id: "draft-message-1",
        internalDate: "1000",
        threadId: "thread-special",
        subject,
        labelIds: [GmailLabel.DRAFT],
        headers: {
          to: "sender@example.com",
          subject,
          "in-reply-to": "<original@example.com>",
          references: "<root@example.com> <original@example.com>",
        },
      }),
    );

    await provider.updateDraft("r-123", {
      subject,
      messageHtml: "<p>Edited response.</p>",
    });

    expect(update).toHaveBeenCalledWith({
      userId: "me",
      id: "r-123",
      requestBody: {
        message: {
          threadId: "thread-special",
          raw: expect.any(String),
        },
      },
    });

    const raw = update.mock.calls[0]?.[0]?.requestBody?.message?.raw;
    const decodedMessage = decodeBase64Url(raw);

    expect(decodedMessage).toContain("Subject: =?UTF-8?");
    expect(decodedMessage).toContain("In-Reply-To: <original@example.com>");
    expect(decodedMessage).toContain(
      "References: <root@example.com> <original@example.com>",
    );
    expect(decodedMessage).toContain("Edited response.");
  });
});

describe("GmailProvider.getLabels", () => {
  it("returns visible user labels by default", async () => {
    vi.spyOn(gmailLabelModule, "getLabels").mockResolvedValue([
      {
        id: "label-visible",
        name: "Visible",
        type: "user",
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
      {
        id: "label-hidden",
        name: "Hidden",
        type: "user",
        labelListVisibility: "labelHide",
        messageListVisibility: "show",
      },
      {
        id: "SYSTEM",
        name: "Inbox",
        type: "system",
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    ] as any);

    const provider = new GmailProvider({} as any);

    await expect(provider.getLabels()).resolves.toEqual([
      {
        id: "label-visible",
        name: "Visible",
        type: "user",
        threadsTotal: undefined,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    ]);
  });

  it("can include hidden user labels for hidden-aware callers", async () => {
    vi.spyOn(gmailLabelModule, "getLabels").mockResolvedValue([
      {
        id: "label-visible",
        name: "Visible",
        type: "user",
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
      {
        id: "label-hidden",
        name: "Hidden",
        type: "user",
        labelListVisibility: "labelHide",
        messageListVisibility: "show",
      },
    ] as any);

    const provider = new GmailProvider({} as any);

    await expect(provider.getLabels({ includeHidden: true })).resolves.toEqual([
      {
        id: "label-visible",
        name: "Visible",
        type: "user",
        threadsTotal: undefined,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
      {
        id: "label-hidden",
        name: "Hidden",
        type: "user",
        threadsTotal: undefined,
        labelListVisibility: "labelHide",
        messageListVisibility: "show",
      },
    ]);
  });
});

describe("GmailProvider.getThreadsWithQuery inbox visibility", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function setupThreads(
    threads: { id: string; messageLabelIds: string[][] }[],
  ) {
    gmailThreadMock.getThreadsWithNextPageToken.mockResolvedValue({
      threads: threads.map((thread) => ({ id: thread.id })),
      nextPageToken: undefined,
    });
    gmailThreadMock.getThreadsBatch.mockResolvedValue(
      threads.map((thread) => createRawGmailThread(thread)),
    );
  }

  it("drops threads whose only inbox message is trashed, spam, or a draft", async () => {
    setupThreads([
      {
        id: "trashed",
        messageLabelIds: [[GmailLabel.INBOX, GmailLabel.TRASH]],
      },
      { id: "spam", messageLabelIds: [[GmailLabel.INBOX, GmailLabel.SPAM]] },
      { id: "draft", messageLabelIds: [[GmailLabel.INBOX, GmailLabel.DRAFT]] },
      { id: "live", messageLabelIds: [[GmailLabel.INBOX]] },
    ]);
    const provider = new GmailProvider({} as any);

    const result = await provider.getThreadsWithQuery({
      query: { type: "inbox" },
    });

    expect(result.threads.map((thread) => thread.id)).toEqual(["live"]);
  });

  it("keeps a thread with a live inbox message even if another message is trashed", async () => {
    setupThreads([
      {
        id: "mixed",
        messageLabelIds: [
          [GmailLabel.INBOX, GmailLabel.TRASH],
          [GmailLabel.INBOX],
        ],
      },
    ]);
    const provider = new GmailProvider({} as any);

    const result = await provider.getThreadsWithQuery({
      query: { type: "inbox" },
    });

    expect(result.threads.map((thread) => thread.id)).toEqual(["mixed"]);
  });

  it("filters the default view (no type) since it lists the inbox", async () => {
    setupThreads([
      {
        id: "trashed",
        messageLabelIds: [[GmailLabel.INBOX, GmailLabel.TRASH]],
      },
      { id: "live", messageLabelIds: [[GmailLabel.INBOX]] },
    ]);
    const provider = new GmailProvider({} as any);

    const result = await provider.getThreadsWithQuery({ query: {} });

    expect(result.threads.map((thread) => thread.id)).toEqual(["live"]);
  });

  it("does not filter the archive view where messages have no inbox label", async () => {
    setupThreads([{ id: "archived", messageLabelIds: [[GmailLabel.SENT]] }]);
    const provider = new GmailProvider({} as any);

    const result = await provider.getThreadsWithQuery({
      query: { type: "archive" },
    });

    expect(result.threads.map((thread) => thread.id)).toEqual(["archived"]);
  });

  it("does not filter label views", async () => {
    setupThreads([
      { id: "labeled", messageLabelIds: [["Label_1", GmailLabel.TRASH]] },
    ]);
    const provider = new GmailProvider({} as any);

    const result = await provider.getThreadsWithQuery({
      query: { type: "label", labelId: "Label_1" },
    });

    expect(result.threads.map((thread) => thread.id)).toEqual(["labeled"]);
  });

  it("does not filter search results", async () => {
    setupThreads([{ id: "searched", messageLabelIds: [[GmailLabel.TRASH]] }]);
    const provider = new GmailProvider({} as any);

    const result = await provider.getThreadsWithQuery({
      query: { q: "invoice" },
    });

    expect(result.threads.map((thread) => thread.id)).toEqual(["searched"]);
  });

  it("passes the requested format through to the thread batch", async () => {
    setupThreads([{ id: "live", messageLabelIds: [[GmailLabel.INBOX]] }]);
    const provider = new GmailProvider({} as any);

    await provider.getThreadsWithQuery({
      query: { type: "inbox" },
      format: "metadata",
    });

    expect(gmailThreadMock.getThreadsBatch).toHaveBeenCalledWith(
      ["live"],
      "test-access-token",
      expect.anything(),
      { format: "metadata" },
    );
  });

  it("parses metadata-format threads (headers only, no body) without losing list fields", async () => {
    setupThreads([{ id: "live", messageLabelIds: [[GmailLabel.INBOX]] }]);
    const provider = new GmailProvider({} as any);

    const result = await provider.getThreadsWithQuery({
      query: { type: "inbox" },
      format: "metadata",
    });

    const message = result.threads[0]?.messages[0];
    expect(message?.headers.from).toBe("sender@example.com");
    expect(message?.headers.subject).toBe("Subject");
    expect(message?.labelIds).toContain(GmailLabel.INBOX);
    expect(message?.textHtml).toBeFalsy();
  });
});

// Raw Gmail API thread shape with header-only (metadata format) payloads
function createRawGmailThread({
  id,
  messageLabelIds,
}: {
  id: string;
  messageLabelIds: string[][];
}) {
  return {
    id,
    historyId: "history-1",
    snippet: "snippet",
    messages: messageLabelIds.map((labelIds, index) => ({
      id: `${id}-message-${index}`,
      threadId: id,
      labelIds,
      snippet: "snippet",
      historyId: "history-1",
      internalDate: "1700000000000",
      payload: {
        mimeType: "text/html",
        headers: [
          { name: "From", value: "sender@example.com" },
          { name: "To", value: "recipient@example.com" },
          { name: "Subject", value: "Subject" },
          { name: "Date", value: "Mon, 01 Jan 2026 00:00:00 +0000" },
          { name: "Message-ID", value: `<${id}-message-${index}@example.com>` },
        ],
      },
    })),
  };
}

function createThread(messages: ParsedMessage[]): EmailThread {
  return {
    id: "thread-1",
    messages,
    snippet: "snippet",
  };
}

function createParsedMessage({
  id,
  internalDate,
  threadId = "thread-1",
  labelIds,
  subject = "Subject",
  headers,
}: {
  id: string;
  internalDate: string;
  threadId?: string;
  labelIds?: string[];
  subject?: string;
  headers?: Partial<ParsedMessage["headers"]>;
}): ParsedMessage {
  return {
    id,
    threadId,
    labelIds,
    snippet: "",
    historyId: "history-1",
    inline: [],
    headers: {
      subject,
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "Mon, 01 Jan 2026 00:00:00 +0000",
      ...headers,
    },
    subject,
    date: "Mon, 01 Jan 2026 00:00:00 +0000",
    internalDate,
    textPlain: "",
    textHtml: "",
  };
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}
