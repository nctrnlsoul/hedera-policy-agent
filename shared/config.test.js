import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VALID_ENV = {
  HEDERA_ACCOUNT_ID: "0.0.1234",
  HEDERA_PRIVATE_KEY: "0x" + "a".repeat(64),
  HEDERA_NETWORK: "testnet",
};

let originalEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  vi.resetModules();
});

afterEach(() => {
  process.env = originalEnv;
  vi.resetModules();
});

function setEnv(env) {
  for (const key of Object.keys(VALID_ENV)) delete process.env[key];
  Object.assign(process.env, env);
}

describe("shared/config", () => {
  it("should export plugins, mode, hooks, config, extraContext, systemPrompt, client when env is set", async () => {
    setEnv(VALID_ENV);
    const mod = await import("./config.js");
    expect(Array.isArray(mod.plugins)).toBe(true);
    expect(mod.plugins.length).toBeGreaterThan(0);
    expect(mod.mode).toMatch(/^(auto|human)$/);
    expect(Array.isArray(mod.hooks)).toBe(true);
    expect(mod.hooks.map((hook) => hook.name)).toEqual([
      "Business Hours Only",
      "Per-Transfer Size Limit",
    ]);
    expect(typeof mod.config).toBe("object");
    expect(mod.config).not.toBeNull();
    expect(Object.keys(mod.config)).toEqual([]);
    expect(typeof mod.extraContext).toBe("object");
    expect(mod.extraContext).not.toBeNull();
    expect(Object.keys(mod.extraContext)).toEqual([]);
    expect(typeof mod.systemPrompt).toBe("string");
    expect(mod.systemPrompt.length).toBeGreaterThan(0);
    expect(mod.client).toBeDefined();
  });

  it("should not export tools, llm, createAIToolkit, or createLLM (data-only module)", async () => {
    setEnv(VALID_ENV);
    const mod = await import("./config.js");
    expect(mod.tools).toBeUndefined();
    expect(mod.llm).toBeUndefined();
    expect(mod.createAIToolkit).toBeUndefined();
    expect(mod.createLLM).toBeUndefined();
  });

  it("should throw a clear error when HEDERA_ACCOUNT_ID is missing", async () => {
    setEnv({ ...VALID_ENV, HEDERA_ACCOUNT_ID: "" });
    await expect(import("./config.js")).rejects.toThrow(/HEDERA_ACCOUNT_ID/);
  });

  it("should throw a clear error when HEDERA_PRIVATE_KEY is missing", async () => {
    setEnv({ ...VALID_ENV, HEDERA_PRIVATE_KEY: "" });
    await expect(import("./config.js")).rejects.toThrow(/HEDERA_PRIVATE_KEY/);
  });

  it("should reject an invalid HEDERA_NETWORK", async () => {
    setEnv({ ...VALID_ENV, HEDERA_NETWORK: "previewnet" });
    await expect(import("./config.js")).rejects.toThrow(/HEDERA_NETWORK/);
  });

  it("should accept an ED25519 operator key in DER format", async () => {
    // Throwaway fixtures, not real credentials. Both were flagged by a secret
    // scan on 2026-09-13 because they are well-formed keys in a public repo,
    // then cleared: their public keys were derived locally and looked up on
    // HashScan, and no account on testnet or mainnet holds either one.
    //   ed25519 pub e0c8ec2758a5879ffac226a13c0c516b799e72e35141a0dd828f94d37988a4b7
    //   ecdsa   pub 02bb50e2d89a4ed70663d080659fe0ad4b9bc3e06c17a227433966cb59ceee020d
    // Recorded here so the next scan resolves this in seconds instead of
    // re-raising it. Never put a funded key in this file.
    const ed25519DerKey =
      "302e020100300506032b657004220420" +
      "db484b828e64b2d8f12ce3c0a0e93a0b8cce7af1bb8f39c97732394482538e10";
    setEnv({ ...VALID_ENV, HEDERA_PRIVATE_KEY: ed25519DerKey });
    const mod = await import("./config.js");
    expect(mod.client).toBeDefined();
  });

  it("should accept an ECDSA operator key in DER format", async () => {
    const ecdsaDerKey =
      "3030020100300706052b8104000a04220420" +
      "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    setEnv({ ...VALID_ENV, HEDERA_PRIVATE_KEY: ecdsaDerKey });
    const mod = await import("./config.js");
    expect(mod.client).toBeDefined();
  });
});
