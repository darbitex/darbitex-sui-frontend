import { useEffect, useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import {
  buildReserveDonateTx,
  buildSpDonateTx,
  readDonationStats,
  type DonationStats,
} from "../../chain/d";
import { compactNumber, formatUnits, parseUnits, shortAddr } from "../../chain/format";
import { useCoinBalance } from "../../chain/useBalance";
import {
  D_COIN_TYPE,
  D_DECIMALS,
  SUI_COIN_TYPE,
  SUI_DECIMALS,
} from "../../config";

export function OneDonate() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [spStr, setSpStr] = useState("");
  const [rsvStr, setRsvStr] = useState("");

  const dBal = useCoinBalance(D_COIN_TYPE, statusMsg);
  const suiBal = useCoinBalance(SUI_COIN_TYPE, statusMsg);

  const [stats, setStats] = useState<DonationStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingStats(true);
    readDonationStats(client)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .finally(() => {
        if (!cancelled) setLoadingStats(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, statusMsg]);

  const spAmt = useMemo(() => {
    try {
      return parseUnits(spStr || "0", D_DECIMALS);
    } catch {
      return 0n;
    }
  }, [spStr]);
  const rsvAmt = useMemo(() => {
    try {
      return parseUnits(rsvStr || "0", SUI_DECIMALS);
    } catch {
      return 0n;
    }
  }, [rsvStr]);

  async function onSpDonate() {
    if (!account || spAmt === 0n) return;
    setStatusMsg(null);
    try {
      const tx = await buildSpDonateTx(client, account.address, spAmt);
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Donated to SP — ${res.digest.slice(0, 10)}…`);
      setSpStr("");
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  async function onReserveDonate() {
    if (!account || rsvAmt === 0n) return;
    setStatusMsg(null);
    try {
      const tx = await buildReserveDonateTx(client, account.address, rsvAmt);
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Donated to reserve — ${res.digest.slice(0, 10)}…`);
      setRsvStr("");
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  return (
    <div>
      <div className="grid-2">
        <div className="stat-card">
          <div className="stat-label">D donated to SP (lifetime)</div>
          <div className="stat-value">
            {stats ? compactNumber(stats.spTotalRaw, D_DECIMALS) : "—"}
          </div>
          <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>
            {stats ? `${stats.spCount} donation${stats.spCount === 1 ? "" : "s"}` : ""}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">SUI donated to reserve (lifetime)</div>
          <div className="stat-value">
            {stats ? compactNumber(stats.reserveTotalRaw, SUI_DECIMALS) : "—"}
          </div>
          <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>
            {stats
              ? `${stats.reserveCount} donation${stats.reserveCount === 1 ? "" : "s"}`
              : ""}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2>Donate D → SP</h2>
          <p className="dim">
            Agnostic Stability Pool donation. Joins sp_pool balance but does
            NOT increment total_sp, so keyed depositors are NOT diluted.
            Donated D burns gradually via future liquidation absorption — a
            permanent supply reduction. No admin can extract.
          </p>
          {!account ? (
            <p className="dim">Connect wallet to donate.</p>
          ) : (
            <>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <label className="field-label" style={{ margin: 0 }}>Amount</label>
                <span className="dim">bal: {formatUnits(dBal, D_DECIMALS)} D</span>
              </div>
              <div className="amount-row">
                <input
                  className="input"
                  value={spStr}
                  onChange={(e) => setSpStr(e.target.value)}
                  placeholder="0.0"
                  inputMode="decimal"
                />
                {dBal > 0n && (
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ padding: "4px 10px", fontSize: 11 }}
                    onClick={() => setSpStr(formatUnits(dBal, D_DECIMALS))}
                  >
                    max
                  </button>
                )}
                <span className="amount-sym">D</span>
              </div>
              <button
                className="btn-primary"
                onClick={onSpDonate}
                disabled={isPending || spAmt === 0n}
              >
                {isPending ? "Submitting…" : "Donate to SP"}
              </button>
            </>
          )}
        </div>

        <div className="panel">
          <h2>Donate SUI → Reserve</h2>
          <p className="dim">
            Fortifies redeem_from_reserve capacity. The protocol reserve
            grows from the 2.5% liquidation share + permissionless donations,
            and pays SUI to anyone burning D against the reserve at spot.
            One-way; no admin extraction.
          </p>
          {!account ? (
            <p className="dim">Connect wallet to donate.</p>
          ) : (
            <>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <label className="field-label" style={{ margin: 0 }}>Amount</label>
                <span className="dim">bal: {formatUnits(suiBal, SUI_DECIMALS)} SUI</span>
              </div>
              <div className="amount-row">
                <input
                  className="input"
                  value={rsvStr}
                  onChange={(e) => setRsvStr(e.target.value)}
                  placeholder="0.0"
                  inputMode="decimal"
                />
                {suiBal > 0n && (
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ padding: "4px 10px", fontSize: 11 }}
                    onClick={() => setRsvStr(formatUnits(suiBal, SUI_DECIMALS))}
                  >
                    max
                  </button>
                )}
                <span className="amount-sym">SUI</span>
              </div>
              <button
                className="btn-primary"
                onClick={onReserveDonate}
                disabled={isPending || rsvAmt === 0n}
              >
                {isPending ? "Submitting…" : "Donate to reserve"}
              </button>
            </>
          )}
          {statusMsg && <div className="status">{statusMsg}</div>}
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2>Recent SP donations</h2>
          {loadingStats ? (
            <p className="dim">Loading…</p>
          ) : stats && stats.recentSp.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Donor</th>
                  <th>Amount (D)</th>
                  <th>Tx</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentSp.map((d) => (
                  <tr key={d.tx}>
                    <td>
                      <a
                        href={`https://suiscan.xyz/mainnet/account/${d.donor}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {shortAddr(d.donor)}
                      </a>
                    </td>
                    <td>{compactNumber(d.amount, D_DECIMALS)}</td>
                    <td>
                      <a
                        href={`https://suiscan.xyz/mainnet/tx/${d.tx}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {d.tx.slice(0, 8)}…
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="dim">No SP donations yet.</p>
          )}
        </div>
        <div className="panel">
          <h2>Recent reserve donations</h2>
          {loadingStats ? (
            <p className="dim">Loading…</p>
          ) : stats && stats.recentReserve.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Donor</th>
                  <th>Amount (SUI)</th>
                  <th>Tx</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentReserve.map((d) => (
                  <tr key={d.tx}>
                    <td>
                      <a
                        href={`https://suiscan.xyz/mainnet/account/${d.donor}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {shortAddr(d.donor)}
                      </a>
                    </td>
                    <td>{compactNumber(d.amount, SUI_DECIMALS)}</td>
                    <td>
                      <a
                        href={`https://suiscan.xyz/mainnet/tx/${d.tx}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {d.tx.slice(0, 8)}…
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="dim">No reserve donations yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
