import { AbstractPolicy } from "@hashgraph/hedera-agent-kit";

const MAX_HBAR_PER_TRANSFER = 10;
const MAX_TOKEN_PER_TRANSFER = 10;

export class TransferSizeLimitPolicy extends AbstractPolicy {
  name = "Per-Transfer Size Limit";
  description = "Transfers above the configured per-asset limit require review";
  relevantTools = ["transfer_hbar_tool", "airdrop_fungible_token_tool"];

  async shouldBlockPostParamsNormalization(allParams, method) {
    if (method === "transfer_hbar_tool") {
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

    if (method === "airdrop_fungible_token_tool") {
      const transfers = allParams.normalisedParams?.tokenTransfers ?? [];
      if (transfers.length === 0) return false;

      let totalBaseUnits = 0;
      let tokenId;
      for (const transfer of transfers) {
        if (!tokenId && transfer?.tokenId) tokenId = transfer.tokenId;
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
          totalBaseUnits += asNumber;
        }
      }

      if (totalBaseUnits === 0) return false;
      if (!tokenId) return true;

      const mirrorNode = allParams.context?.mirrornodeService;
      if (!mirrorNode) return true;

      const tokenInfo = await mirrorNode.getTokenInfo(tokenId);
      const decimals = parseInt(tokenInfo?.decimals, 10);
      if (!Number.isFinite(decimals) || decimals < 0) return true;

      const totalDisplay = totalBaseUnits / Math.pow(10, decimals);
      return totalDisplay > MAX_TOKEN_PER_TRANSFER;
    }

    return false;
  }
}
