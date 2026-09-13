import {
  convertToModelMessages,
  hasToolCall,
  stepCountIs,
  streamText,
} from "ai";

import { BOUNDS, checkRequestBounds } from "./request-bounds.js";
import { clientKeyFrom, createRateLimiter } from "./rate-limit.js";

const DEFAULT_MAX_STEPS = 10;

// Module scope, so the table survives between requests on a warm instance.
// See rate-limit.js for the standing limit: this is per instance and is a
// speed bump, not a global guarantee.
const limiter = createRateLimiter();

// Factory for the Next.js POST handler that drives the chat agent loop. The
// returned function is the route file's default export wiring; chat-hedera (or
// any other tool extension) supplies the `getTools` / `getSystemPrompt`
// implementations. `chat-runtime/server` itself stays runtime-flavored but
// tool-agnostic.
export function createChatHandler(options) {
  const {
    llm,
    getTools,
    getSystemPrompt,
    validateRequest,
    maxSteps = DEFAULT_MAX_STEPS,
    // Injectable so a test can assert the ROUTE returns 429, not just that the
    // limiter says no. A module-scope singleton cannot be exercised from a test
    // without leaking state between cases, and a guard nobody can drive is a
    // guard nobody has proved.
    rateLimiter = limiter,
  } = options;

  return async function handler(req) {
    // Checked FIRST, before the body is even read. A limiter that runs after
    // parsing still pays for the parse on every refused request.
    const verdict = rateLimiter.check(clientKeyFrom(req.headers), Date.now());
    if (!verdict.ok) {
      return new Response(JSON.stringify({ error: "Too many requests. Try again shortly." }), {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(Math.ceil(verdict.retryAfterMs / 1000)),
        },
      });
    }

    // Read as TEXT first so the raw size is measurable. `req.json()` parses an
    // arbitrarily large body before anything gets a chance to reject it, which
    // means the cost is already paid by the time you look.
    const raw = await req.text();

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return jsonError("Request body must be valid JSON.", 400);
    }

    const bounds = checkRequestBounds(body, raw.length);
    if (!bounds.ok) return jsonError(bounds.reason, bounds.status);

    const rejection = validateRequest?.(body);
    if (rejection) return rejection;

    const toolset = getTools(body);
    const system = getSystemPrompt(body);

    const stopConditions = [
      stepCountIs(maxSteps),
      ...Array.from(toolset.mutatingToolMethods, (method) => hasToolCall(method)),
    ];

    const result = streamText({
      model: llm,
      system,
      messages: await convertToModelMessages(body.messages),
      tools: toolset.tools,
      stopWhen: stopConditions,
      // Without this a response is unbounded and so is its cost. The Security
      // Playbook is blunt about it: always set a token cap on every call.
      maxOutputTokens: BOUNDS.maxOutputTokens,
      // A hung upstream call should end rather than run until the platform
      // kills it, since the route is billed for the whole time either way.
      abortSignal: AbortSignal.timeout(BOUNDS.timeoutMs),
    });

    return result.toUIMessageStreamResponse();
  };
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
