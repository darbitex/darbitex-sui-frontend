import { useEffect, useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import {
  buildSwapTx,
  listPools,
  quoteSwap,
  type PoolView,
} from "../chain/darbitex";
import { coinLabel, KNOWN_COINS } from "../chain/coins";
import { compactNumber, formatUnits, parseUnits } from "../chain/format";
import { DEFAULT_SLIPPAGE_BPS } from "../config";

export function TradePage() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const [pools, setPools] = useState<PoolView[]>([]);
  const [loading, setLoading] = useState(true);
  const [poolIdx, setPoolIdx] = useState(0);
  const [aToB, setAToB] = useState(true);
  const [amountInStr, setAmountInStr] = useState("");
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listPools(client)
      .then((ps) => {
        if (!cancelled) setPools(ps);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const pool = pools[poolIdx];

  const inMeta = pool ? KNOWN_COINS[aToB ? pool.typeA : pool.typeB] : undefined;
  const outMeta = pool ? KNOWN_COINS[aToB ? pool.typeB : pool.typeA] : undefined;
  const inDecimals = inMeta?.decimals ?? 9;
  const outDecimals = outMeta?.decimals ?? 9;

  const amountIn = useMemo(() => {
    try {
      return parseUnits(amountInStr || "0", inDecimals);
    } catch {
      return 0n;
    }
  }, [amountInStr, inDecimals]);

  const quoted = useMemo(() => {
    if (!pool || amountIn === 0n) return 0n;
    const reserveIn = aToB ? pool.reserveA : pool.reserveB;
    const reserveOut = aToB ? pool.reserveB : pool.reserveA;
    return quoteSwap(amountIn, reserveIn, reserveOut);
  }, [pool, aToB, amountIn]);

  const minOut = useMemo(() => {
    if (quoted === 0n) return 0n;
    return (quoted * BigInt(10_000 - slippageBps)) / 10_000n;
  }, [quoted, slippageBps]);

  async function onSwap() {
    if (!pool || !account || amountIn === 0n) return;
    setStatusMsg(null);
    try {
      const tx = await buildSwapTx(client, {
        pool,
        aToB,
        amountIn,
        minAmountOut: minOut,
        sender: account.address,
      });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Swapped — ${res.digest.slice(0, 10)}…`);
      const refreshed = await listPools(client);
      setPools(refreshed);
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  if (loading) return <div className="page-loading">Loading pools…</div>;

  if (pools.length === 0) {
    return (
      <section className="page">
        <h1 className="page-title">Trade</h1>
        <div className="empty-state">
          <p>No pools created yet.</p>
          <p className="dim">
            The Darbitex Sui factory is sealed and permissionless — anyone can
            create the first pool by calling{" "}
            <code>pool_factory::create_canonical_pool</code>.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <h1 className="page-title">Trade</h1>

      <div className="panel">
        <label className="field-label">Pool</label>
        <select
          className="select"
          value={poolIdx}
          onChange={(e) => setPoolIdx(Number(e.target.value))}
        >
          {pools.map((p, i) => (
            <option key={p.poolId} value={i}>
              {coinLabel(p.typeA)} / {coinLabel(p.typeB)} —{" "}
              {compactNumber(p.reserveA, KNOWN_COINS[p.typeA]?.decimals ?? 9)} /{" "}
              {compactNumber(p.reserveB, KNOWN_COINS[p.typeB]?.decimals ?? 9)}
            </option>
          ))}
        </select>

        <div className="row">
          <label className="field-label">From</label>
          <button
            className="btn-ghost"
            onClick={() => setAToB((v) => !v)}
            type="button"
          >
            ⇅ flip
          </button>
        </div>
        <div className="amount-row">
          <input
            className="input"
            placeholder="0.0"
            value={amountInStr}
            onChange={(e) => setAmountInStr(e.target.value)}
            inputMode="decimal"
          />
          <span className="amount-sym">{coinLabel(aToB ? pool.typeA : pool.typeB)}</span>
        </div>

        <label className="field-label">To (estimate)</label>
        <div className="amount-row">
          <input
            className="input"
            value={formatUnits(quoted, outDecimals)}
            readOnly
          />
          <span className="amount-sym">{coinLabel(aToB ? pool.typeB : pool.typeA)}</span>
        </div>

        <div className="row">
          <label className="field-label">Slippage (bps)</label>
          <input
            className="input input-narrow"
            type="number"
            value={slippageBps}
            min={1}
            max={1000}
            onChange={(e) => setSlippageBps(Math.max(1, Number(e.target.value)))}
          />
          <span className="dim">min out: {formatUnits(minOut, outDecimals)}</span>
        </div>

        {!account ? (
          <div className="hint">Connect a wallet to swap.</div>
        ) : (
          <button
            className="btn-primary"
            disabled={amountIn === 0n || isPending}
            onClick={onSwap}
          >
            {isPending ? "Submitting…" : "Swap"}
          </button>
        )}

        {statusMsg && <div className="status">{statusMsg}</div>}
      </div>
    </section>
  );
}
