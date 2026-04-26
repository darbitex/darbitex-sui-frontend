import { useEffect, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import {
  buildLockerClaimFeesTx,
  buildRedeemLockedTx,
  formatUnlockEta,
  isUnlocked,
  listUserLockedPositions,
  type LockedPositionView,
} from "../chain/locker";
import { coinLabel } from "../chain/coins";
import { shortAddr } from "../chain/format";

export function LockedBody() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const [items, setItems] = useState<LockedPositionView[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  async function refresh() {
    if (!account) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      setItems(await listUserLockedPositions(client, account.address));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!account) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listUserLockedPositions(client, account.address)
      .then((ps) => {
        if (!cancelled) setItems(ps);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, account]);

  if (!account) {
    return (
      <div className="empty-state">
        Connect a wallet to view your locked LP positions.
      </div>
    );
  }
  if (loading) return <div className="page-loading">Loading locked positions…</div>;
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <p>No locked LP positions.</p>
        <p className="dim">
          Lock an LP position from the Portfolio tab to wrap it in an
          immutable time-gate.
        </p>
      </div>
    );
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Pair</th>
          <th>Status</th>
          <th>Unlock ETA</th>
          <th>Locker</th>
          <th>Pool</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => (
          <LockedRow key={it.id} item={it} now={now} onChanged={refresh} />
        ))}
      </tbody>
    </table>
  );
}

function LockedRow({
  item,
  now,
  onChanged,
}: {
  item: LockedPositionView;
  now: number;
  onChanged: () => void;
}) {
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const unlocked = isUnlocked(item.unlockAtMs, now);

  async function onClaim() {
    setStatusMsg(null);
    try {
      const tx = buildLockerClaimFeesTx({
        typeA: item.typeA,
        typeB: item.typeB,
        lockedId: item.id,
        poolId: item.poolId,
      });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Claimed — ${res.digest.slice(0, 10)}…`);
      onChanged();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  async function onRedeem() {
    setStatusMsg(null);
    try {
      const tx = buildRedeemLockedTx({
        typeA: item.typeA,
        typeB: item.typeB,
        lockedId: item.id,
      });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Redeemed — ${res.digest.slice(0, 10)}…`);
      onChanged();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  return (
    <>
      <tr>
        <td>
          {coinLabel(item.typeA)} / {coinLabel(item.typeB)}
        </td>
        <td style={{ color: unlocked ? "#ff8800" : "#888" }}>
          {unlocked ? "unlocked" : "locked"}
        </td>
        <td>{formatUnlockEta(item.unlockAtMs, now)}</td>
        <td>
          <a
            href={`https://suiscan.xyz/mainnet/object/${item.id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {shortAddr(item.id)}
          </a>
        </td>
        <td>
          {item.poolId ? (
            <a
              href={`https://suiscan.xyz/mainnet/object/${item.poolId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {shortAddr(item.poolId)}
            </a>
          ) : (
            <span className="dim">—</span>
          )}
        </td>
        <td>
          <button
            className="btn-ghost"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Close" : "Manage"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6}>
            <div style={{ padding: "12px 0" }}>
              <p className="dim">
                Locker is permissionless and immutable. Claim is open
                throughout the lock; redeem unlocks the inner LpPosition
                only after <code>unlock_at_ms</code>. Redeem does not touch
                the pool — principal recovery works regardless of pool
                liveness.
              </p>
              <div className="row">
                <button
                  className="btn-ghost"
                  onClick={onClaim}
                  disabled={isPending}
                >
                  {isPending ? "Submitting…" : "Claim fees"}
                </button>
                <button
                  className="btn-primary"
                  onClick={onRedeem}
                  disabled={isPending || !unlocked}
                  title={unlocked ? undefined : "Still locked"}
                >
                  {isPending
                    ? "Submitting…"
                    : unlocked
                      ? "Redeem"
                      : "Locked"}
                </button>
              </div>
              {statusMsg && <div className="status">{statusMsg}</div>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
