import { describe, expect, it, vi, beforeEach } from "vitest";

import { createChatHandler } from "./create-chat-handler";
import { BOUNDS } from "./request-bounds.js";

const streamTextMock = vi.fn();
vi.mock("ai", async () => {
  const actual = await vi.importActual("ai");
  return {
    ...actual,
    streamText: (options) => streamTextMock(options),
    convertToModelMessages: (messages) => messages,
  };
});

beforeEach(() => {
  streamTextMock.mockReset();
});

function buildToolset(overrides = {}) {
  // The handler only forwards the tools object to `streamText`; it does not
  // introspect the schema, so an opaque placeholder is sufficient for these
  // contract tests.
  const placeholder = {};
  return {
    tools: { noop_tool: placeholder },
    mutatingToolMethods: new Set(),
    ...overrides,
  };
}

function buildToolsetProvider(overrides = {}) {
  return () => buildToolset(overrides);
}

function buildRequest(body) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fakeLLM = { id: "model" };

describe("createChatHandler", () => {
  it("should call streamText with the resolved system prompt, tools, and messages", async () => {
    const fakeResponse = new Response("ok");
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () => fakeResponse,
    });

    const toolset = buildToolset();
    const handler = createChatHandler({
      llm: fakeLLM,
      getTools: () => toolset,
      getSystemPrompt: () => "system prompt",
    });

    const messages = [{ id: "u1", role: "user", parts: [] }];
    const res = await handler(buildRequest({ messages, mode: "auto" }));

    expect(res).toBe(fakeResponse);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const call = streamTextMock.mock.calls[0][0];
    expect(call.system).toBe("system prompt");
    expect(call.tools).toBe(toolset.tools);
    expect(call.messages).toEqual(messages);
  });

  it("should install a stop condition per mutating tool method", async () => {
    const fakeResponse = new Response("ok");
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () => fakeResponse,
    });

    const toolset = buildToolset({
      mutatingToolMethods: new Set([
        "transfer_hbar_tool",
        "create_topic_tool",
      ]),
    });

    const handler = createChatHandler({
      llm: fakeLLM,
      getTools: () => toolset,
      getSystemPrompt: () => "p",
    });

    await handler(buildRequest({ messages: [], mode: "human" }));
    const call = streamTextMock.mock.calls[0][0];
    // One step-count limit plus one per mutating tool method.
    expect(call.stopWhen).toHaveLength(3);
  });

  it("should forward the parsed request body to the tool and system-prompt providers", async () => {
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () => new Response("ok"),
    });

    const getTools = vi.fn(() => buildToolset());
    const getSystemPrompt = vi.fn(() => "p");

    const handler = createChatHandler({ llm: fakeLLM, getTools, getSystemPrompt });
    await handler(
      buildRequest({ messages: [], mode: "human", extra: "value" }),
    );

    expect(getTools).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "human", extra: "value" }),
    );
    expect(getSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "human", extra: "value" }),
    );
  });

  it("should short-circuit when validateRequest returns a Response", async () => {
    const handler = createChatHandler({
      llm: fakeLLM,
      getTools: buildToolsetProvider(),
      getSystemPrompt: () => "p",
      validateRequest: () =>
        new Response(JSON.stringify({ error: "nope" }), { status: 418 }),
    });

    const res = await handler(buildRequest({ messages: [] }));
    expect(res.status).toBe(418);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("should reject requests whose body is missing a messages array with 400", async () => {
    const handler = createChatHandler({
      llm: fakeLLM,
      getTools: buildToolsetProvider(),
      getSystemPrompt: () => "p",
    });
    const res = await handler(buildRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/messages/);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  // These two are the whole point of the bounds work: /api/chat is
  // unauthenticated, so an uncapped response and a hung upstream call are both
  // somebody else's bill. Both survived a mutation run until these existed.
  it("caps the output tokens on every model call", async () => {
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () => new Response("ok"),
    });
    const handler = createChatHandler({
      llm: fakeLLM,
      getTools: buildToolsetProvider(),
      getSystemPrompt: () => "p",
    });

    await handler(buildRequest({ messages: [{ role: "user", parts: [] }] }));

    const call = streamTextMock.mock.calls[0][0];
    expect(call.maxOutputTokens).toBe(BOUNDS.maxOutputTokens);
  });

  it("passes an abort signal so a hung call cannot run unbounded", async () => {
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () => new Response("ok"),
    });
    const handler = createChatHandler({
      llm: fakeLLM,
      getTools: buildToolsetProvider(),
      getSystemPrompt: () => "p",
    });

    await handler(buildRequest({ messages: [{ role: "user", parts: [] }] }));

    const call = streamTextMock.mock.calls[0][0];
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("rejects an oversized body before the model is reached", async () => {
    const handler = createChatHandler({
      llm: fakeLLM,
      getTools: buildToolsetProvider(),
      getSystemPrompt: () => "p",
    });

    const huge = { messages: [{ role: "user", text: "x".repeat(BOUNDS.maxBodyBytes + 10) }] };
    const res = await handler(buildRequest(huge));

    expect(res.status).toBe(400);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  // The route-level assertion. The limiter's own tests prove it says no; these
  // prove the ROUTE acts on that answer. Deleting the 429 branch left every
  // test green until this existed.
  it("returns 429 and never reads the body once the limiter says no", async () => {
    const handler = createChatHandler({
      llm: fakeLLM,
      getTools: buildToolsetProvider(),
      getSystemPrompt: () => "p",
      rateLimiter: { check: () => ({ ok: false, reason: "key", retryAfterMs: 4200 }) },
    });

    const res = await handler(buildRequest({ messages: [{ role: "user", parts: [] }] }));

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("5");
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("does not echo the limiter's internals to the caller", async () => {
    const handler = createChatHandler({
      llm: fakeLLM,
      getTools: buildToolsetProvider(),
      getSystemPrompt: () => "p",
      rateLimiter: { check: () => ({ ok: false, reason: "global", retryAfterMs: 1 }) },
    });

    const body = await (await handler(buildRequest({ messages: [] }))).json();
    expect(JSON.stringify(body)).not.toContain("global");
  });

  it("proceeds normally when the limiter allows", async () => {
    streamTextMock.mockReturnValue({ toUIMessageStreamResponse: () => new Response("ok") });
    const handler = createChatHandler({
      llm: fakeLLM,
      getTools: buildToolsetProvider(),
      getSystemPrompt: () => "p",
      rateLimiter: { check: () => ({ ok: true }) },
    });

    await handler(buildRequest({ messages: [{ role: "user", parts: [] }] }));
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it("should propagate provider errors so the route can translate them", async () => {
    class CustomError extends Error {}
    const handler = createChatHandler({
      llm: fakeLLM,
      getTools: () => {
        throw new CustomError("boom");
      },
      getSystemPrompt: () => "p",
    });

    await expect(handler(buildRequest({ messages: [] }))).rejects.toBeInstanceOf(
      CustomError,
    );
  });
});
