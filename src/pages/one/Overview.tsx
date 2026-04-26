import { useEffect, useState } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import { readRegistry } from "../../chain/one";
import { compactNumber } from "../../chain/format";
import { ONE_DECIMALS, SUI_DECIMALS } from "../../config";

export function OneOverview() {
  const client = useSuiClient();
  const [reg, setReg] = useState<{
    total_debt: string;
    total_sp: string;
    sealed: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    readRegistry(client)
      .then((r) => {
        if (!cancelled && r) {
          setReg({ total_debt: r.total_debt, total_sp: r.total_sp, sealed: r.sealed });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (loading) return <div className="page-loading">Loading registry…</div>;
  if (!reg) return <div className="empty-state">Failed to read ONE registry.</div>;

  return (
    <div className="grid-2">
      <div className="stat-card">
        <div className="stat-label">Total ONE debt</div>
        <div className="stat-value">{compactNumber(reg.total_debt, ONE_DECIMALS)}</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Stability Pool</div>
        <div className="stat-value">{compactNumber(reg.total_sp, ONE_DECIMALS)}</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Sealed</div>
        <div className="stat-value">{reg.sealed ? "✓ immutable" : "no"}</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Collateral</div>
        <div className="stat-value">SUI ({SUI_DECIMALS} dec)</div>
      </div>
    </div>
  );
}
