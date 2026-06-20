"use client";

import { PrivyProvider } from "@privy-io/react-auth";

import { monadTestnet } from "@/lib/monad";

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return children;

  return (
    <PrivyProvider
      appId={appId}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID}
      config={{
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
        appearance: {
          theme: "light",
          accentColor: "#6D7F20",
          logo: undefined,
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
