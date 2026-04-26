import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { LOCKER_PACKAGE } from "../config";
import { normalizeType } from "./coins";

type SuiClient = SuiJsonRpcClient;

export interface LockedPositionView {
  id: string;
  poolId: string;
  unlockAtMs: bigint;
  typeA: string;
  typeB: string;
}

// lock::lock_position_entry<A,B>(position, unlock_at_ms, clock, ctx)
// Asserts unlock_at_ms > now. Wrapper transferred to sender.
export function buildLockPositionTx(args: {
  typeA: string;
  typeB: string;
  positionId: string;
  unlockAtMs: bigint;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${LOCKER_PACKAGE}::lock::lock_position_entry`,
    typeArguments: [args.typeA, args.typeB],
    arguments: [
      tx.object(args.positionId),
      tx.pure.u64(args.unlockAtMs),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// lock::claim_fees_entry<A,B>(&mut LockedPosition, &mut Pool, clock, ctx)
// Open throughout the lock period. Both coins forwarded to sender.
export function buildLockerClaimFeesTx(args: {
  typeA: string;
  typeB: string;
  lockedId: string;
  poolId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${LOCKER_PACKAGE}::lock::claim_fees_entry`,
    typeArguments: [args.typeA, args.typeB],
    arguments: [
      tx.object(args.lockedId),
      tx.object(args.poolId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// lock::redeem_entry<A,B>(LockedPosition, clock, ctx)
// Aborts E_STILL_LOCKED if clock < unlock_at_ms. Inner LpPosition
// transferred to sender. Pool is NOT touched — works regardless of pool
// liveness.
export function buildRedeemLockedTx(args: {
  typeA: string;
  typeB: string;
  lockedId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${LOCKER_PACKAGE}::lock::redeem_entry`,
    typeArguments: [args.typeA, args.typeB],
    arguments: [tx.object(args.lockedId), tx.object("0x6")],
  });
  return tx;
}

export async function listUserLockedPositions(
  client: SuiClient,
  owner: string,
): Promise<LockedPositionView[]> {
  const result: LockedPositionView[] = [];
  let cursor: string | null | undefined = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  while (true) {
    const page: any = await client.getOwnedObjects({
      owner,
      filter: { StructType: `${LOCKER_PACKAGE}::lock::LockedPosition` },
      options: { showContent: true, showType: true },
      cursor,
    });
    for (const o of page.data) {
      if (!o.data) continue;
      const type = o.data.type ?? "";
      const m = type.match(/<(.+),\s*(.+)>$/);
      if (!m) continue;
      const content = o.data.content;
      if (!content || content.dataType !== "moveObject") continue;
      const fields = (
        content as { fields: Record<string, unknown> }
      ).fields;
      // `position` is a nested LpPosition struct. Sui RPC serializes
      // nested non-key structs either inline as `{pool_id: "..."}` or
      // wrapped as `{type, fields: {...}}` depending on SDK version.
      // Probe both shapes, default to "" if neither is present.
      const inner = fields.position as
        | { fields?: { pool_id?: string }; pool_id?: string }
        | undefined;
      const poolId = inner?.fields?.pool_id ?? inner?.pool_id ?? "";
      result.push({
        id: o.data.objectId,
        poolId,
        unlockAtMs: BigInt((fields.unlock_at_ms as string) ?? "0"),
        typeA: normalizeType(m[1].trim()),
        typeB: normalizeType(m[2].trim()),
      });
    }
    if (!page.hasNextPage) break;
    cursor = page.nextCursor;
  }
  return result;
}

// Common preset durations in milliseconds.
export const LOCK_PRESETS_MS: { label: string; ms: number }[] = [
  { label: "1 day", ms: 86_400_000 },
  { label: "7 days", ms: 7 * 86_400_000 },
  { label: "30 days", ms: 30 * 86_400_000 },
  { label: "90 days", ms: 90 * 86_400_000 },
  { label: "1 year", ms: 365 * 86_400_000 },
];

export function isUnlocked(unlockAtMs: bigint, nowMs: number): boolean {
  return BigInt(nowMs) >= unlockAtMs;
}

export function formatUnlockEta(unlockAtMs: bigint, nowMs: number): string {
  const diff = Number(unlockAtMs - BigInt(nowMs));
  if (diff <= 0) return "unlocked";
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
