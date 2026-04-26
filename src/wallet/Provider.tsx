import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider as DappKitWalletProvider } from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import "@mysten/dapp-kit/dist/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: 1,
    },
  },
});

const networks = {
  mainnet: {
    url: getJsonRpcFullnodeUrl("mainnet"),
    network: "mainnet" as const,
  },
};

// dapp-kit auto-detects all browser-installed Sui wallets (Slush
// extension, Suiet, OKX, Surf, etc.) via the wallet-standard. The
// `slushWallet` prop additionally enables the hosted Slush experience
// (slush.app) so users without an extension can sign in via Google /
// Apple / passkey using zkLogin and act on Sui through a hosted key.
// Together this gives the same "extension + social login" pair that
// Aptos' wallet-adapter offers via Petra + Continue with Google.
export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="mainnet">
        <DappKitWalletProvider
          autoConnect
          slushWallet={{ name: "Darbitex Sui" }}
        >
          {children}
        </DappKitWalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
