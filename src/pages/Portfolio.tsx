import { useEffect, useState } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { listUserPositions } from "../chain/darbitex";
import { coinLabel } from "../chain/coins";
import { compactNumber, shortAddr } from "../chain/format";

interface Position {
  id: string;
  poolId: string;
  shares: bigint;
  typeA: string;
  typeB: string;
}

export function PortfolioBody() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!account) {
      setPositions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listUserPositions(client, account.address)
      .then((ps) => {
        if (!cancelled) setPositions(ps);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, account]);

  if (!account) {
    return <div className="empty-state">Connect a wallet to view your LP positions.</div>;
  }
  if (loading) return <div className="page-loading">Loading positions…</div>;
  if (positions.length === 0) {
    return (
      <div className="empty-state">
        <p>You have no Darbitex Sui LP positions.</p>
        <p className="dim">
          Add liquidity from the Pools tab once a pool exists for your pair.
        </p>
      </div>
    );
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Pair</th>
          <th>Shares</th>
          <th>Position ID</th>
          <th>Pool</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => (
          <tr key={p.id}>
            <td>
              {coinLabel(p.typeA)} / {coinLabel(p.typeB)}
            </td>
            <td>{compactNumber(p.shares, 9)}</td>
            <td>
              <a
                href={`https://suiscan.xyz/mainnet/object/${p.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {shortAddr(p.id)}
              </a>
            </td>
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
