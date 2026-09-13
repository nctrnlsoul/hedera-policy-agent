import { beforeEach, describe, expect, it, vi } from "vitest";

const submitMock = vi.fn();
const receiptMock = vi.fn();
const fromBytesMock = vi.fn();
const closeMock = vi.fn();

// Mock the SDK before importing the route. The route reads
// `Transaction.fromBytes`, `tx.execute(client)`, and `submission.getReceipt`.
// We replace those with controllable test doubles.
vi.mock("@hiero-ledger/sdk", () => {
  return {
    Transaction: {
      fromBytes: (bytes) => fromBytesMock(bytes),
    },
    // Stubs for hedera-client.ts; it imports these too.
    AccountId: { fromString: (id) => ({ id, toString: () => id }) },
    PublicKey: { fromString: (s) => ({ s }) },
    PrivateKey: {
      fromStringECDSA: (s) => ({
        s,
        publicKey: { toStringDer: () => `pub:${s}` },
      }),
      fromStringED25519: (s) => ({
        s,
        publicKey: { toStringDer: () => `pub:${s}` },
      }),
    },
    Client: {
      forTestnet: () => ({
        setOperator: vi.fn(),
        setOperatorWith: vi.fn(),
        close: closeMock,
      }),
      forMainnet: () => ({
        setOperator: vi.fn(),
        setOperatorWith: vi.fn(),
        close: closeMock,
      }),
    },
  };
});

const VALID_SIGNED_B64 = Buffer.from([1, 2, 3, 4]).toString("base64");

async function callPost(body) {
  const { POST } = await import(
    "@/features/chat-hedera/server/submit-signed"
  );
  return POST(
    new Request("http://localhost/api/transactions/submit-signed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/transactions/submit-signed", () => {
  beforeEach(() => {
    submitMock.mockReset();
    receiptMock.mockReset();
    fromBytesMock.mockReset();
    closeMock.mockReset();
  });

  it("should return a normalized receipt envelope on success", async () => {
    fromBytesMock.mockReturnValue({
      transactionId: { toString: () => "0.0.1234@1700000000.000000000" },
      execute: () => submitMock(),
    });
    submitMock.mockResolvedValue({ getReceipt: () => receiptMock() });
    receiptMock.mockResolvedValue({
      status: { toString: () => "SUCCESS" },
      accountId: undefined,
      tokenId: { toString: () => "0.0.9999" },
      topicId: undefined,
      scheduleId: undefined,
    });

    const res = await callPost({ signedBytes: VALID_SIGNED_B64 });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.raw.status).toBe("SUCCESS");
    expect(body.raw.transactionId).toBe("0.0.1234@1700000000.000000000");
    expect(body.raw.tokenId).toBe("0.0.9999");
    expect(body.humanMessage).toContain("SUCCESS");
    expect(closeMock).toHaveBeenCalled();
  });

  it("should return 400 when signedBytes is missing", async () => {
    const res = await callPost({});

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/signedBytes/);
  });

  it("should return 400 when the body is not valid JSON", async () => {
    const res = await callPost("not-json");

    expect(res.status).toBe(400);
  });

  it("should return 400 when signedBytes contains non-base64 characters", async () => {
    const res = await callPost({ signedBytes: "this is not @base64!" });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/base64/);
  });

  // These two asserted the OPPOSITE of the current contract: they required the
  // raw SDK error to reach the client. A Hedera failure names node account ids
  // and endpoints, and a parse failure reflects the caller's own bytes back.
  // The detail now goes to the server log with a reference, so these assert the
  // leak is gone AND that nothing was lost.
  it("returns 400 on unparseable bytes without echoing the SDK error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fromBytesMock.mockImplementation(() => {
      throw new Error("invalid protobuf at offset 0x2f");
    });

    const res = await callPost({ signedBytes: VALID_SIGNED_B64 });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(JSON.stringify(body)).not.toContain("invalid protobuf");
    expect(JSON.stringify(body)).not.toContain("0x2f");
    expect(body.ref).toBeTruthy();
    // Logged, not discarded, under the same reference the caller was given.
    expect(JSON.stringify(errSpy.mock.calls[0])).toContain("invalid protobuf");
    expect(JSON.stringify(errSpy.mock.calls[0])).toContain(body.ref);
    errSpy.mockRestore();
  });

  it("returns 502 on a submission failure without echoing the network error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fromBytesMock.mockReturnValue({
      transactionId: { toString: () => "0.0.1234@x" },
      execute: () => submitMock(),
    });
    submitMock.mockRejectedValue(new Error("INVALID_SIGNATURE at node 0.0.3"));

    const res = await callPost({ signedBytes: VALID_SIGNED_B64 });
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(JSON.stringify(body)).not.toContain("INVALID_SIGNATURE");
    expect(JSON.stringify(body)).not.toContain("0.0.3");
    expect(body.ref).toBeTruthy();
    expect(JSON.stringify(errSpy.mock.calls[0])).toContain("INVALID_SIGNATURE");
    errSpy.mockRestore();
  });

  it("rejects an oversized payload before decoding it", async () => {
    const res = await callPost({ signedBytes: "A".repeat(200_000) });
    expect(res.status).toBe(413);
    expect(fromBytesMock).not.toHaveBeenCalled();
  });
});
