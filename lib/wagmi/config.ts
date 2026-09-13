import { createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL && process.env.NEXT_PUBLIC_RPC_URL.length > 0
  ? process.env.NEXT_PUBLIC_RPC_URL
  : baseSepolia.rpcUrls.default.http[0];

/**
 * wagmi v3 config, pinned to Base Sepolia (84532). Local dev points `NEXT_PUBLIC_RPC_URL` at an
 * anvil instance started with `--chain-id 84532` (see `scripts/dev-local.ts`), so the app never
 * needs a second chain definition for local testing - only the RPC URL changes.
 *
 * Connectors: the injected connector (a generic fallback) plus Coinbase Wallet (which offers its
 * smart wallet). Components should prefer `useVisibleConnectors` (see
 * `lib/wagmi/useVisibleConnectors.ts`) over `useConnectors` directly, so the generic "injected"
 * entry is hidden whenever the browser has already announced specific wallets via EIP-6963 -
 * otherwise a MetaMask user sees both "MetaMask" (EIP-6963) and a redundant generic "Injected".
 */
export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [
    injected(),
    coinbaseWallet({
      appName: "Chaupal Seals",
      preference: { options: "all" }, // offers both the smart wallet and EOA extension paths
    }),
  ],
  transports: {
    [baseSepolia.id]: http(rpcUrl),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
