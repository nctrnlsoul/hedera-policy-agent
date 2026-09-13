import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Hedera Policy Agent",
  description:
    "Runtime policy enforcement for a Hedera agent. Watch the rules allow and block real tool calls, with no keys and no network.",
};

// THE OPERATOR KEY IS DELIBERATELY NOT READ HERE.
//
// It used to be. `readEnv()` ran in this file and the private key was
// serialized into the initial HTML of EVERY route so the browser-side wallet
// simulator could sign. That is the scaffold's design and it is demo-safe on a
// throwaway testnet account, but it means the key reaches any visitor who views
// source, on any page, including pages that have nothing to do with signing.
//
// It now lives in `chat/layout.jsx`, which wraps only the routes that actually
// sign something. Structuring it this way rather than remembering to avoid it
// means the keyless path is the DEFAULT path: a route added tomorrow inherits
// no key unless someone deliberately puts it under /chat.
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
