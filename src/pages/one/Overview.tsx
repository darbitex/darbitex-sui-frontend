import { useEffect, useState } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import { readRegistry, readReserveBalance } from "../../chain/d";
import { compactNumber } from "../../chain/format";
import { D_DECIMALS, SUI_DECIMALS } from "../../config";

export function OneOverview() {
  const client = useSuiClient();
  const [reg, setReg] = useState<{
    total_debt: string;
    total_sp: string;
    sealed: boolean;
  } | null>(null);
  const [reserve, setReserve] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([readRegistry(client), readReserveBalance(client)])
      .then(([r, rsv]) => {
        if (cancelled) return;
        if (r) {
          setReg({ total_debt: r.total_debt, total_sp: r.total_sp, sealed: r.sealed });
        }
        setReserve(rsv);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (loading) return <div className="page-loading">Loading registry…</div>;
  if (!reg) return <div className="empty-state">Failed to read D registry.</div>;

  return (
    <div className="grid-2">
      <div className="stat-card">
        <div className="stat-label">Total D debt</div>
        <div className="stat-value">{compactNumber(reg.total_debt, D_DECIMALS)}</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Stability Pool</div>
        <div className="stat-value">{compactNumber(reg.total_sp, D_DECIMALS)}</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Reserve (SUI)</div>
        <div className="stat-value">
          {reserve !== null ? compactNumber(reserve, SUI_DECIMALS) : "—"}
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Sealed</div>
        <div className="stat-value">{reg.sealed ? "✓ immutable" : "no"}</div>
      </div>
    </div>
  );
}
