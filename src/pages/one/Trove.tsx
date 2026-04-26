import { useEffect, useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import {
  buildAddCollateralTx,
  buildOpenTroveTx,
  readTrove,
  type TroveView,
} from "../../chain/one";
import { compactNumber, formatUnits, parseUnits } from "../../chain/format";
import { ONE_DECIMALS, ONE_MIN_DEBT, SUI_DECIMALS } from "../../config";

export function OneTrove() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const [trove, setTrove] = useState<TroveView | null>(null);
  const [loading, setLoading] = useState(false);
  const [collStr, setCollStr] = useState("");
  const [borrowStr, setBorrowStr] = useState("");
  const [topupStr, setTopupStr] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setLoading(true);
    readTrove(client, account.address)
      .then((t) => {
        if (!cancelled) setTrove(t);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, account]);

  const collAmount = useMemo(() => {
    try {
      return parseUnits(collStr || "0", SUI_DECIMALS);
    } catch {
      return 0n;
    }
  }, [collStr]);
  const borrowAmount = useMemo(() => {
    try {
      return parseUnits(borrowStr || "0", ONE_DECIMALS);
    } catch {
      return 0n;
    }
  }, [borrowStr]);
  const topupAmount = useMemo(() => {
    try {
      return parseUnits(topupStr || "0", SUI_DECIMALS);
    } catch {
      return 0n;
    }
  }, [topupStr]);

  async function refresh() {
    if (!account) return;
    setTrove(await readTrove(client, account.address));
  }

  async function onOpen() {
    if (!account || collAmount === 0n || borrowAmount < ONE_MIN_DEBT) {
      setStatusMsg(`Borrow must be at least ${formatUnits(ONE_MIN_DEBT, ONE_DECIMALS)} ONE.`);
      return;
    }
    setStatusMsg(null);
    try {
      const tx = await buildOpenTroveTx(client, {
        sender: account.address,
        collateralAmount: collAmount,
        borrowAmount,
      });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Opened — ${res.digest.slice(0, 10)}…`);
      await refresh();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  async function onTopUp() {
    if (!account || topupAmount === 0n) return;
    setStatusMsg(null);
    try {
      const tx = await buildAddCollateralTx(client, account.address, topupAmount);
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Topped up — ${res.digest.slice(0, 10)}…`);
      await refresh();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  if (!account) {
    return <div className="empty-state">Connect a wallet to manage a trove.</div>;
  }
  if (loading) return <div className="page-loading">Loading trove…</div>;

  return (
    <div className="grid-2">
      <div className="panel">
        <h2>Your trove</h2>
        {trove ? (
          <>
            <div className="row">
              <span className="dim">Collateral</span>
              <span>{compactNumber(trove.collateral, SUI_DECIMALS)} SUI</span>
            </div>
            <div className="row">
              <span className="dim">Debt</span>
              <span>{compactNumber(trove.debt, ONE_DECIMALS)} ONE</span>
            </div>
            <label className="field-label">Add collateral (SUI)</label>
            <div className="amount-row">
              <input
                className="input"
                value={topupStr}
                onChange={(e) => setTopupStr(e.target.value)}
                placeholder="0.0"
                inputMode="decimal"
              />
              <span className="amount-sym">SUI</span>
            </div>
            <button className="btn-primary" onClick={onTopUp} disabled={isPending}>
              {isPending ? "Submitting…" : "Add collateral"}
            </button>
          </>
        ) : (
          <p className="dim">No trove yet.</p>
        )}
      </div>

      <div className="panel">
        <h2>Open trove</h2>
        <label className="field-label">Collateral (SUI)</label>
        <div className="amount-row">
          <input
            className="input"
            value={collStr}
            onChange={(e) => setCollStr(e.target.value)}
            placeholder="0.0"
            inputMode="decimal"
          />
          <span className="amount-sym">SUI</span>
        </div>
        <label className="field-label">Borrow (ONE)</label>
        <div className="amount-row">
          <input
            className="input"
            value={borrowStr}
            onChange={(e) => setBorrowStr(e.target.value)}
            placeholder="0.0"
            inputMode="decimal"
          />
          <span className="amount-sym">ONE</span>
        </div>
        <p className="dim">
          Min debt: 1 ONE. Min CR: 200%. 1% mint fee charged on top of borrow.
        </p>
        <button className="btn-primary" onClick={onOpen} disabled={isPending}>
          {isPending ? "Submitting…" : "Open trove"}
        </button>
        {statusMsg && <div className="status">{statusMsg}</div>}
      </div>
    </div>
  );
}
