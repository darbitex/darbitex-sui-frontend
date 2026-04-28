import { useEffect, useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { buildRedeemFromReserveTx, buildRedeemTx, readReserveBalance } from "../../chain/d";
import { D_COIN_TYPE, D_DECIMALS, SUI_DECIMALS } from "../../config";
import { compactNumber, formatUnits, parseUnits } from "../../chain/format";
import { useCoinBalance } from "../../chain/useBalance";

type Mode = "trove" | "reserve";

export function OneRedeem() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [mode, setMode] = useState<Mode>("trove");
  const [target, setTarget] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [reserve, setReserve] = useState<bigint | null>(null);

  const dBal = useCoinBalance(D_COIN_TYPE, statusMsg);

  useEffect(() => {
    let cancelled = false;
    readReserveBalance(client).then((r) => {
      if (!cancelled) setReserve(r);
    });
    return () => {
      cancelled = true;
    };
  }, [client, statusMsg]);

  const amount = useMemo(() => {
    try {
      return parseUnits(amountStr || "0", D_DECIMALS);
    } catch {
      return 0n;
    }
  }, [amountStr]);

  async function onRedeem() {
    if (!account || amount === 0n) return;
    if (mode === "trove" && !target) return;
    setStatusMsg(null);
    try {
      const tx =
        mode === "trove"
          ? await buildRedeemTx(client, {
              sender: account.address,
              target,
              amount,
            })
          : await buildRedeemFromReserveTx(client, account.address, amount);
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Redeemed — ${res.digest.slice(0, 10)}…`);
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  if (!account) {
    return <div className="empty-state">Connect a wallet to redeem D for SUI.</div>;
  }

  const canSubmit =
    !isPending && amount > 0n && (mode === "reserve" || target.length > 0);

  return (
    <div className="panel">
      <h2>Redeem D → SUI</h2>
      <div className="subnav" style={{ marginTop: 4, marginBottom: 12 }}>
        <button
          type="button"
          className={mode === "trove" ? "btn-primary" : "btn-ghost"}
          style={{ padding: "6px 14px", fontSize: 12 }}
          onClick={() => setMode("trove")}
        >
          Against trove
        </button>
        <button
          type="button"
          className={mode === "reserve" ? "btn-primary" : "btn-ghost"}
          style={{ padding: "6px 14px", fontSize: 12 }}
          onClick={() => setMode("reserve")}
        >
          From reserve
        </button>
      </div>
      {mode === "trove" ? (
        <>
          <p className="dim">
            Burns D against a target trove and pays the redeemer SUI at oracle
            spot price. 1% redemption fee. Target's debt + collateral both
            decrease — value-neutral at spot.
          </p>
          <label className="field-label">Target trove (address)</label>
          <input
            className="input"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="0x…"
          />
        </>
      ) : (
        <p className="dim">
          Burns D and pulls SUI directly from the protocol reserve (no
          per-trove target). Capacity:{" "}
          <strong>
            {reserve !== null ? compactNumber(reserve, SUI_DECIMALS) : "—"} SUI
          </strong>
          . 1% fee. Reserve grows from the 2.5% liquidation share + permissionless
          donations.
        </p>
      )}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <label className="field-label" style={{ margin: 0 }}>Amount (D)</label>
        <span className="dim">bal: {formatUnits(dBal, D_DECIMALS)} D</span>
      </div>
      <div className="amount-row">
        <input
          className="input"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          placeholder="0.0"
          inputMode="decimal"
        />
        {dBal > 0n && (
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: "4px 10px", fontSize: 11 }}
            onClick={() => setAmountStr(formatUnits(dBal, D_DECIMALS))}
          >
            max
          </button>
        )}
        <span className="amount-sym">D</span>
      </div>
      <button
        className="btn-primary"
        onClick={onRedeem}
        disabled={!canSubmit}
      >
        {isPending ? "Submitting…" : "Redeem"}
      </button>
      {statusMsg && <div className="status">{statusMsg}</div>}
    </div>
  );
}
