import { afterEach, describe, expect, it, vi } from "vitest";

import { safeErrorResponse, SUBMIT_BOUNDS } from "./safe-error.js";

// "Never return raw err.message, stack traces, or provider errors to the
// client. Log detail server-side, return a generic message with a correlation
// id." submit-signed.js returned the raw SDK error on 502 and echoed parse
// errors on 400, which fingerprints the stack and reflects attacker text back.

const SECRET = "node 0.0.3 at 35.237.200.180 rejected key 302e0201";

let errSpy;
afterEach(() => errSpy?.mockRestore());

async function bodyOf(res) {
  return JSON.parse(await res.text());
}

describe("safeErrorResponse", () => {
  it("never puts the underlying error in the response", async () => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = safeErrorResponse(502, "Could not submit the transaction.", new Error(SECRET));
    const body = await bodyOf(res);

    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(JSON.stringify(body)).not.toContain("0.0.3");
    expect(JSON.stringify(body)).not.toContain("35.237");
  });

  it("returns only the fields a client needs", async () => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = await bodyOf(safeErrorResponse(400, "Bad input.", new Error(SECRET)));
    expect(Object.keys(body).sort()).toEqual(["error", "ref"]);
    expect(body.error).toBe("Bad input.");
  });

  it("logs the real detail server-side, so nothing is lost", () => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    safeErrorResponse(502, "Could not submit the transaction.", new Error(SECRET));

    expect(errSpy).toHaveBeenCalledTimes(1);
    // Serialize the whole call: the detail is passed as a structured object, so
    // a naive join() renders it "[object Object]" and the assertion would pass
    // or fail for reasons unrelated to what was logged.
    expect(JSON.stringify(errSpy.mock.calls[0])).toContain(SECRET);
  });

  it("puts the same correlation id in the log and the response", async () => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = await bodyOf(safeErrorResponse(502, "nope", new Error(SECRET)));
    expect(JSON.stringify(errSpy.mock.calls[0])).toContain(body.ref);
  });

  it("gives each failure a distinct reference", async () => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const refs = new Set();
    for (let i = 0; i < 50; i += 1) {
      refs.add((await bodyOf(safeErrorResponse(500, "x", new Error("y")))).ref);
    }
    expect(refs.size).toBe(50);
  });

  it("carries the status and a json content type", () => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = safeErrorResponse(418, "teapot", new Error("x"));
    expect(res.status).toBe(418);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("handles a thrown non-Error without crashing", async () => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = await bodyOf(safeErrorResponse(500, "x", "a bare string"));
    expect(body.error).toBe("x");
    expect(typeof body.ref).toBe("string");
  });
});

describe("submit bounds", () => {
  it("publishes a cap on signedBytes", () => {
    expect(Number.isInteger(SUBMIT_BOUNDS.maxSignedBytesChars)).toBe(true);
    expect(SUBMIT_BOUNDS.maxSignedBytesChars).toBeGreaterThan(0);
  });
});
