import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { SuiPriceServiceConnection, SuiPythClient } from "@pythnetwork/pyth-sui-js";

type SuiClient = SuiJsonRpcClient;
import {
  ONE_COIN_TYPE,
  ONE_PACKAGE,
  ONE_REGISTRY,
  PYTH_HERMES_URL,
  PYTH_SUI_USD_FEED_ID,
  PYTH_SUI_USD_PRICE_INFO_OBJECT,
  SUI_COIN_TYPE,
} from "../config";
import { takeExactCoin } from "./coinSelect";

// Pyth + Wormhole mainnet state objects, used by SuiPythClient to build
// update_price_feeds calls.
const PYTH_STATE_ID = "0x1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8";
const WORMHOLE_STATE_ID = "0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c";

export interface TroveView {
  collateral: bigint;
  debt: bigint;
}

interface RegistryFields {
  total_debt: string;
  total_sp: string;
  product_factor: string;
  reward_index_one: string;
  reward_index_coll: string;
  sealed: boolean;
}

export async function readRegistry(client: SuiClient): Promise<RegistryFields | null> {
  const obj = await client.getObject({
    id: ONE_REGISTRY,
    options: { showContent: true },
  });
  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") return null;
  return (obj.data.content as unknown as { fields: RegistryFields }).fields;
}

// Read a user's trove via the troves Table dynamic field.
export async function readTrove(client: SuiClient, owner: string): Promise<TroveView | null> {
  const reg = await client.getObject({
    id: ONE_REGISTRY,
    options: { showContent: true },
  });
  const c = reg.data?.content;
  if (!c || c.dataType !== "moveObject") return null;
  const fields = (c as {
    fields: Record<string, { fields?: { id?: { id: string } } }>;
  }).fields;
  const tableId = fields.troves?.fields?.id?.id;
  if (!tableId) return null;
  try {
    const dyn = await client.getDynamicFieldObject({
      parentId: tableId,
      name: { type: "address", value: owner },
    });
    const dc = dyn.data?.content;
    if (!dc || dc.dataType !== "moveObject") return null;
    const trove = (dc as {
      fields: { value?: { fields: { collateral: string; debt: string } } };
    }).fields.value?.fields;
    if (!trove) return null;
    return { collateral: BigInt(trove.collateral), debt: BigInt(trove.debt) };
  } catch {
    return null;
  }
}

// Build a Pyth refresh sub-call into `tx`. Returns the PriceInfoObject id
// the downstream ONE entries should reference. Per ONE.move every
// oracle-dependent entry must see a non-stale PriceInfoObject in the SAME PTB.
//
// The Pyth Sui SDK ships with its own pinned @mysten/sui dep, so the
// Transaction class identity differs at the type level. We cast across the
// boundary — runtime is fully compatible (same JS class, identical PTB
// builder shape).
export async function refreshPyth(
  client: SuiClient,
  tx: Transaction,
): Promise<string> {
  const conn = new SuiPriceServiceConnection(PYTH_HERMES_URL);
  const updates = await conn.getPriceFeedsUpdateData([PYTH_SUI_USD_FEED_ID]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pyth = new SuiPythClient(client as any, PYTH_STATE_ID, WORMHOLE_STATE_ID);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceInfoIds = await pyth.updatePriceFeeds(tx as any, updates, [PYTH_SUI_USD_FEED_ID]);
  return priceInfoIds[0] ?? PYTH_SUI_USD_PRICE_INFO_OBJECT;
}

export interface OpenTroveArgs {
  sender: string;
  collateralAmount: bigint;
  borrowAmount: bigint;
}

// ONE::open_trove_entry(reg, coll, debt, pi, clock, ctx) — transfers the
// minted Coin<ONE> back to sender. Use the entry variant so we don't
// have to handle the returned coin manually.
export async function buildOpenTroveTx(
  client: SuiClient,
  args: OpenTroveArgs,
): Promise<Transaction> {
  const tx = new Transaction();
  const priceInfo = await refreshPyth(client, tx);
  const coll = await takeExactCoin(
    client,
    tx,
    args.sender,
    SUI_COIN_TYPE,
    args.collateralAmount,
  );
  tx.moveCall({
    target: `${ONE_PACKAGE}::ONE::open_trove_entry`,
    arguments: [
      tx.object(ONE_REGISTRY),
      coll,
      tx.pure.u64(args.borrowAmount),
      tx.object(priceInfo),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ONE::add_collateral(reg, coll, ctx) — no return.
export async function buildAddCollateralTx(
  client: SuiClient,
  sender: string,
  amount: bigint,
): Promise<Transaction> {
  const tx = new Transaction();
  const coll = await takeExactCoin(client, tx, sender, SUI_COIN_TYPE, amount);
  tx.moveCall({
    target: `${ONE_PACKAGE}::ONE::add_collateral`,
    arguments: [tx.object(ONE_REGISTRY), coll],
  });
  return tx;
}

// ONE::close_trove_entry(reg, one_in, ctx) — burns trove debt; transfers
// Coin<SUI> collateral back to sender. one_in must hold at least full debt.
export async function buildCloseTroveTx(
  client: SuiClient,
  sender: string,
  oneAmountAtLeastDebt: bigint,
): Promise<Transaction> {
  const tx = new Transaction();
  const oneCoin = await takeExactCoin(
    client,
    tx,
    sender,
    ONE_COIN_TYPE,
    oneAmountAtLeastDebt,
  );
  tx.moveCall({
    target: `${ONE_PACKAGE}::ONE::close_trove_entry`,
    arguments: [tx.object(ONE_REGISTRY), oneCoin],
  });
  return tx;
}

// ONE::sp_deposit(reg, one_in, ctx) — deposits the FULL Coin<ONE> by value.
// We split exactly `amount` from the caller's pool so the deposit is the
// requested size, not whatever the user happened to hold.
export async function buildSpDepositTx(
  client: SuiClient,
  sender: string,
  amount: bigint,
): Promise<Transaction> {
  const tx = new Transaction();
  const oneCoin = await takeExactCoin(client, tx, sender, ONE_COIN_TYPE, amount);
  tx.moveCall({
    target: `${ONE_PACKAGE}::ONE::sp_deposit`,
    arguments: [tx.object(ONE_REGISTRY), oneCoin],
  });
  return tx;
}

// ONE::sp_withdraw_entry(reg, amt, ctx) — transfers Coin<ONE> back to sender.
export function buildSpWithdrawTx(amount: bigint): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${ONE_PACKAGE}::ONE::sp_withdraw_entry`,
    arguments: [tx.object(ONE_REGISTRY), tx.pure.u64(amount)],
  });
  return tx;
}

// ONE::sp_claim(reg, ctx) — settles pending SP rewards into the user's
// position. Does not transfer; rewards live on the Registry until withdrawn.
export function buildSpClaimTx(): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${ONE_PACKAGE}::ONE::sp_claim`,
    arguments: [tx.object(ONE_REGISTRY)],
  });
  return tx;
}

export interface RedeemArgs {
  sender: string;
  target: string;
  amount: bigint;
}

// ONE::redeem_entry(reg, one_in, target, pi, clock, ctx) — burns ONE,
// transfers Coin<SUI> back to sender. Move arg order: one_in BEFORE target.
export async function buildRedeemTx(
  client: SuiClient,
  args: RedeemArgs,
): Promise<Transaction> {
  const tx = new Transaction();
  const priceInfo = await refreshPyth(client, tx);
  const oneCoin = await takeExactCoin(
    client,
    tx,
    args.sender,
    ONE_COIN_TYPE,
    args.amount,
  );
  tx.moveCall({
    target: `${ONE_PACKAGE}::ONE::redeem_entry`,
    arguments: [
      tx.object(ONE_REGISTRY),
      oneCoin,
      tx.pure.address(args.target),
      tx.object(priceInfo),
      tx.object("0x6"),
    ],
  });
  return tx;
}

export interface LiquidateArgs {
  target: string;
}

// ONE::liquidate_entry(reg, target, pi, clock, ctx) — transfers liquidator's
// SUI bonus back to sender.
export async function buildLiquidateTx(
  client: SuiClient,
  args: LiquidateArgs,
): Promise<Transaction> {
  const tx = new Transaction();
  const priceInfo = await refreshPyth(client, tx);
  tx.moveCall({
    target: `${ONE_PACKAGE}::ONE::liquidate_entry`,
    arguments: [
      tx.object(ONE_REGISTRY),
      tx.pure.address(args.target),
      tx.object(priceInfo),
      tx.object("0x6"),
    ],
  });
  return tx;
}
