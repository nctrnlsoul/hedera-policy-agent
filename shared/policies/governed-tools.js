// ONE list, imported by both policies.
//
// Two hand-maintained copies of the same tool list drift, and the drift is
// silent: a tool present in one policy's list and absent from the other is a
// gap nothing reports. The size policy denies any name here that has no branch
// in its rule, so adding to this list fails closed and loudly rather than
// exempting a tool by accident.
//
// DELIBERATELY ABSENT, and this is a decision rather than an omission:
//   delete_hbar_allowance_tool
//   delete_token_allowance_tool
//   delete_non_fungible_token_allowance_tool
// Those three REVOKE authority. A guardrail that can block the cancel is worse
// than no guardrail, so they stay reachable at any hour and at any size. They
// are the always-available path for pulling an allowance back.
//
// NOT YET GOVERNED, for a reason: the NFT transfer tools move a serial number,
// not an amount, so a per-asset size limit is the wrong rule shape for them.
// They need their own policy rather than a bad branch in this one.
export const GOVERNED_TOOLS = [
  "transfer_hbar_tool",
  "transfer_hbar_with_allowance_tool",
  "airdrop_fungible_token_tool",
  "transfer_fungible_token_with_allowance_tool",
  "approve_hbar_allowance_tool",
  "approve_token_allowance_tool",
];
