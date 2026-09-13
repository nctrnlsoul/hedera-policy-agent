import { describe, expect, it, vi } from "vitest";

// `tool()` from the AI SDK is a typed pass-through at runtime. Mocking it as
// identity keeps these tests on the wrapper's own logic instead of the SDK's.
vi.mock("ai", () => ({ tool: (config) => ({ ...config, __wrapped: true }) }));

const { wrapMutatingTools } = await import("./toolkit");

function fakeTools(overrides = {}) {
  return {
    transfer_hbar_tool: {
      description: "moves hbar",
      inputSchema: { type: "object" },
      execute: vi.fn(async (input) => JSON.stringify({ ok: true, input })),
      ...overrides.transfer,
    },
    get_balance_tool: {
      description: "reads a balance",
      inputSchema: { type: "object" },
      execute: vi.fn(async () => JSON.stringify({ balance: 1 })),
      ...overrides.read,
    },
  };
}

const MUTATING = new Set(["transfer_hbar_tool"]);

describe("wrapMutatingTools", () => {
  it("leaves read-only tools untouched by identity, not by copy", () => {
    const base = fakeTools();
    const wrapped = wrapMutatingTools(base, MUTATING);
    // Same object reference. A copy would silently drop any property this
    // wrapper does not know about.
    expect(wrapped.get_balance_tool).toBe(base.get_balance_tool);
  });

  it("wraps every mutating tool", () => {
    const base = fakeTools();
    const wrapped = wrapMutatingTools(base, MUTATING);
    expect(wrapped.transfer_hbar_tool).not.toBe(base.transfer_hbar_tool);
    expect(wrapped.transfer_hbar_tool.__wrapped).toBe(true);
  });

  it("carries the description and schema across unchanged", () => {
    const base = fakeTools();
    const wrapped = wrapMutatingTools(base, MUTATING);
    expect(wrapped.transfer_hbar_tool.description).toBe(base.transfer_hbar_tool.description);
    expect(wrapped.transfer_hbar_tool.inputSchema).toBe(base.transfer_hbar_tool.inputSchema);
  });

  // THE CONTRACT FOR THIS SLICE. Wrapping auto mode must change nothing that
  // reaches the model or the client. If this ever fails, the plumbing change
  // stopped being invisible and became a behaviour change.
  it("returns the underlying result byte-identically with no transform", async () => {
    const base = fakeTools();
    const wrapped = wrapMutatingTools(base, MUTATING);

    const input = { accountId: "0.0.1234", amount: 5 };
    const direct = await base.transfer_hbar_tool.execute(input, {});
    const viaWrapper = await wrapped.transfer_hbar_tool.execute(input, {});

    expect(viaWrapper).toBe(direct);
  });

  it("forwards both arguments to the underlying execute", async () => {
    const base = fakeTools();
    const wrapped = wrapMutatingTools(base, MUTATING);
    const input = { a: 1 };
    const options = { toolCallId: "call_1" };

    await wrapped.transfer_hbar_tool.execute(input, options);

    expect(base.transfer_hbar_tool.execute).toHaveBeenCalledWith(input, options);
  });

  it("throws a named error when a mutating tool has no execute", async () => {
    const base = fakeTools({ transfer: { execute: undefined } });
    const wrapped = wrapMutatingTools(base, MUTATING);
    await expect(wrapped.transfer_hbar_tool.execute({}, {})).rejects.toThrow(
      /transfer_hbar_tool/,
    );
  });

  it("lets an error from the underlying tool propagate untouched", async () => {
    class KitError extends Error {}
    const base = fakeTools({
      transfer: { execute: vi.fn(async () => { throw new KitError("blocked by policy: X"); }) },
    });
    const wrapped = wrapMutatingTools(base, MUTATING);
    await expect(wrapped.transfer_hbar_tool.execute({}, {})).rejects.toBeInstanceOf(KitError);
  });

  it("applies a transform when one is supplied", async () => {
    const base = fakeTools();
    const wrapped = wrapMutatingTools(base, MUTATING, {
      transformResult: async ({ name, result }) => `${name}:${result}`,
    });
    const out = await wrapped.transfer_hbar_tool.execute({ x: 1 }, {});
    expect(out).toBe(`transfer_hbar_tool:${JSON.stringify({ ok: true, input: { x: 1 } })}`);
  });

  it("omits toModelOutput unless one is supplied", () => {
    const base = fakeTools();
    // Key ABSENCE, not an undefined value. `toBeUndefined()` passes either way,
    // so it could not tell "never set" from "set to undefined" and survived the
    // mutation that always assigns the key.
    expect("toModelOutput" in wrapMutatingTools(base, MUTATING).transfer_hbar_tool).toBe(false);
    const withHook = wrapMutatingTools(base, MUTATING, { toModelOutput: () => ({ type: "text", value: "x" }) });
    expect(typeof withHook.transfer_hbar_tool.toModelOutput).toBe("function");
  });

  // A truthy result hides a `?? null` style mutation entirely, so the identity
  // contract has to be checked against the falsy values too.
  it.each([undefined, null, "", 0, false])("returns %p unchanged", async (value) => {
    const base = fakeTools({ transfer: { execute: vi.fn(async () => value) } });
    const wrapped = wrapMutatingTools(base, MUTATING);
    expect(await wrapped.transfer_hbar_tool.execute({}, {})).toBe(value);
  });

  it("handles an empty mutating set without wrapping anything", () => {
    const base = fakeTools();
    const wrapped = wrapMutatingTools(base, new Set());
    expect(wrapped.transfer_hbar_tool).toBe(base.transfer_hbar_tool);
    expect(wrapped.get_balance_tool).toBe(base.get_balance_tool);
  });
});

// ---------------------------------------------------------------------------
// createHederaToolkit: does AUTO mode actually get the wrapper?
//
// The wrapper tests above exercise `wrapMutatingTools` directly and say nothing
// about whether it is wired in. A mutation that reverted auto mode to
// `baseToolkit.getTools()` survived every one of them, which is the whole point
// of this slice going undetected. These tests close that.
// ---------------------------------------------------------------------------

const getToolsMock = vi.fn();

vi.mock("@hashgraph/hedera-agent-kit", () => ({
  AgentMode: { AUTONOMOUS: "AUTONOMOUS", RETURN_BYTES: "RETURN_BYTES" },
}));

vi.mock("@hashgraph/hedera-agent-kit-ai-sdk", () => ({
  HederaAIToolkit: class {
    getTools() {
      return getToolsMock();
    }
  },
}));

vi.mock("./hedera-client", () => ({
  createHederaClient: () => ({}),
  createReturnBytesHederaClient: () => ({}),
  readEnv: () => ({ operatorId: "0.0.1234", operatorKey: "k", operatorPublicKey: "pub" }),
}));

vi.mock("./mutating-tools", () => ({
  getMutatingToolMethods: () => new Set(["transfer_hbar_tool"]),
}));

vi.mock("../../../../../shared/config.js", () => ({
  config: {},
  extraContext: {},
  hooks: {},
  plugins: [],
}));

const { createHederaToolkit } = await import("./toolkit");

describe("createHederaToolkit", () => {
  function baseSet() {
    return {
      transfer_hbar_tool: {
        description: "moves hbar",
        inputSchema: { type: "object" },
        execute: vi.fn(async () => "raw-result"),
      },
      get_balance_tool: {
        description: "reads",
        inputSchema: { type: "object" },
        execute: vi.fn(async () => "balance"),
      },
    };
  }

  it("wraps mutating tools in AUTO mode", () => {
    const base = baseSet();
    getToolsMock.mockReturnValue(base);

    const { tools } = createHederaToolkit({ mode: "auto" });

    expect(tools.transfer_hbar_tool).not.toBe(base.transfer_hbar_tool);
    expect(tools.transfer_hbar_tool.__wrapped).toBe(true);
  });

  it("leaves read-only tools alone in AUTO mode", () => {
    const base = baseSet();
    getToolsMock.mockReturnValue(base);

    const { tools } = createHederaToolkit({ mode: "auto" });

    expect(tools.get_balance_tool).toBe(base.get_balance_tool);
  });

  // The behavioural contract for this slice: wrapping auto mode must not change
  // a single byte that reaches the model or the client.
  it("returns AUTO results byte-identically through the wrapper", async () => {
    const base = baseSet();
    getToolsMock.mockReturnValue(base);

    const { tools } = createHederaToolkit({ mode: "auto" });
    const out = await tools.transfer_hbar_tool.execute({ amount: 1 }, {});

    expect(out).toBe("raw-result");
  });

  it("does not attach a model-output hook in AUTO mode", () => {
    getToolsMock.mockReturnValue(baseSet());
    const { tools } = createHederaToolkit({ mode: "auto" });
    expect("toModelOutput" in tools.transfer_hbar_tool).toBe(false);
  });

  it("still transforms in HUMAN mode, which AUTO must not", async () => {
    getToolsMock.mockReturnValue({
      transfer_hbar_tool: {
        description: "moves hbar",
        inputSchema: { type: "object" },
        execute: vi.fn(async () => JSON.stringify({ bytes: "AAEC" })),
      },
    });

    const { tools } = createHederaToolkit({ mode: "human" });
    const out = await tools.transfer_hbar_tool.execute({ amount: 1 }, {});

    expect(JSON.parse(out).raw.status).toBe("AWAITING_APPROVAL");
    expect("toModelOutput" in tools.transfer_hbar_tool).toBe(true);
  });

  it("reports the mutating method set to the caller", () => {
    getToolsMock.mockReturnValue(baseSet());
    const { mutatingToolMethods } = createHederaToolkit({ mode: "auto" });
    expect(mutatingToolMethods.has("transfer_hbar_tool")).toBe(true);
  });
});
