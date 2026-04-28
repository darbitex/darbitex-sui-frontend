import { useEffect, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import {
  buildLiquidateTx,
  discoverLiquidatable,
  type UnderwaterTrove,
} from "../../chain/d";
import { compactNumber, formatUnits, shortAddr } from "../../chain/format";
import { D_DECIMALS, SUI_DECIMALS } from "../../config";

export function OneLiquidate() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [target, setTarget] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState<UnderwaterTrove[]>([]);
  const [scanned, setScanned] = useState<number>(0);
  const [price8dec, setPrice8dec] = useState<bigint>(0n);
  const [scanError, setScanError] = useState<string | null>(null);

  async function scan() {
    setScanning(true);
    setScanError(null);
    try {
      const r = await discoverLiquidatable(client);
      setCandidates(r.candidates);
      setScanned(r.scanned);
      setPrice8dec(r.price8dec);
      if (r.price8dec === 0n) {
        setScanError("Pyth price feed unavailable.");
      }
    } catch (e) {
      setScanError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  async function onLiquidate(addr: string) {
    if (!account) return;
    setStatusMsg(null);
    try {
      const tx = await buildLiquidateTx(client, { target: addr });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Liquidated ${shortAddr(addr)} — ${res.digest.slice(0, 10)}…`);
      scan();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  if (!account) {
    return <div className="empty-state">Connect a wallet to call liquidate.</div>;
  }

  return (
    <div>
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Underwater troves</h2>
          <button
            className="btn-ghost"
            onClick={scan}
            disabled={scanning}
            style={{ padding: "6px 12px", fontSize: 12 }}
          >
            {scanning ? "scanning…" : "refresh"}
          </button>
        </div>
        <p className="dim">
          Liquidator earns 2.5% of debt value in SUI. Threshold: CR &lt; 150%.
          Stability Pool must hold ≥ trove debt.{" "}
          {price8dec > 0n && (
            <>
              Spot SUI/USD: <strong>${formatUnits(price8dec, 8)}</strong>.
            </>
          )}
        </p>

        {scanError && <div className="status">{scanError}</div>}

        {!scanning && candidates.length === 0 && !scanError && (
          <div className="empty-state" style={{ padding: 24 }}>
            <p>
              No underwater troves. Scanned {scanned} active trove
              {scanned === 1 ? "" : "s"}.
            </p>
          </div>
        )}

        {candidates.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Owner</th>
                <th>Collateral</th>
                <th>Debt</th>
                <th>CR</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((t) => (
                <tr key={t.owner}>
                  <td>
                    <a
                      href={`https://suiscan.xyz/mainnet/account/${t.owner}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {shortAddr(t.owner)}
                    </a>
                  </td>
                  <td>{compactNumber(t.collateral, SUI_DECIMALS)} SUI</td>
                  <td>{compactNumber(t.debt, D_DECIMALS)} D</td>
                  <td className={crColor(t.crBps)}>
                    {(Number(t.crBps) / 100).toFixed(2)}%
                  </td>
                  <td>
                    <button
                      className="btn-ghost"
                      style={{ padding: "6px 10px", fontSize: 11 }}
                      disabled={isPending}
                      onClick={() => onLiquidate(t.owner)}
                    >
                      Liquidate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>Liquidate by address</h2>
        <p className="dim">
          Enter any trove owner manually if it doesn't appear in the scan
          (e.g. just-opened trove not yet indexed).
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
          onClick={() => onLiquidate(target)}
          disabled={isPending || !target}
        >
          {isPending ? "Submitting…" : "Liquidate"}
        </button>
        {statusMsg && <div className="status">{statusMsg}</div>}
      </div>
    </div>
  );
}

function crColor(bps: bigint): string {
  if (bps < 11_000n) return "impact-high";
  if (bps < 13_000n) return "impact-mid";
  return "";
}
