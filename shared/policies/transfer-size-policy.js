import { AbstractPolicy } from "@hashgraph/hedera-agent-kit";

const MAX_HBAR_PER_TRANSFER = 10;

export class TransferSizeLimitPolicy extends AbstractPolicy {
  name = "Per-Transfer Size Limit";
  description = "Transfers above the configured HBAR limit require review";
  relevantTools = ["transfer_hbar_tool"];

  shouldBlockPostParamsNormalization(allParams, _method) {
    const transfers = allParams.normalisedParams?.hbarTransfers ?? [];
    let totalHbar = 0;
    for (const transfer of transfers) {
      const amt = transfer?.amount;
      if (amt == null) continue;
      let asNumber;
      if (typeof amt === "object") {
        const bn = typeof amt.toBigNumber === "function" ? amt.toBigNumber() : amt;
        asNumber = typeof bn.toNumber === "function" ? bn.toNumber() : Number(bn);
      } else {
        asNumber = Number(amt);
      }
      if (Number.isFinite(asNumber) && asNumber > 0) {
        totalHbar += asNumber;
      }
    }
    return totalHbar > MAX_HBAR_PER_TRANSFER;
  }
}
