import { useEffect, useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { listPools, type PoolView } from "../chain/darbitex";
import {
  buildClaimStakedLpFeesTx,
  buildClaimStakingRewardsTx,
  buildCreateRewardPoolTx,
  buildDepositRewardsTx,
  buildStakeLockedLpTx,
  buildStakeLpTx,
  buildUnstakeLockedTx,
  buildUnstakeNakedTx,
  listRewardPools,
  listUserStakes,
  readPendingReward,
  type RewardPoolView,
  type StakeView,
} from "../chain/staking";
import { listUserPositions } from "../chain/darbitex";
import { listUserLockedPositions } from "../chain/locker";
import {
  coinLabel,
  KNOWN_COINS,
  normalizeType,
  sortPair,
} from "../chain/coins";
import {
  bpsToPct,
  compactNumber,
  parseUnits,
  shortAddr,
} from "../chain/format";

const KNOWN_TYPES = Object.keys(KNOWN_COINS);

export function StakingBody() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const [rewardPools, setRewardPools] = useState<RewardPoolView[]>([]);
  const [pools, setPools] = useState<PoolView[]>([]);
  const [stakes, setStakes] = useState<StakeView[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [rps, ps, ss] = await Promise.all([
        listRewardPools(client),
        listPools(client),
        account ? listUserStakes(client, account.address) : Promise.resolve([]),
      ]);
      setRewardPools(rps);
      setPools(ps);
      setStakes(ss);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listRewardPools(client),
      listPools(client),
      account ? listUserStakes(client, account.address) : Promise.resolve([]),
    ])
      .then(([rps, ps, ss]) => {
        if (cancelled) return;
        setRewardPools(rps);
        setPools(ps);
        setStakes(ss);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, account]);

  return (
    <div>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn-ghost" onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancel" : "+ Create reward pool"}
        </button>
      </div>

      {creating && (
        <CreateRewardPoolForm
          pools={pools}
          onCreated={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}

      {loading && <div className="page-loading">Loading reward pools…</div>}

      {!loading && rewardPools.length === 0 && !creating && (
        <div className="empty-state">
          <p>No reward pools yet.</p>
          <p className="dim">
            Reward pools are permissionless and agnostic — anyone can create
            one for any pool with any reward coin. Click <strong>+ Create
            reward pool</strong> above.
          </p>
        </div>
      )}

      {!loading && rewardPools.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Pair</th>
              <th>Reward</th>
              <th>Max rate / sec</th>
              <th>Staked / supply</th>
              <th>Reward balance</th>
              <th>Reward pool</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rewardPools.map((rp) => {
              const pool = pools.find((p) => p.poolId === rp.poolId);
              const isExpanded = expanded === rp.rewardPoolId;
              const userStakes = stakes.filter(
                (s) => s.rewardPoolId === rp.rewardPoolId,
              );
              const stakedFractionBps =
                pool && pool.lpSupply > 0n
                  ? Number((rp.totalStakedShares * 10_000n) / pool.lpSupply)
                  : 0;
              const rewardDecimals =
                KNOWN_COINS[rp.typeR]?.decimals ?? 9;
              return (
                <RewardPoolRow
                  key={rp.rewardPoolId}
                  rp={rp}
                  pool={pool}
                  userStakes={userStakes}
                  stakedFractionBps={stakedFractionBps}
                  rewardDecimals={rewardDecimals}
                  isExpanded={isExpanded}
                  onToggle={() =>
                    setExpanded(isExpanded ? null : rp.rewardPoolId)
                  }
                  onChanged={() => {
                    setExpanded(null);
                    refresh();
                  }}
                />
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RewardPoolRow({
  rp,
  pool,
  userStakes,
  stakedFractionBps,
  rewardDecimals,
  isExpanded,
  onToggle,
  onChanged,
}: {
  rp: RewardPoolView;
  pool: PoolView | undefined;
  userStakes: StakeView[];
  stakedFractionBps: number;
  rewardDecimals: number;
  isExpanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  return (
    <>
      <tr>
        <td>
          {coinLabel(rp.typeA)} / {coinLabel(rp.typeB)}
        </td>
        <td>{coinLabel(rp.typeR)}</td>
        <td>{compactNumber(rp.maxRatePerSec, rewardDecimals)}</td>
        <td>
          {pool ? (
            <>
              {compactNumber(rp.totalStakedShares, 9)}{" "}
              <span className="dim">
                / {compactNumber(pool.lpSupply, 9)} ({bpsToPct(stakedFractionBps)})
              </span>
            </>
          ) : (
            <span className="dim">pool missing</span>
          )}
        </td>
        <td>{compactNumber(rp.rewardBalance, rewardDecimals)}</td>
        <td>
          <a
            href={`https://suiscan.xyz/mainnet/object/${rp.rewardPoolId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {shortAddr(rp.rewardPoolId)}
          </a>
        </td>
        <td>
          <button className="btn-ghost" onClick={onToggle}>
            {isExpanded ? "Close" : "Manage"}
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7}>
            {pool ? (
              <RewardPoolPanel
                rp={rp}
                pool={pool}
                userStakes={userStakes}
                rewardDecimals={rewardDecimals}
                onChanged={onChanged}
              />
            ) : (
              <div className="empty-state">
                Underlying pool not found. The reward pool was created against
                a pool that is not in the on-chain pool index.
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function RewardPoolPanel({
  rp,
  pool,
  userStakes,
  rewardDecimals,
  onChanged,
}: {
  rp: RewardPoolView;
  pool: PoolView;
  userStakes: StakeView[];
  rewardDecimals: number;
  onChanged: () => void;
}) {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [depositStr, setDepositStr] = useState("");
  const [nakedPositions, setNakedPositions] = useState<
    { id: string; shares: bigint }[]
  >([]);
  const [lockedPositions, setLockedPositions] = useState<
    { id: string; shares: bigint }[]
  >([]);
  const [pending, setPending] = useState<Record<string, bigint>>({});

  // Fetch the user's matching naked + locked positions for this pool.
  useEffect(() => {
    if (!account) {
      setNakedPositions([]);
      setLockedPositions([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      listUserPositions(client, account.address),
      listUserLockedPositions(client, account.address),
    ]).then(([naked, locked]) => {
      if (cancelled) return;
      setNakedPositions(
        naked
          .filter((p) => p.poolId === pool.poolId)
          .map((p) => ({ id: p.id, shares: p.shares })),
      );
      setLockedPositions(
        locked
          .filter((l) => l.poolId === pool.poolId)
          .map((l) => ({ id: l.id, shares: 0n })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [client, account, pool.poolId, statusMsg]);

  // Read pending reward for each of the user's stakes in this reward pool
  // via devInspect — no gas.
  useEffect(() => {
    if (!account || userStakes.length === 0) {
      setPending({});
      return;
    }
    let cancelled = false;
    Promise.all(
      userStakes.map((s) =>
        readPendingReward(client, {
          typeA: rp.typeA,
          typeB: rp.typeB,
          typeR: rp.typeR,
          stakeId: s.id,
          rewardPoolId: rp.rewardPoolId,
          poolId: pool.poolId,
          sender: account.address,
        })
          .then((v) => [s.id, v] as const)
          .catch(() => [s.id, 0n] as const),
      ),
    ).then((entries) => {
      if (cancelled) return;
      const m: Record<string, bigint> = {};
      for (const [id, v] of entries) m[id] = v;
      setPending(m);
    });
    return () => {
      cancelled = true;
    };
  }, [client, account, userStakes, rp.typeA, rp.typeB, rp.typeR, rp.rewardPoolId, pool.poolId, statusMsg]);

  async function onStakeNaked(positionId: string) {
    setStatusMsg(null);
    try {
      const tx = buildStakeLpTx({
        typeA: rp.typeA,
        typeB: rp.typeB,
        typeR: rp.typeR,
        rewardPoolId: rp.rewardPoolId,
        poolId: pool.poolId,
        positionId,
      });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Staked — ${res.digest.slice(0, 10)}…`);
      onChanged();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  async function onStakeLocked(lockedId: string) {
    setStatusMsg(null);
    try {
      const tx = buildStakeLockedLpTx({
        typeA: rp.typeA,
        typeB: rp.typeB,
        typeR: rp.typeR,
        rewardPoolId: rp.rewardPoolId,
        poolId: pool.poolId,
        lockedId,
      });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Staked locked — ${res.digest.slice(0, 10)}…`);
      onChanged();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  async function onClaim(stakeId: string) {
    setStatusMsg(null);
    try {
      const tx = buildClaimStakingRewardsTx({
        typeA: rp.typeA,
        typeB: rp.typeB,
        typeR: rp.typeR,
        stakeId,
        rewardPoolId: rp.rewardPoolId,
        poolId: pool.poolId,
      });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Claimed — ${res.digest.slice(0, 10)}…`);
      onChanged();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  async function onClaimLpFees(stakeId: string) {
    setStatusMsg(null);
    try {
      const tx = buildClaimStakedLpFeesTx({
        typeA: rp.typeA,
        typeB: rp.typeB,
        typeR: rp.typeR,
        stakeId,
        poolId: pool.poolId,
      });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`LP fees claimed — ${res.digest.slice(0, 10)}…`);
      onChanged();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  async function onUnstake(stake: StakeView) {
    setStatusMsg(null);
    try {
      const tx = stake.isLocked
        ? buildUnstakeLockedTx({
            typeA: rp.typeA,
            typeB: rp.typeB,
            typeR: rp.typeR,
            stakeId: stake.id,
            rewardPoolId: rp.rewardPoolId,
            poolId: pool.poolId,
          })
        : buildUnstakeNakedTx({
            typeA: rp.typeA,
            typeB: rp.typeB,
            typeR: rp.typeR,
            stakeId: stake.id,
            rewardPoolId: rp.rewardPoolId,
            poolId: pool.poolId,
          });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Unstaked — ${res.digest.slice(0, 10)}…`);
      onChanged();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  async function onDeposit() {
    if (!account) return;
    setStatusMsg(null);
    try {
      const raw = parseUnits(depositStr || "0", rewardDecimals);
      if (raw === 0n) {
        setStatusMsg("Amount must be > 0.");
        return;
      }
      const tx = await buildDepositRewardsTx(client, {
        typeA: rp.typeA,
        typeB: rp.typeB,
        typeR: rp.typeR,
        rewardPoolId: rp.rewardPoolId,
        poolId: pool.poolId,
        amount: raw,
        sender: account.address,
      });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Deposited — ${res.digest.slice(0, 10)}…`);
      setDepositStr("");
      onChanged();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  return (
    <div style={{ padding: "12px 0" }}>
      {/* User stakes */}
      {userStakes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="field-label">Your stakes</div>
          {userStakes.map((s) => {
            const p = pending[s.id] ?? 0n;
            return (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 0",
                  borderTop: "1px dashed #1a1a1a",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div className="dim" style={{ fontSize: 11 }}>
                    {s.isLocked ? "locked" : "naked"} · {s.shares.toString()} shares
                  </div>
                  <code style={{ color: "#ff8800", fontSize: 11 }}>
                    {s.id.slice(0, 10)}…{s.id.slice(-6)}
                  </code>
                  <div className="dim" style={{ fontSize: 11 }}>
                    pending: {compactNumber(p, rewardDecimals)} {coinLabel(rp.typeR)}
                  </div>
                </div>
                <div className="row" style={{ gap: 6, margin: 0 }}>
                  <button
                    className="btn-ghost"
                    style={{ padding: "6px 10px", fontSize: 11 }}
                    disabled={isPending || p === 0n}
                    onClick={() => onClaim(s.id)}
                  >
                    Claim rewards
                  </button>
                  <button
                    className="btn-ghost"
                    style={{ padding: "6px 10px", fontSize: 11 }}
                    disabled={isPending}
                    onClick={() => onClaimLpFees(s.id)}
                  >
                    Claim LP fees
                  </button>
                  <button
                    className="btn-ghost"
                    style={{ padding: "6px 10px", fontSize: 11 }}
                    disabled={isPending}
                    onClick={() => onUnstake(s)}
                  >
                    Unstake
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stake new position */}
      {(nakedPositions.length > 0 || lockedPositions.length > 0) && (
        <div style={{ marginBottom: 16 }}>
          <div className="field-label">Stake an existing position</div>
          {nakedPositions.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                padding: "6px 0",
                flexWrap: "wrap",
              }}
            >
              <div>
                <span className="dim" style={{ fontSize: 11 }}>naked · </span>
                <code style={{ color: "#ff8800", fontSize: 11 }}>
                  {p.id.slice(0, 10)}…{p.id.slice(-6)}
                </code>
                <span className="dim" style={{ fontSize: 11 }}>
                  {" "}· {p.shares.toString()} shares
                </span>
              </div>
              <button
                className="btn-primary"
                style={{ padding: "6px 12px", fontSize: 12 }}
                disabled={isPending}
                onClick={() => onStakeNaked(p.id)}
              >
                Stake naked
              </button>
            </div>
          ))}
          {lockedPositions.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                padding: "6px 0",
                flexWrap: "wrap",
              }}
            >
              <div>
                <span className="dim" style={{ fontSize: 11 }}>locked · </span>
                <code style={{ color: "#ff8800", fontSize: 11 }}>
                  {p.id.slice(0, 10)}…{p.id.slice(-6)}
                </code>
              </div>
              <button
                className="btn-primary"
                style={{ padding: "6px 12px", fontSize: 12 }}
                disabled={isPending}
                onClick={() => onStakeLocked(p.id)}
              >
                Stake locked
              </button>
            </div>
          ))}
        </div>
      )}

      {!account && (
        <div className="empty-state" style={{ padding: 12 }}>
          Connect a wallet to stake or claim.
        </div>
      )}
      {account &&
        userStakes.length === 0 &&
        nakedPositions.length === 0 &&
        lockedPositions.length === 0 && (
          <p className="dim">
            You have no LP positions for this pool. Add liquidity first from
            the Pools tab, then return here to stake.
          </p>
        )}

      {/* Permissionless deposit */}
      <div className="panel" style={{ marginTop: 16 }}>
        <h2>Top up reward balance</h2>
        <p className="dim">
          Permissionless. Anyone can deposit {coinLabel(rp.typeR)} into this
          reward pool — there is no admin gate. Emission is bounded by free
          balance (physical − committed).
        </p>
        <div className="row">
          <div className="amount-row" style={{ flex: 1 }}>
            <input
              className="input"
              value={depositStr}
              onChange={(e) => setDepositStr(e.target.value)}
              placeholder="0.0"
              inputMode="decimal"
            />
            <span className="amount-sym">{coinLabel(rp.typeR)}</span>
          </div>
          <button
            className="btn-primary"
            onClick={onDeposit}
            disabled={isPending || !account}
          >
            {isPending ? "Submitting…" : "Deposit"}
          </button>
        </div>
      </div>

      {statusMsg && <div className="status">{statusMsg}</div>}
    </div>
  );
}

function CreateRewardPoolForm({
  pools,
  onCreated,
}: {
  pools: PoolView[];
  onCreated: () => void;
}) {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [poolId, setPoolId] = useState(pools[0]?.poolId ?? "");
  const [rewardType, setRewardType] = useState(KNOWN_TYPES[0]);
  const [rateStr, setRateStr] = useState("");
  const [initialStr, setInitialStr] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const selectedPool = useMemo(
    () => pools.find((p) => p.poolId === poolId),
    [pools, poolId],
  );

  const rewardDecimals = KNOWN_COINS[rewardType]?.decimals ?? 9;

  // Move's create_lp_reward_pool does NOT enforce sortPair on (A,B);
  // it just stores the type args as-passed. But assert_sorted runs at
  // the AMM factory level, so the pool's stored type order is canonical
  // already — pass typeA/typeB straight from PoolView.
  async function onSubmit() {
    if (!account || !selectedPool) return;
    setStatusMsg(null);
    try {
      const rate = parseUnits(rateStr || "0", rewardDecimals);
      const initial = parseUnits(initialStr || "0", rewardDecimals);
      if (rate === 0n) {
        setStatusMsg("max_rate_per_sec must be > 0.");
        return;
      }
      // Canonicalize order (defensive — should match pool's stored order).
      const [sortedA, sortedB] = sortPair(selectedPool.typeA, selectedPool.typeB);
      if (
        normalizeType(sortedA) !== normalizeType(selectedPool.typeA) ||
        normalizeType(sortedB) !== normalizeType(selectedPool.typeB)
      ) {
        setStatusMsg("Pool type order is non-canonical — refusing.");
        return;
      }
      const tx = await buildCreateRewardPoolTx(client, {
        typeA: sortedA,
        typeB: sortedB,
        typeR: rewardType,
        poolId,
        maxRatePerSec: rate,
        initialReward: initial,
        sender: account.address,
      });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Created — ${res.digest.slice(0, 10)}…`);
      onCreated();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  if (!account) {
    return (
      <div className="empty-state">Connect a wallet to create a reward pool.</div>
    );
  }
  if (pools.length === 0) {
    return (
      <div className="empty-state">
        No AMM pools exist yet. Create a pool from the Liquidity tab first.
      </div>
    );
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h2>Create reward pool</h2>
      <p className="dim">
        Permissionless. Bind a Coin&lt;R&gt; reward stream to an LP pool.
        Emission rate scales with staked / lp_supply × max_rate_per_sec —
        no admin lever, no boost schedule. Initial deposit is required (any
        positive amount).
      </p>

      <div className="grid-2">
        <div>
          <label className="field-label">AMM pool</label>
          <select
            className="select"
            value={poolId}
            onChange={(e) => setPoolId(e.target.value)}
          >
            {pools.map((p) => (
              <option key={p.poolId} value={p.poolId}>
                {coinLabel(p.typeA)} / {coinLabel(p.typeB)} —{" "}
                {shortAddr(p.poolId)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label">Reward coin</label>
          <select
            className="select"
            value={rewardType}
            onChange={(e) => setRewardType(e.target.value)}
          >
            {KNOWN_TYPES.map((t) => (
              <option key={t} value={t}>
                {coinLabel(t)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 12 }}>
        <div>
          <label className="field-label">max_rate_per_sec</label>
          <div className="amount-row">
            <input
              className="input"
              value={rateStr}
              onChange={(e) => setRateStr(e.target.value)}
              placeholder="0.0"
              inputMode="decimal"
            />
            <span className="amount-sym">{coinLabel(rewardType)}</span>
          </div>
          <p className="dim">
            Emission cap when 100% of LP is staked. Effective rate scales
            down by staked / lp_supply.
          </p>
        </div>

        <div>
          <label className="field-label">Initial reward deposit</label>
          <div className="amount-row">
            <input
              className="input"
              value={initialStr}
              onChange={(e) => setInitialStr(e.target.value)}
              placeholder="0.0"
              inputMode="decimal"
            />
            <span className="amount-sym">{coinLabel(rewardType)}</span>
          </div>
          <p className="dim">
            Required by the Move signature. Anyone can top up later via
            deposit_rewards.
          </p>
        </div>
      </div>

      <button
        className="btn-primary"
        onClick={onSubmit}
        disabled={isPending}
        style={{ marginTop: 12 }}
      >
        {isPending ? "Submitting…" : "Create reward pool"}
      </button>
      {statusMsg && <div className="status">{statusMsg}</div>}
    </div>
  );
}
