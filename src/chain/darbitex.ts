import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";

type SuiClient = SuiJsonRpcClient;
import {
  DARBITEX_FACTORY,
  DARBITEX_PACKAGE,
  DARBITEX_SWAP_FEE_BPS,
} from "../config";
import { takeExactCoin } from "./coinSelect";

export interface PoolView {
  poolId: string;
  typeA: string;
  typeB: string;
  reserveA: bigint;
  reserveB: bigint;
  lpSupply: bigint;
}

interface PoolCreatedEvent {
  pool_id: string;
  type_a: string;
  type_b: string;
  creator: string;
  amount_a: string;
  amount_b: string;
  initial_lp: string;
  timestamp_ms: string;
}

export async function listPools(client: SuiClient): Promise<PoolView[]> {
  // Pool list lives entirely on chain via PoolCreated events. The factory
  // also stores a Table<PairKey, ID> but iterating a Table requires
  // dynamic-field paging; events give the same data with one query.
  const events = await client.queryEvents({
    query: { MoveEventType: `${DARBITEX_PACKAGE}::pool::PoolCreated` },
    limit: 50,
    order: "descending",
  });
  const pools: PoolView[] = [];
  for (const ev of events.data) {
    const e = ev.parsedJson as PoolCreatedEvent | undefined;
    if (!e) continue;
    const view = await readPool(client, e.pool_id, e.type_a, e.type_b);
    if (view) pools.push(view);
  }
  return pools;
}

export async function readPool(
  client: SuiClient,
  poolId: string,
  typeA: string,
  typeB: string,
): Promise<PoolView | null> {
  const obj = await client.getObject({ id: poolId, options: { showContent: true } });
  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") return null;
  const fields = (obj.data.content as { fields: Record<string, string> }).fields;
  return {
    poolId,
    typeA,
    typeB,
    reserveA: BigInt(fields.reserve_a ?? "0"),
    reserveB: BigInt(fields.reserve_b ?? "0"),
    lpSupply: BigInt(fields.lp_supply ?? "0"),
  };
}

// Constant-product quote with 5 bps fee, matches pool::compute_amount_out.
export function quoteSwap(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const feeNum = BigInt(10_000 - DARBITEX_SWAP_FEE_BPS);
  const amountInAfterFee = (amountIn * feeNum) / 10_000n;
  const numerator = amountInAfterFee * reserveOut;
  const denominator = reserveIn + amountInAfterFee;
  return numerator / denominator;
}

export interface SwapArgs {
  pool: PoolView;
  aToB: boolean;
  amountIn: bigint;
  minAmountOut: bigint;
  sender: string;
}

// pool::swap_a_to_b<A,B>(pool, coin_in, min_out, clock, ctx) -> Coin<B>
// pool::swap_b_to_a<A,B>(pool, coin_in, min_out, clock, ctx) -> Coin<A>
// No entry wrapper exists — we capture the returned Coin and transfer it
// back to the sender in the same PTB.
export async function buildSwapTx(
  client: SuiClient,
  args: SwapArgs,
): Promise<Transaction> {
  const tx = new Transaction();
  const inType = args.aToB ? args.pool.typeA : args.pool.typeB;
  const fnName = args.aToB ? "swap_a_to_b" : "swap_b_to_a";
  const coinIn = await takeExactCoin(client, tx, args.sender, inType, args.amountIn);
  const coinOut = tx.moveCall({
    target: `${DARBITEX_PACKAGE}::pool::${fnName}`,
    typeArguments: [args.pool.typeA, args.pool.typeB],
    arguments: [
      tx.object(args.pool.poolId),
      coinIn,
      tx.pure.u64(args.minAmountOut),
      tx.object("0x6"),
    ],
  });
  tx.transferObjects([coinOut], tx.pure.address(args.sender));
  return tx;
}

export interface CreatePoolArgs {
  // Caller-supplied; the helper does NOT re-sort. Use sortPair() upstream.
  typeA: string;
  typeB: string;
  amountA: bigint;
  amountB: bigint;
  sender: string;
}

// pool_factory::create_canonical_pool_entry<A,B>(factory, coin_a, coin_b, clock, ctx)
// Move enforces strict A < B order via assert_sorted; pre-sort at call site.
// Aborts E_DUPLICATE_PAIR if the canonical pool for this pair already exists.
export async function buildCreatePoolTx(
  client: SuiClient,
  args: CreatePoolArgs,
): Promise<Transaction> {
  const tx = new Transaction();
  const coinA = await takeExactCoin(client, tx, args.sender, args.typeA, args.amountA);
  const coinB = await takeExactCoin(client, tx, args.sender, args.typeB, args.amountB);
  tx.moveCall({
    target: `${DARBITEX_PACKAGE}::pool_factory::create_canonical_pool_entry`,
    typeArguments: [args.typeA, args.typeB],
    arguments: [
      tx.object(DARBITEX_FACTORY),
      coinA,
      coinB,
      tx.object("0x6"),
    ],
  });
  return tx;
}

export interface AddLiquidityArgs {
  pool: PoolView;
  amountA: bigint;
  amountB: bigint;
  minShares: bigint;
  deadlineMs: bigint;
  sender: string;
}

// pool::add_liquidity_entry<A,B>(pool, coin_a, coin_b, min_shares_out, clock, deadline_ms, ctx)
export async function buildAddLiquidityTx(
  client: SuiClient,
  args: AddLiquidityArgs,
): Promise<Transaction> {
  const tx = new Transaction();
  const coinA = await takeExactCoin(
    client,
    tx,
    args.sender,
    args.pool.typeA,
    args.amountA,
  );
  const coinB = await takeExactCoin(
    client,
    tx,
    args.sender,
    args.pool.typeB,
    args.amountB,
  );
  tx.moveCall({
    target: `${DARBITEX_PACKAGE}::pool::add_liquidity_entry`,
    typeArguments: [args.pool.typeA, args.pool.typeB],
    arguments: [
      tx.object(args.pool.poolId),
      coinA,
      coinB,
      tx.pure.u64(args.minShares),
      tx.object("0x6"),
      tx.pure.u64(args.deadlineMs),
    ],
  });
  return tx;
}

export interface RemoveLiquidityArgs {
  pool: PoolView;
  positionId: string;
  minA: bigint;
  minB: bigint;
  deadlineMs: bigint;
}

// pool::remove_liquidity_entry<A,B>(pool, position, min_amount_a, min_amount_b, clock, deadline_ms, ctx)
// Position is consumed by value — entire LP position is burned.
export function buildRemoveLiquidityTx(args: RemoveLiquidityArgs): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${DARBITEX_PACKAGE}::pool::remove_liquidity_entry`,
    typeArguments: [args.pool.typeA, args.pool.typeB],
    arguments: [
      tx.object(args.pool.poolId),
      tx.object(args.positionId),
      tx.pure.u64(args.minA),
      tx.pure.u64(args.minB),
      tx.object("0x6"),
      tx.pure.u64(args.deadlineMs),
    ],
  });
  return tx;
}

// pool::claim_lp_fees_entry<A,B>(pool, position, clock, deadline_ms, ctx)
// Position is borrowed mut — not burned.
export function buildClaimFeesTx(
  pool: PoolView,
  positionId: string,
  deadlineMs: bigint,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${DARBITEX_PACKAGE}::pool::claim_lp_fees_entry`,
    typeArguments: [pool.typeA, pool.typeB],
    arguments: [
      tx.object(pool.poolId),
      tx.object(positionId),
      tx.object("0x6"),
      tx.pure.u64(deadlineMs),
    ],
  });
  return tx;
}

export async function listUserPositions(
  client: SuiClient,
  owner: string,
): Promise<
  { id: string; poolId: string; shares: bigint; typeA: string; typeB: string }[]
> {
  const result: {
    id: string;
    poolId: string;
    shares: bigint;
    typeA: string;
    typeB: string;
  }[] = [];
  let cursor: string | null | undefined = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  while (true) {
    const page: any = await client.getOwnedObjects({
      owner,
      filter: { StructType: `${DARBITEX_PACKAGE}::pool::LpPosition` },
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
      const fields = (content as { fields: Record<string, string> }).fields;
      result.push({
        id: o.data.objectId,
        poolId: fields.pool_id,
        shares: BigInt(fields.shares ?? "0"),
        typeA: m[1].trim(),
        typeB: m[2].trim(),
      });
    }
    if (!page.hasNextPage) break;
    cursor = page.nextCursor;
  }
  return result;
}

export function getFactoryId(): string {
  return DARBITEX_FACTORY;
}
