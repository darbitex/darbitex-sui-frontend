import { useEffect, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import {
  buildClaimFeesTx,
  buildRemoveLiquidityTx,
  listUserPositions,
  readPool,
  type PoolView,
} from "../chain/darbitex";
import {
  buildLockPositionTx,
  LOCK_PRESETS_MS,
} from "../chain/locker";
import { coinLabel } from "../chain/coins";
import { compactNumber, shortAddr } from "../chain/format";

interface Position {
  id: string;
  poolId: string;
  shares: bigint;
  typeA: string;
  typeB: string;
}

const PERCENT_OPTIONS = [25, 50, 75, 100] as const;

export function PortfolioBody() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function refresh() {
    if (!account) return;
    setLoading(true);
    try {
      setPositions(await listUserPositions(client, account.address));
    } finally {
      setLoading(false);
    }
  }

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
        <p className="dim">Add liquidity from the Pools tab.</p>
      </div>
    );
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Pair</th>
          <th>Shares</th>
          <th>Position</th>
          <th>Pool</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => {
          const isExpanded = expanded === p.id;
          return (
            <>
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
                <td>
                  <button
                    className="btn-ghost"
                    onClick={() => setExpanded(isExpanded ? null : p.id)}
                  >
                    {isExpanded ? "Close" : "Manage"}
                  </button>
                </td>
              </tr>
              {isExpanded && (
                <tr key={`${p.id}-actions`}>
                  <td colSpan={5}>
                    <PositionActions
                      position={p}
                      onChanged={() => { setExpanded(null); refresh(); }}
                    />
                  </td>
                </tr>
              )}
            </>
          );
        })}
      </tbody>
    </table>
  );
}

function PositionActions({
  position,
  onChanged,
}: {
  position: Position;
  onChanged: () => void;
}) {
  const client = useSuiClient();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [pool, setPool] = useState<PoolView | null>(null);
  const [percent, setPercent] = useState<number>(100);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [lockMs, setLockMs] = useState<number>(LOCK_PRESETS_MS[1].ms);

  useEffect(() => {
    let cancelled = false;
    readPool(client, position.poolId, position.typeA, position.typeB).then((p) => {
      if (!cancelled) setPool(p);
    });
    return () => {
      cancelled = true;
    };
  }, [client, position.poolId, position.typeA, position.typeB]);

  async function onClaim() {
    setStatusMsg(null);
    try {
      // Need the pool ref; if not yet loaded, refuse — don't guess.
      if (!pool) {
        setStatusMsg("Pool not loaded yet, retry.");
        return;
      }
      const tx = buildClaimFeesTx(pool, position.id, BigInt(Date.now() + 60_000));
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Claimed — ${res.digest.slice(0, 10)}…`);
      onChanged();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  // Per remove_liquidity_entry's Move signature, the WHOLE LpPosition is
  // consumed by value — there's no partial-burn primitive. Percentages
  // <100 are simulated by burning the position then re-adding the kept
  // share back as a new position. To keep v1 simple we only expose 100%
  // remove. Partial-burn UX requires a multi-step PTB and is deferred.
  async function onRemove() {
    setStatusMsg(null);
    try {
      if (!pool) {
        setStatusMsg("Pool not loaded yet, retry.");
        return;
      }
      if (percent !== 100) {
        setStatusMsg(
          "Partial removal not supported in v1 — Move burns the whole position. Use 100%.",
        );
        return;
      }
      const tx = buildRemoveLiquidityTx({
        pool,
        positionId: position.id,
        minA: 0n,
        minB: 0n,
        deadlineMs: BigInt(Date.now() + 60_000),
      });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Removed — ${res.digest.slice(0, 10)}…`);
      onChanged();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  async function onLock() {
    setStatusMsg(null);
    try {
      const unlockAt = BigInt(Date.now() + lockMs);
      const tx = buildLockPositionTx({
        typeA: position.typeA,
        typeB: position.typeB,
        positionId: position.id,
        unlockAtMs: unlockAt,
      });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Locked — ${res.digest.slice(0, 10)}…`);
      onChanged();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  return (
    <div style={{ padding: "12px 0" }}>
      <div className="row">
        <button className="btn-ghost" onClick={onClaim} disabled={isPending || !pool}>
          {isPending ? "Submitting…" : "Claim fees"}
        </button>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <span className="field-label">Lock duration</span>
        {LOCK_PRESETS_MS.map((p) => (
          <button
            key={p.ms}
            className={lockMs === p.ms ? "btn-primary" : "btn-ghost"}
            onClick={() => setLockMs(p.ms)}
            type="button"
          >
            {p.label}
          </button>
        ))}
        <button
          className="btn-primary"
          onClick={onLock}
          disabled={isPending}
          style={{ marginLeft: "auto" }}
        >
          {isPending ? "Submitting…" : "Lock position"}
        </button>
      </div>
      <p className="dim">
        Wraps the LpPosition in an immutable LockedPosition. One-way: no
        early unlock, no extend, no admin path. Fees claimable throughout
        the lock period. View locked positions in the Locked tab.
      </p>

      <div className="row" style={{ marginTop: 12 }}>
        <span className="field-label">Remove</span>
        {PERCENT_OPTIONS.map((p) => (
          <button
            key={p}
            className={percent === p ? "btn-primary" : "btn-ghost"}
            onClick={() => setPercent(p)}
            type="button"
          >
            {p}%
          </button>
        ))}
      </div>
      <p className="dim">
        Note: Move's <code>remove_liquidity_entry</code> burns the entire
        position. v1 only supports 100% removal. (For partial, withdraw all
        and re-add the part you want to keep.)
      </p>
      <button
        className="btn-primary"
        onClick={onRemove}
        disabled={isPending || !pool}
        style={{ marginTop: 8 }}
      >
        {isPending ? "Submitting…" : "Remove liquidity"}
      </button>

      {statusMsg && <div className="status">{statusMsg}</div>}
    </div>
  );
}
