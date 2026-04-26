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
import { coinLabel, KNOWN_COINS, sortPair } from "../chain/coins";
import { formatUnits, parseUnits } from "../chain/format";
import { DEFAULT_SLIPPAGE_BPS, DARBITEX_SWAP_FEE_BPS } from "../config";

const KNOWN_TYPES = Object.keys(KNOWN_COINS);

export function TradePage() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const [pools, setPools] = useState<PoolView[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromType, setFromType] = useState(KNOWN_TYPES[0]);
  const [toType, setToType] = useState(KNOWN_TYPES[1] ?? KNOWN_TYPES[0]);
  const [amountInStr, setAmountInStr] = useState("");
  // Slippage is stored + edited as a percent string for display, then
  // converted to basis points (× 100) when sized into minOut. UI default
  // 0.5% matches DEFAULT_SLIPPAGE_BPS = 50.
  const [slippagePctStr, setSlippagePctStr] = useState(
    (DEFAULT_SLIPPAGE_BPS / 100).toString(),
  );
  const slippageBps = useMemo(() => {
    const pct = Number(slippagePctStr);
    if (!isFinite(pct) || pct <= 0) return DEFAULT_SLIPPAGE_BPS;
    return Math.max(1, Math.min(10_000, Math.round(pct * 100)));
  }, [slippagePctStr]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, bigint>>({});

  async function refresh() {
    setLoading(true);
    try {
      setPools(await listPools(client));
    } finally {
      setLoading(false);
    }
  }

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

  // Refresh balances for every whitelisted coin whenever the wallet
  // changes or a swap completes (statusMsg ticks). Fan out in parallel.
  useEffect(() => {
    if (!account) {
      setBalances({});
      return;
    }
    let cancelled = false;
    Promise.all(
      KNOWN_TYPES.map((t) =>
        client
          .getBalance({ owner: account.address, coinType: t })
          .then((b) => [t, BigInt(b.totalBalance as string)] as const)
          .catch(() => [t, 0n] as const),
      ),
    ).then((entries) => {
      if (!cancelled) setBalances(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [client, account, statusMsg]);

  // Resolve pool for the chosen pair via canonical sort.
  const resolved = useMemo(() => {
    if (fromType === toType) return null;
    const [A, B] = sortPair(fromType, toType);
    const pool = pools.find((p) => p.typeA === A && p.typeB === B);
    if (!pool) return null;
    return { pool, aToB: fromType === A };
  }, [pools, fromType, toType]);

  const inDecimals = KNOWN_COINS[fromType]?.decimals ?? 9;
  const outDecimals = KNOWN_COINS[toType]?.decimals ?? 9;

  const amountIn = useMemo(() => {
    try {
      return parseUnits(amountInStr || "0", inDecimals);
    } catch {
      return 0n;
    }
  }, [amountInStr, inDecimals]);

  // Spot rate from current reserves (decimal-scaled), independent of input size.
  // 1 from = (reserveOut / 10^outDec) / (reserveIn / 10^inDec)
  const spotPerOne = useMemo(() => {
    if (!resolved) return null;
    const reserveIn = resolved.aToB ? resolved.pool.reserveA : resolved.pool.reserveB;
    const reserveOut = resolved.aToB ? resolved.pool.reserveB : resolved.pool.reserveA;
    if (reserveIn === 0n || reserveOut === 0n) return null;
    // Compute as a Number for display only — full precision not needed for a hint.
    const rin = Number(reserveIn) / Math.pow(10, inDecimals);
    const rout = Number(reserveOut) / Math.pow(10, outDecimals);
    return rout / rin;
  }, [resolved, inDecimals, outDecimals]);

  const quoted = useMemo(() => {
    if (!resolved || amountIn === 0n) return 0n;
    const reserveIn = resolved.aToB ? resolved.pool.reserveA : resolved.pool.reserveB;
    const reserveOut = resolved.aToB ? resolved.pool.reserveB : resolved.pool.reserveA;
    return quoteSwap(amountIn, reserveIn, reserveOut);
  }, [resolved, amountIn]);

  // Effective rate after this swap (price you actually pay including impact).
  const effectivePerOne = useMemo(() => {
    if (amountIn === 0n || quoted === 0n) return null;
    const aIn = Number(amountIn) / Math.pow(10, inDecimals);
    const aOut = Number(quoted) / Math.pow(10, outDecimals);
    return aOut / aIn;
  }, [amountIn, quoted, inDecimals, outDecimals]);

  // Price impact = (spot - effective) / spot. Positive = you pay above spot.
  const priceImpactBps = useMemo(() => {
    if (spotPerOne === null || effectivePerOne === null) return null;
    if (spotPerOne === 0) return null;
    const diff = (spotPerOne - effectivePerOne) / spotPerOne;
    return Math.round(diff * 10_000);
  }, [spotPerOne, effectivePerOne]);

  const minOut = useMemo(() => {
    if (quoted === 0n) return 0n;
    return (quoted * BigInt(10_000 - slippageBps)) / 10_000n;
  }, [quoted, slippageBps]);

  function flip() {
    setFromType(toType);
    setToType(fromType);
  }

  async function onSwap() {
    if (!resolved || !account || amountIn === 0n) return;
    setStatusMsg(null);
    try {
      const tx = await buildSwapTx(client, {
        pool: resolved.pool,
        aToB: resolved.aToB,
        amountIn,
        minAmountOut: minOut,
        sender: account.address,
      });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Swapped — ${res.digest.slice(0, 10)}…`);
      refresh();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  if (loading) return <div className="page-loading">Loading pools…</div>;

  return (
    <section className="page">
      <h1 className="page-title">Trade</h1>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <label className="field-label" style={{ margin: 0 }}>From</label>
          {account && (
            <span className="dim">
              balance: {formatUnits(balances[fromType] ?? 0n, inDecimals)}{" "}
              {coinLabel(fromType)}
            </span>
          )}
        </div>
        <select
          className="select"
          value={fromType}
          onChange={(e) => setFromType(e.target.value)}
        >
          {KNOWN_TYPES.map((t) => (
            <option key={t} value={t}>
              {coinLabel(t)}
            </option>
          ))}
        </select>
        <div className="amount-row">
          <input
            className="input"
            placeholder="0.0"
            value={amountInStr}
            onChange={(e) => setAmountInStr(e.target.value)}
            inputMode="decimal"
          />
          {account && (balances[fromType] ?? 0n) > 0n && (
            <button
              className="btn-ghost"
              type="button"
              style={{ padding: "4px 10px", fontSize: 11 }}
              onClick={() =>
                setAmountInStr(formatUnits(balances[fromType] ?? 0n, inDecimals))
              }
            >
              max
            </button>
          )}
          <span className="amount-sym">{coinLabel(fromType)}</span>
        </div>

        <div className="row" style={{ justifyContent: "center", margin: "8px 0" }}>
          <button className="btn-ghost" type="button" onClick={flip}>
            ⇅ flip
          </button>
        </div>

        <div className="row" style={{ justifyContent: "space-between" }}>
          <label className="field-label" style={{ margin: 0 }}>To</label>
          {account && (
            <span className="dim">
              balance: {formatUnits(balances[toType] ?? 0n, outDecimals)}{" "}
              {coinLabel(toType)}
            </span>
          )}
        </div>
        <select
          className="select"
          value={toType}
          onChange={(e) => setToType(e.target.value)}
        >
          {KNOWN_TYPES.map((t) => (
            <option key={t} value={t}>
              {coinLabel(t)}
            </option>
          ))}
        </select>
        <div className="amount-row">
          <input
            className="input"
            value={resolved ? formatUnits(quoted, outDecimals) : ""}
            readOnly
            placeholder="—"
          />
          <span className="amount-sym">{coinLabel(toType)}</span>
        </div>

        {fromType === toType && (
          <p className="hint">Pick two different tokens.</p>
        )}

        {fromType !== toType && !resolved && (
          <p className="hint">
            No pool for {coinLabel(fromType)} / {coinLabel(toType)} yet. Create
            one from Liquidity → Pools.
          </p>
        )}

        {resolved && (
          <div className="quote-box">
            <div className="quote-row">
              <span className="dim">Spot rate</span>
              <span>
                1 {coinLabel(fromType)} = {fmt(spotPerOne)} {coinLabel(toType)}
              </span>
            </div>
            <div className="quote-row">
              <span className="dim">Effective rate</span>
              <span>
                {effectivePerOne === null
                  ? "—"
                  : `1 ${coinLabel(fromType)} = ${fmt(effectivePerOne)} ${coinLabel(toType)}`}
              </span>
            </div>
            <div className="quote-row">
              <span className="dim">Price impact</span>
              <span className={priceImpactColor(priceImpactBps)}>
                {priceImpactBps === null ? "—" : `${(priceImpactBps / 100).toFixed(2)}%`}
              </span>
            </div>
            <div className="quote-row">
              <span className="dim">LP fee ({DARBITEX_SWAP_FEE_BPS} bps)</span>
              <span>
                ≈{" "}
                {amountIn === 0n
                  ? "—"
                  : `${fmt(
                      (Number(amountIn) * DARBITEX_SWAP_FEE_BPS) /
                        10_000 /
                        Math.pow(10, inDecimals),
                    )} ${coinLabel(fromType)}`}
              </span>
            </div>

            <div className="quote-row">
              <span className="dim">Slippage tolerance</span>
              <span>
                <input
                  className="input input-narrow"
                  type="number"
                  step="0.1"
                  min="0.01"
                  max="50"
                  value={slippagePctStr}
                  onChange={(e) => setSlippagePctStr(e.target.value)}
                />{" "}
                %
              </span>
            </div>
            <div className="quote-row">
              <span className="dim">Min received</span>
              <span>
                {formatUnits(minOut, outDecimals)} {coinLabel(toType)}
              </span>
            </div>
          </div>
        )}

        {!account ? (
          <div className="hint">Connect a wallet to swap.</div>
        ) : (
          <button
            className="btn-primary"
            disabled={!resolved || amountIn === 0n || isPending}
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

function fmt(n: number | null): string {
  if (n === null || !isFinite(n)) return "—";
  if (n === 0) return "0";
  if (Math.abs(n) >= 1) return n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return n.toPrecision(4);
}

function priceImpactColor(bps: number | null): string {
  if (bps === null) return "";
  if (bps >= 500) return "impact-high";
  if (bps >= 100) return "impact-mid";
  return "";
}
