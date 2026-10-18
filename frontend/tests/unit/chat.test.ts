import { describe, expect, it } from "vitest";
import { chatHttpErrorMessage, recentChatContext } from "../../lib/chat";

describe("chat API error messages", () => {
  it("explains how to restart when a legacy backend rejects the request", () => {
    expect(
      chatHttpErrorMessage(
        "Invalid question or source library. Use this project's sources and at most 2 million characters.",
      ),
    ).toContain("backend is out of date");
  });
});

describe("recent Otto chat context", () => {
  it("keeps only two exchanges and bounds long replies before sending", () => {
    const history = [
      { role: "user" as const, content: "old question" },
      { role: "assistant" as const, content: "old answer" },
      { role: "user" as const, content: "recent question" },
      { role: "assistant" as const, content: "x".repeat(2600) },
      { role: "user" as const, content: "follow-up" },
      { role: "assistant" as const, content: "latest answer" },
    ];

    const context = recentChatContext(history);

    expect(context).toHaveLength(4);
    expect(context.map((turn) => turn.content)).toEqual([
      "recent question",
      "x".repeat(2500),
      "follow-up",
      "latest answer",
    ]);
  });
});
