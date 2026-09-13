import { readEnv } from "@/features/chat-hedera/server";
import { AppProviders } from "../providers";

// The signing surface, and the only part of the app that reads the operator
// key. Moved out of the root layout on 2026-09-13 so the key is serialized into
// the HTML of the chat routes only, rather than every page in the app.
//
// DEMO-SAFE VS DEPLOY-SAFE, stated plainly because it has not changed:
// the browser-side wallet simulator still receives the operator private key in
// the initial HTML of these routes. That is fine for a throwaway testnet
// account and it is NOT safe for mainnet or for any account holding value. A
// real wallet holds its own key and the server never sees it; swapping
// <ChatWalletProvider> for a wallet SDK is the upgrade path.
export default function ChatLayout({ children }) {
  const { operatorId, operatorKey } = readEnv();

  return (
    <AppProviders accountId={operatorId} signingKey={operatorKey}>
      {children}
    </AppProviders>
  );
}
