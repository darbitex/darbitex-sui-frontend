import { useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { buildRedeemTx } from "../../chain/one";
import { ONE_COIN_TYPE, ONE_DECIMALS } from "../../config";
import { formatUnits, parseUnits } from "../../chain/format";
import { useCoinBalance } from "../../chain/useBalance";

export function OneRedeem() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [target, setTarget] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const oneBal = useCoinBalance(ONE_COIN_TYPE, statusMsg);

  const amount = useMemo(() => {
    try {
      return parseUnits(amountStr || "0", ONE_DECIMALS);
    } catch {
      return 0n;
    }
  }, [amountStr]);

  async function onRedeem() {
    if (!account || amount === 0n || !target) return;
    setStatusMsg(null);
    try {
      const tx = await buildRedeemTx(client, {
        sender: account.address,
        target,
        amount,
      });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Redeemed — ${res.digest.slice(0, 10)}…`);
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  if (!account) {
    return <div className="empty-state">Connect a wallet to redeem ONE for SUI.</div>;
  }

  return (
    <div className="panel">
      <h2>Redeem ONE → SUI</h2>
      <p className="dim">
        Burns ONE against a target trove and pays the redeemer SUI at oracle
        spot price. 1% redemption fee.
      </p>
      <label className="field-label">Target trove (address)</label>
      <input
        className="input"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        placeholder="0x…"
      />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <label className="field-label" style={{ margin: 0 }}>Amount (ONE)</label>
        <span className="dim">bal: {formatUnits(oneBal, ONE_DECIMALS)} ONE</span>
      </div>
      <div className="amount-row">
        <input
          className="input"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          placeholder="0.0"
          inputMode="decimal"
        />
        {oneBal > 0n && (
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: "4px 10px", fontSize: 11 }}
            onClick={() => setAmountStr(formatUnits(oneBal, ONE_DECIMALS))}
          >
            max
          </button>
        )}
        <span className="amount-sym">ONE</span>
      </div>
      <button
        className="btn-primary"
        onClick={onRedeem}
        disabled={isPending || amount === 0n || !target}
      >
        {isPending ? "Submitting…" : "Redeem"}
      </button>
      {statusMsg && <div className="status">{statusMsg}</div>}
    </div>
  );
}
