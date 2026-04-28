import { useEffect, useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import {
  buildSpClaimTx,
  buildSpDepositTx,
  buildSpWithdrawTx,
  readSpPosition,
  type SpPositionView,
} from "../../chain/d";
import { D_COIN_TYPE, D_DECIMALS } from "../../config";
import { formatUnits, parseUnits } from "../../chain/format";
import { useCoinBalance } from "../../chain/useBalance";

export function OneSp() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [depositStr, setDepositStr] = useState("");
  const [withdrawStr, setWithdrawStr] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const dBal = useCoinBalance(D_COIN_TYPE, statusMsg);
  const [spPos, setSpPos] = useState<SpPositionView | null>(null);

  useEffect(() => {
    if (!account) {
      setSpPos(null);
      return;
    }
    let cancelled = false;
    readSpPosition(client, account.address).then((p) => {
      if (!cancelled) setSpPos(p);
    });
    return () => {
      cancelled = true;
    };
  }, [client, account, statusMsg]);

  const spDeposited = spPos?.effective ?? 0n;

  const depositAmount = useMemo(() => {
    try {
      return parseUnits(depositStr || "0", D_DECIMALS);
    } catch {
      return 0n;
    }
  }, [depositStr]);
  const withdrawAmount = useMemo(() => {
    try {
      return parseUnits(withdrawStr || "0", D_DECIMALS);
    } catch {
      return 0n;
    }
  }, [withdrawStr]);

  async function onDeposit() {
    if (!account || depositAmount === 0n) return;
    setStatusMsg(null);
    try {
      const tx = await buildSpDepositTx(client, account.address, depositAmount);
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Deposited — ${res.digest.slice(0, 10)}…`);
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  async function onWithdraw() {
    if (!account || withdrawAmount === 0n) return;
    setStatusMsg(null);
    try {
      const tx = buildSpWithdrawTx(withdrawAmount);
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Withdrew — ${res.digest.slice(0, 10)}…`);
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  async function onClaim() {
    if (!account) return;
    setStatusMsg(null);
    try {
      const tx = buildSpClaimTx();
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Claimed — ${res.digest.slice(0, 10)}…`);
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  if (!account) {
    return <div className="empty-state">Connect a wallet to use the Stability Pool.</div>;
  }

  return (
    <div className="grid-2">
      <div className="panel">
        <h2>Deposit</h2>
        <p className="dim">
          Deposit D to absorb liquidations. Earns liquidator-share SUI plus
          90% of every fee cycle. Donations bypass the SP denominator so your
          yield share is not diluted.
        </p>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <label className="field-label" style={{ margin: 0 }}>Amount</label>
          <span className="dim">bal: {formatUnits(dBal, D_DECIMALS)} D</span>
        </div>
        <div className="amount-row">
          <input
            className="input"
            value={depositStr}
            onChange={(e) => setDepositStr(e.target.value)}
            placeholder="0.0"
            inputMode="decimal"
          />
          {dBal > 0n && (
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: "4px 10px", fontSize: 11 }}
              onClick={() => setDepositStr(formatUnits(dBal, D_DECIMALS))}
            >
              max
            </button>
          )}
          <span className="amount-sym">D</span>
        </div>
        <button className="btn-primary" onClick={onDeposit} disabled={isPending}>
          {isPending ? "Submitting…" : "Deposit"}
        </button>
      </div>

      <div className="panel">
        <h2>Withdraw</h2>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <label className="field-label" style={{ margin: 0 }}>Amount</label>
          <span className="dim">
            available: {formatUnits(spDeposited, D_DECIMALS)} D
          </span>
        </div>
        <div className="amount-row">
          <input
            className="input"
            value={withdrawStr}
            onChange={(e) => setWithdrawStr(e.target.value)}
            placeholder="0.0"
            inputMode="decimal"
          />
          {spDeposited > 0n && (
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: "4px 10px", fontSize: 11 }}
              onClick={() => setWithdrawStr(formatUnits(spDeposited, D_DECIMALS))}
            >
              max
            </button>
          )}
          <span className="amount-sym">D</span>
        </div>
        <button className="btn-primary" onClick={onWithdraw} disabled={isPending}>
          {isPending ? "Submitting…" : "Withdraw"}
        </button>

        <h2 style={{ marginTop: 16 }}>Claim rewards</h2>
        <p className="dim">
          Liquidations + 90% of every fee pay SP depositors. Claim transfers
          unclaimed D + SUI to your wallet.
        </p>
        <div className="quote-box">
          <div className="quote-row">
            <span className="dim">pending D</span>
            <span>{formatUnits(spPos?.pendingD ?? 0n, D_DECIMALS)}</span>
          </div>
          <div className="quote-row">
            <span className="dim">pending SUI</span>
            <span>{formatUnits(spPos?.pendingColl ?? 0n, 9)}</span>
          </div>
        </div>
        <button
          className="btn-primary"
          onClick={onClaim}
          disabled={
            isPending ||
            !spPos ||
            (spPos.pendingD === 0n && spPos.pendingColl === 0n)
          }
        >
          {isPending ? "Submitting…" : "Claim rewards"}
        </button>
        {statusMsg && <div className="status">{statusMsg}</div>}
      </div>
    </div>
  );
}
