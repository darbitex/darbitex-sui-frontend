import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { STAKING_PACKAGE } from "../config";
import { normalizeType } from "./coins";
import { takeExactCoin } from "./coinSelect";

type SuiClient = SuiJsonRpcClient;

export interface RewardPoolView {
  rewardPoolId: string;
  poolId: string;
  typeA: string;
  typeB: string;
  typeR: string;
  maxRatePerSec: bigint;
  totalStakedShares: bigint;
  rewardBalance: bigint;
  committedRewards: bigint;
  accRewardPerShare: bigint;
  lastRewardTimeMs: bigint;
}

interface RewardPoolCreatedEvent {
  reward_pool_id: string;
  pool_id: string;
  creator: string;
  max_rate_per_sec: string;
  initial_reward: string;
  timestamp_ms: string;
}

export interface StakeView {
  id: string;
  rewardPoolId: string;
  shares: bigint;
  isLocked: boolean;
  innerSourceId: string;
  typeA: string;
  typeB: string;
  typeR: string;
}

// staking::create_lp_reward_pool_entry<A,B,R>(pool, max_rate_per_sec, initial_reward, clock, ctx)
// Permissionless. Initial reward Coin<R> is required (≥0; can be small).
export async function buildCreateRewardPoolTx(
  client: SuiClient,
  args: {
    typeA: string;
    typeB: string;
    typeR: string;
    poolId: string;
    maxRatePerSec: bigint;
    initialReward: bigint;
    sender: string;
  },
): Promise<Transaction> {
  const tx = new Transaction();
  const reward = await takeExactCoin(
    client,
    tx,
    args.sender,
    args.typeR,
    args.initialReward,
  );
  tx.moveCall({
    target: `${STAKING_PACKAGE}::staking::create_lp_reward_pool_entry`,
    typeArguments: [args.typeA, args.typeB, args.typeR],
    arguments: [
      tx.object(args.poolId),
      tx.pure.u64(args.maxRatePerSec),
      reward,
      tx.object("0x6"),
    ],
  });
  return tx;
}

// staking::deposit_rewards<A,B,R>(&mut LpRewardPool, &Pool, Coin<R>, clock, ctx)
// Permissionless top-up. update_pool runs first; safe under any state.
export async function buildDepositRewardsTx(
  client: SuiClient,
  args: {
    typeA: string;
    typeB: string;
    typeR: string;
    rewardPoolId: string;
    poolId: string;
    amount: bigint;
    sender: string;
  },
): Promise<Transaction> {
  const tx = new Transaction();
  const reward = await takeExactCoin(
    client,
    tx,
    args.sender,
    args.typeR,
    args.amount,
  );
  tx.moveCall({
    target: `${STAKING_PACKAGE}::staking::deposit_rewards`,
    typeArguments: [args.typeA, args.typeB, args.typeR],
    arguments: [
      tx.object(args.rewardPoolId),
      tx.object(args.poolId),
      reward,
      tx.object("0x6"),
    ],
  });
  return tx;
}

// staking::stake_lp_entry<A,B,R>(rp, pool, position, clock, ctx)
// Naked LP: position consumed by value, StakePosition transferred to sender.
export function buildStakeLpTx(args: {
  typeA: string;
  typeB: string;
  typeR: string;
  rewardPoolId: string;
  poolId: string;
  positionId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${STAKING_PACKAGE}::staking::stake_lp_entry`,
    typeArguments: [args.typeA, args.typeB, args.typeR],
    arguments: [
      tx.object(args.rewardPoolId),
      tx.object(args.poolId),
      tx.object(args.positionId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// staking::stake_locked_lp_entry<A,B,R>(rp, pool, locked, clock, ctx)
// Locked variant: LockedPosition consumed by value (lock invariant inherited).
export function buildStakeLockedLpTx(args: {
  typeA: string;
  typeB: string;
  typeR: string;
  rewardPoolId: string;
  poolId: string;
  lockedId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${STAKING_PACKAGE}::staking::stake_locked_lp_entry`,
    typeArguments: [args.typeA, args.typeB, args.typeR],
    arguments: [
      tx.object(args.rewardPoolId),
      tx.object(args.poolId),
      tx.object(args.lockedId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// staking::claim_rewards_entry<A,B,R>(stake, rp, pool, clock, ctx)
// Aborts E_NOTHING_CLAIMABLE on zero pending. Coin<R> forwarded to sender.
export function buildClaimStakingRewardsTx(args: {
  typeA: string;
  typeB: string;
  typeR: string;
  stakeId: string;
  rewardPoolId: string;
  poolId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${STAKING_PACKAGE}::staking::claim_rewards_entry`,
    typeArguments: [args.typeA, args.typeB, args.typeR],
    arguments: [
      tx.object(args.stakeId),
      tx.object(args.rewardPoolId),
      tx.object(args.poolId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// staking::claim_lp_fees_entry<A,B,R>(stake, &mut Pool, clock, ctx)
// Dispatches on the inner enum; locked variant proxies through lock::claim_fees.
export function buildClaimStakedLpFeesTx(args: {
  typeA: string;
  typeB: string;
  typeR: string;
  stakeId: string;
  poolId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${STAKING_PACKAGE}::staking::claim_lp_fees_entry`,
    typeArguments: [args.typeA, args.typeB, args.typeR],
    arguments: [
      tx.object(args.stakeId),
      tx.object(args.poolId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// staking::unstake_naked_entry<A,B,R>(stake, rp, pool, clock, ctx)
// Aborts E_NOT_NAKED if stake wraps a LockedPosition.
export function buildUnstakeNakedTx(args: {
  typeA: string;
  typeB: string;
  typeR: string;
  stakeId: string;
  rewardPoolId: string;
  poolId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${STAKING_PACKAGE}::staking::unstake_naked_entry`,
    typeArguments: [args.typeA, args.typeB, args.typeR],
    arguments: [
      tx.object(args.stakeId),
      tx.object(args.rewardPoolId),
      tx.object(args.poolId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// staking::unstake_locked_entry<A,B,R>(stake, rp, pool, clock, ctx)
// Aborts E_NOT_LOCKED if stake wraps a naked LpPosition. The returned
// LockedPosition retains its time-gate; caller must still redeem after
// unlock_at_ms to extract the underlying LpPosition.
export function buildUnstakeLockedTx(args: {
  typeA: string;
  typeB: string;
  typeR: string;
  stakeId: string;
  rewardPoolId: string;
  poolId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${STAKING_PACKAGE}::staking::unstake_locked_entry`,
    typeArguments: [args.typeA, args.typeB, args.typeR],
    arguments: [
      tx.object(args.stakeId),
      tx.object(args.rewardPoolId),
      tx.object(args.poolId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// Reward pools are shared objects but `getOwnedObjects` doesn't list
// shared objects. Discover via the LpRewardPoolCreated event then fetch
// each shared object's current state by id.
export async function listRewardPools(client: SuiClient): Promise<RewardPoolView[]> {
  const events = await client.queryEvents({
    query: {
      MoveEventType: `${STAKING_PACKAGE}::staking::LpRewardPoolCreated`,
    },
    limit: 100,
    order: "descending",
  });

  const pools: RewardPoolView[] = [];
  // De-dup by id (events should be unique per pool but be defensive).
  const seen = new Set<string>();
  for (const ev of events.data) {
    const e = ev.parsedJson as RewardPoolCreatedEvent | undefined;
    if (!e) continue;
    if (seen.has(e.reward_pool_id)) continue;
    seen.add(e.reward_pool_id);

    const obj = await client.getObject({
      id: e.reward_pool_id,
      options: { showContent: true, showType: true },
    });
    if (!obj.data?.content || obj.data.content.dataType !== "moveObject") continue;
    const type = obj.data.type ?? "";
    // Type form: 0x..::staking::LpRewardPool<A,B,R>
    const m = type.match(/<(.+),\s*(.+),\s*(.+)>$/);
    if (!m) continue;
    const fields = (
      obj.data.content as { fields: Record<string, unknown> }
    ).fields;
    pools.push({
      rewardPoolId: e.reward_pool_id,
      poolId: (fields.pool_id as string) ?? e.pool_id,
      typeA: normalizeType(m[1].trim()),
      typeB: normalizeType(m[2].trim()),
      typeR: normalizeType(m[3].trim()),
      maxRatePerSec: BigInt((fields.max_rate_per_sec as string) ?? "0"),
      totalStakedShares: BigInt(
        (fields.total_staked_shares as string) ?? "0",
      ),
      rewardBalance: BigInt((fields.reward_balance as string) ?? "0"),
      committedRewards: BigInt((fields.committed_rewards as string) ?? "0"),
      accRewardPerShare: BigInt(
        (fields.acc_reward_per_share as string) ?? "0",
      ),
      lastRewardTimeMs: BigInt(
        (fields.last_reward_time_ms as string) ?? "0",
      ),
    });
  }
  return pools;
}

export async function listUserStakes(
  client: SuiClient,
  owner: string,
): Promise<StakeView[]> {
  const result: StakeView[] = [];
  let cursor: string | null | undefined = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  while (true) {
    const page: any = await client.getOwnedObjects({
      owner,
      filter: { StructType: `${STAKING_PACKAGE}::staking::StakePosition` },
      options: { showContent: true, showType: true },
      cursor,
    });
    for (const o of page.data) {
      if (!o.data) continue;
      const type = o.data.type ?? "";
      const m = type.match(/<(.+),\s*(.+),\s*(.+)>$/);
      if (!m) continue;
      const content = o.data.content;
      if (!content || content.dataType !== "moveObject") continue;
      const fields = (
        content as { fields: Record<string, unknown> }
      ).fields;

      // `inner` is a Move enum serialized as { variant: "Naked"|"Locked", fields: {...} }.
      // The exact JSON shape from RPC for enums is `{ variant, fields }` with
      // the inner struct under fields. Be tolerant of either {Naked: {...}} or
      // {variant:"Naked", fields:{...}} — RPC uses the latter for public_enum.
      const inner = fields.inner as
        | { variant?: string; fields?: { id?: { id: string } } }
        | undefined;
      let isLocked = false;
      let innerSourceId = "";
      if (inner) {
        if (inner.variant) {
          isLocked = inner.variant === "Locked";
          // The enum payload is the wrapped struct (LpPosition or LockedPosition);
          // its UID lives under .fields.id.id.
          innerSourceId =
            (inner.fields as { id?: { id: string } } | undefined)?.id?.id ?? "";
        } else {
          // Fall back: legacy shape { Naked: {...} } / { Locked: {...} }
          const rec = inner as Record<string, { id?: { id: string } }>;
          if (rec.Locked) {
            isLocked = true;
            innerSourceId = rec.Locked.id?.id ?? "";
          } else if (rec.Naked) {
            isLocked = false;
            innerSourceId = rec.Naked.id?.id ?? "";
          }
        }
      }

      result.push({
        id: o.data.objectId,
        rewardPoolId: (fields.reward_pool_id as string) ?? "",
        shares: BigInt((fields.shares as string) ?? "0"),
        isLocked,
        innerSourceId,
        typeA: normalizeType(m[1].trim()),
        typeB: normalizeType(m[2].trim()),
        typeR: normalizeType(m[3].trim()),
      });
    }
    if (!page.hasNextPage) break;
    cursor = page.nextCursor;
  }
  return result;
}

// View call: stake_pending_reward<A,B,R>(stake, rp, pool, clock) -> u64
// Use devInspect so we don't pay gas. Returns the on-chain pending value.
export async function readPendingReward(
  client: SuiClient,
  args: {
    typeA: string;
    typeB: string;
    typeR: string;
    stakeId: string;
    rewardPoolId: string;
    poolId: string;
    sender: string;
  },
): Promise<bigint> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${STAKING_PACKAGE}::staking::stake_pending_reward`,
    typeArguments: [args.typeA, args.typeB, args.typeR],
    arguments: [
      tx.object(args.stakeId),
      tx.object(args.rewardPoolId),
      tx.object(args.poolId),
      tx.object("0x6"),
    ],
  });
  const res = await client.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: args.sender,
  });
  const ret = res.results?.[0]?.returnValues?.[0];
  if (!ret) return 0n;
  // returnValues = [bytes[], type]. u64 is little-endian 8 bytes BCS.
  const [bytes] = ret;
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
  return v;
}
