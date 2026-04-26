import { useEffect, useState } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import { listPools, type PoolView } from "../chain/darbitex";
import { coinLabel, KNOWN_COINS } from "../chain/coins";
import { compactNumber, shortAddr } from "../chain/format";

export function PoolsBody() {
  const client = useSuiClient();
  const [pools, setPools] = useState<PoolView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listPools(client)
      .then((ps) => {
        if (!cancelled) setPools(ps);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (loading) return <div className="page-loading">Loading pools…</div>;

  if (pools.length === 0) {
    return (
      <div className="empty-state">
        <p>No pools yet.</p>
        <p className="dim">
          Darbitex Sui's factory is sealed and permissionless. Anyone can be
          first by calling <code>pool_factory::create_canonical_pool</code>.
        </p>
      </div>
    );
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Pair</th>
          <th>Reserves</th>
          <th>LP supply</th>
          <th>Pool ID</th>
        </tr>
      </thead>
      <tbody>
        {pools.map((p) => (
          <tr key={p.poolId}>
            <td>
              {coinLabel(p.typeA)} / {coinLabel(p.typeB)}
            </td>
            <td>
              {compactNumber(p.reserveA, KNOWN_COINS[p.typeA]?.decimals ?? 9)} /{" "}
              {compactNumber(p.reserveB, KNOWN_COINS[p.typeB]?.decimals ?? 9)}
            </td>
            <td>{compactNumber(p.lpSupply, 9)}</td>
            <td>
              <a
                href={`https://suiscan.xyz/mainnet/object/${p.poolId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {shortAddr(p.poolId)}
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
