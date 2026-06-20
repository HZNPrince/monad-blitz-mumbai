"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { ExternalLink, Landmark, LogOut, Wallet } from "lucide-react";

import {
  campaignFactoryAbi,
  contractsConfigured,
  mockUsdcAbi,
  monadContracts,
  monadTestnet,
} from "@/lib/monad";

type TransactionState =
  | { status: "idle" }
  | { status: "signing"; label: string }
  | { status: "confirming"; label: string; hash: Hex }
  | { status: "confirmed"; label: string; hash: Hex }
  | { status: "error"; message: string };

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(monadTestnet.rpcUrls.default.http[0]),
});

async function fetchBalances(address: Address) {
  const native = await publicClient.getBalance({ address });
  let stable: bigint | undefined;
  if (contractsConfigured()) {
    stable = await publicClient.readContract({
      address: monadContracts.token as Address,
      abi: mockUsdcAbi,
      functionName: "balanceOf",
      args: [address],
    });
  }
  return {
    mon: Number(formatEther(native)).toFixed(4),
    token: stable === undefined ? "—" : Number(formatUnits(stable, 6)).toFixed(2),
  };
}

function truncate(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function TxStatus({ state }: { state: TransactionState }) {
  if (state.status === "idle") return null;
  if (state.status === "error") {
    return <p role="alert" className="text-xs text-destructive">{state.message}</p>;
  }
  return (
    <div aria-live="polite" className="text-xs text-muted-foreground">
      <p>{state.status === "signing" ? "Waiting for your signature" : state.status === "confirming" ? "Confirming on Monad Testnet" : "Confirmed on Monad Testnet"}</p>
      {"hash" in state ? (
        <a
          href={`${monadTestnet.blockExplorers.default.url}/tx/${state.hash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex min-h-10 items-center gap-1 font-mono text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {truncate(state.hash)} <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

function PrivyWalletPanel({ contentHash }: { contentHash: string }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const wallet = wallets.find((item) => item.walletClientType === "privy") ?? wallets[0];
  const [monBalance, setMonBalance] = useState<string>("—");
  const [tokenBalance, setTokenBalance] = useState<string>("—");
  const [maxPayout, setMaxPayout] = useState("10");
  const [baseFee, setBaseFee] = useState("1");
  const [approved, setApproved] = useState(false);
  const [tx, setTx] = useState<TransactionState>({ status: "idle" });

  useEffect(() => {
    if (!wallet?.address) return;
    let cancelled = false;
    void fetchBalances(wallet.address as Address)
      .then((balances) => {
        if (cancelled) return;
        setMonBalance(balances.mon);
        setTokenBalance(balances.token);
      })
      .catch(() => {
        if (cancelled) return;
        setMonBalance("Unavailable");
        setTokenBalance("Unavailable");
      });
    return () => { cancelled = true; };
  }, [wallet?.address]);

  async function refreshBalances() {
    if (!wallet?.address) return;
    const balances = await fetchBalances(wallet.address as Address);
    setMonBalance(balances.mon);
    setTokenBalance(balances.token);
  }

  async function client() {
    if (!wallet) throw new Error("Connect your embedded wallet first.");
    await wallet.switchChain(monadTestnet.id);
    const provider = await wallet.getEthereumProvider();
    return createWalletClient({
      account: wallet.address as Address,
      chain: monadTestnet,
      transport: custom(provider),
    });
  }

  async function approveBudget() {
    try {
      if (!contractsConfigured()) throw new Error("Deploy and configure the Monad contracts first.");
      const amount = parseUnits(maxPayout, 6);
      if (amount <= 0n) throw new Error("Maximum payout must be greater than zero.");
      setTx({ status: "signing", label: "Approve campaign budget" });
      const walletClient = await client();
      const hash = await walletClient.writeContract({
        address: monadContracts.token as Address,
        abi: mockUsdcAbi,
        functionName: "approve",
        args: [monadContracts.factory as Address, amount],
      });
      setTx({ status: "confirming", label: "Approve campaign budget", hash });
      await publicClient.waitForTransactionReceipt({ hash });
      setApproved(true);
      setTx({ status: "confirmed", label: "Budget approved", hash });
    } catch (error) {
      setTx({ status: "error", message: error instanceof Error ? error.message : "Approval failed." });
    }
  }

  async function fundCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!approved) throw new Error("Approve the mUSDC budget first.");
      if (!contractsConfigured()) throw new Error("Deploy and configure the Monad contracts first.");
      const max = parseUnits(maxPayout, 6);
      const base = parseUnits(baseFee, 6);
      const bonuses = [parseUnits("1", 6), parseUnits("2", 6), parseUnits("3", 6)];
      if (base + bonuses.reduce((sum, item) => sum + item, 0n) > max) {
        throw new Error("Maximum payout must cover the base fee and the 6 mUSDC performance cap.");
      }
      setTx({ status: "signing", label: "Fund performance escrow" });
      const walletClient = await client();
      const hash = await walletClient.writeContract({
        address: monadContracts.factory as Address,
        abi: campaignFactoryAbi,
        functionName: "createCampaign",
        args: [
          monadContracts.treasury as Address,
          monadContracts.token as Address,
          monadContracts.oracle as Address,
          max,
          base,
          BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60),
          [1n, 10n, 25n],
          bonuses,
          `0x${contentHash}` as Hex,
        ],
      });
      setTx({ status: "confirming", label: "Fund performance escrow", hash });
      await publicClient.waitForTransactionReceipt({ hash });
      setTx({ status: "confirmed", label: "Campaign funded", hash });
      await refreshBalances();
    } catch (error) {
      setTx({ status: "error", message: error instanceof Error ? error.message : "Campaign funding failed." });
    }
  }

  if (!ready || !walletsReady) {
    return <div className="h-24 animate-pulse border-y border-border bg-muted" aria-label="Loading wallet" />;
  }

  if (!authenticated) {
    return (
      <section className="border-y border-border py-5">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">Monad campaign</p>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to create a user-controlled embedded wallet. Traction never receives your private key.</p>
        <button type="button" onClick={login} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Wallet className="size-4" aria-hidden /> Sign in and create wallet
        </button>
      </section>
    );
  }

  return (
    <section className="border-y border-border py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-primary">Monad Testnet · 10143</p>
          <p className="mt-2 font-mono text-sm">{wallet ? truncate(wallet.address) : "Creating wallet…"}</p>
        </div>
        <button type="button" onClick={logout} aria-label="Sign out" className="flex size-10 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <LogOut className="size-4" aria-hidden />
        </button>
      </div>
      <dl className="mt-4 grid grid-cols-2 border-y border-border py-3">
        <div><dt className="text-xs text-muted-foreground">Gas balance</dt><dd className="mt-1 font-mono text-sm tabular-nums">{monBalance} MON</dd></div>
        <div className="border-l border-border pl-4"><dt className="text-xs text-muted-foreground">Campaign balance</dt><dd className="mt-1 font-mono text-sm tabular-nums">{tokenBalance} mUSDC</dd></div>
      </dl>
      {!contractsConfigured() ? (
        <p className="mt-4 border border-border bg-secondary p-3 text-xs leading-5 text-muted-foreground">Wallet integration is ready. Contract funding unlocks after the tested contracts are deployed and their five public addresses are configured.</p>
      ) : (
        <form onSubmit={fundCampaign} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="max-payout" className="text-xs text-muted-foreground">Maximum payout</label><input id="max-payout" inputMode="decimal" value={maxPayout} onChange={(event) => { setMaxPayout(event.target.value); setApproved(false); }} className="mt-2 h-11 w-full border border-input bg-background px-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
            <div><label htmlFor="base-fee" className="text-xs text-muted-foreground">Base fee</label><input id="base-fee" inputMode="decimal" value={baseFee} onChange={(event) => setBaseFee(event.target.value)} className="mt-2 h-11 w-full border border-input bg-background px-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">mUSDC · 7-day campaign · bonuses: +1 at score 1, +2 at 10, +3 at 25. Two explicit signatures are required.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void approveBudget()} disabled={tx.status === "signing" || tx.status === "confirming"} className="min-h-11 border border-border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">{approved ? "Budget approved" : "1. Approve mUSDC"}</button>
            <button type="submit" disabled={!approved || tx.status === "signing" || tx.status === "confirming"} className="flex min-h-11 items-center justify-center gap-2 bg-primary px-3 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"><Landmark className="size-4" aria-hidden />2. Fund escrow</button>
          </div>
          <TxStatus state={tx} />
        </form>
      )}
    </section>
  );
}

export function WalletPanel({ contentHash }: { contentHash: string }) {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return (
      <section className="border-y border-border py-5">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Monad campaign / local mode</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Add a Privy App ID to enable the user-controlled wallet. No wallet or transaction is being simulated.</p>
      </section>
    );
  }
  return <PrivyWalletPanel contentHash={contentHash} />;
}
