import { useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { buildRedeemTx } from "../../chain/one";
import { ONE_DECIMALS } from "../../config";
import { parseUnits } from "../../chain/format";

export function OneRedeem() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [target, setTarget] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

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
      <label className="field-label">Amount (ONE)</label>
      <div className="amount-row">
        <input
          className="input"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          placeholder="0.0"
          inputMode="decimal"
        />
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
