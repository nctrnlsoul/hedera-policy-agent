import { Transaction } from "@hiero-ledger/sdk";

import { createSubmitClient } from "./hedera-client";
import { safeErrorResponse, SUBMIT_BOUNDS } from "@/features/chat-runtime/server/safe-error";

// Stateless POST. The user has signed the unsigned bytes the server emitted
// for an awaiting-approval card via their own CLI / wallet / signing pipeline,
// and is now handing them back so the server can broadcast. No operator key
// is required on the server: a fully-signed Hedera transaction can be
// submitted by anyone with network access, and `createSubmitClient` has no
// operator attached, so this route cannot spend the operator's funds.
//
// ERRORS ARE GENERIC ON PURPOSE. This route previously returned the raw SDK
// error on 502 and echoed parse failures on 400. A Hedera failure names node
// account ids and endpoints, and a parse failure reflects the caller's own
// bytes back at them. Both are free reconnaissance. The detail now goes to the
// server log with a reference the caller can quote.
export async function POST(req) {
  const raw = await req.text();
  if (raw.length > SUBMIT_BOUNDS.maxSignedBytesChars) {
    return jsonError(413, "Payload too large.");
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonError(400, "Request body must be valid JSON");
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "Request body must be a JSON object");
  }

  if (typeof body.signedBytes !== "string" || body.signedBytes.length === 0) {
    return jsonError(400, "signedBytes (base64) is required");
  }
  // No second size check here. `raw` always contains `signedBytes`, so the cap
  // above always fires first and a duplicate check on the field is unreachable
  // code. Found by mutation: deleting either one left every test green, which
  // is the tell that two guards were covering for each other.

  let bytes;
  try {
    bytes = decodeBase64(body.signedBytes);
  } catch (error) {
    return safeErrorResponse(400, "Could not decode signedBytes as base64", error);
  }

  let tx;
  try {
    tx = Transaction.fromBytes(new Uint8Array(bytes));
  } catch (error) {
    return safeErrorResponse(400, "Could not parse the transaction bytes", error);
  }

  const client = createSubmitClient();
  try {
    const submission = await tx.execute(client);
    const receipt = await submission.getReceipt(client);
    const envelope = {
      raw: {
        status: receipt.status.toString(),
        transactionId: tx.transactionId?.toString() ?? "",
        accountId: receipt.accountId?.toString(),
        tokenId: receipt.tokenId?.toString(),
        topicId: receipt.topicId?.toString(),
        scheduleId: receipt.scheduleId?.toString(),
      },
      humanMessage: `Transaction submitted: ${receipt.status.toString()}.`,
    };
    return Response.json(envelope, { status: 200 });
  } catch (error) {
    return safeErrorResponse(502, "Could not submit the transaction to the network", error, {
      transactionId: tx.transactionId?.toString(),
    });
  } finally {
    client.close();
  }
}

function decodeBase64(value) {
  const cleaned = value.trim();
  if (!/^[A-Za-z0-9+/=\s]+$/.test(cleaned)) {
    throw new Error("input contains non-base64 characters");
  }
  const buffer = Buffer.from(cleaned, "base64");
  if (buffer.length === 0) {
    throw new Error("input decoded to zero bytes");
  }
  return buffer;
}

// For the cases where there is no underlying error to log: the message is
// already generic and says nothing the caller did not send us.
function jsonError(status, message) {
  return Response.json({ error: message }, { status });
}
