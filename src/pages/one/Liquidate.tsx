import { useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { buildLiquidateTx } from "../../chain/one";

export function OneLiquidate() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [target, setTarget] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  async function onLiquidate() {
    if (!account || !target) return;
    setStatusMsg(null);
    try {
      const tx = await buildLiquidateTx(client, { target });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Liquidated — ${res.digest.slice(0, 10)}…`);
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  if (!account) {
    return <div className="empty-state">Connect a wallet to call liquidate.</div>;
  }

  return (
    <div className="panel">
      <h2>Liquidate</h2>
      <p className="dim">
        Permissionless. Liquidator earns 2.5% of debt value in SUI; the rest of
        the 10% bonus is split between reserve and SP.
      </p>
      <label className="field-label">Target trove (address)</label>
      <input
        className="input"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        placeholder="0x…"
      />
      <button
        className="btn-primary"
        onClick={onLiquidate}
        disabled={isPending || !target}
      >
        {isPending ? "Submitting…" : "Liquidate"}
      </button>
      {statusMsg && <div className="status">{statusMsg}</div>}
    </div>
  );
}
