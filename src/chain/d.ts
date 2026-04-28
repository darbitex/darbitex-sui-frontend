import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { SuiPriceServiceConnection, SuiPythClient } from "@pythnetwork/pyth-sui-js";

type SuiClient = SuiJsonRpcClient;
import {
  D_COIN_TYPE,
  D_PACKAGE,
  D_REGISTRY,
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

export interface UnderwaterTrove {
  owner: string;
  collateral: bigint;
  debt: bigint;
  // CR in basis points: collateral_usd_8dec * 10_000 / debt_8dec.
  crBps: bigint;
}

// Discover trove owners by paging TroveOpened events. Stops at 1000.
export async function discoverTroveOwners(client: SuiClient): Promise<string[]> {
  const seen = new Set<string>();
  let cursor: { txDigest: string; eventSeq: string } | null | undefined = undefined;
  for (let i = 0; i < 20; i++) {
    const page = await client.queryEvents({
      query: { MoveEventType: `${D_PACKAGE}::D::TroveOpened` },
      limit: 50,
      order: "descending",
      cursor: cursor ?? undefined,
    });
    for (const ev of page.data) {
      const u = (ev.parsedJson as { user?: string } | undefined)?.user;
      if (u) seen.add(u);
    }
    if (!page.hasNextPage) break;
    cursor = page.nextCursor as typeof cursor;
  }
  return Array.from(seen);
}

// Fetch latest SUI/USD price from Pyth Hermes as 8-dec integer (matches
// Move's price_8dec). Returns 0n on failure — caller should treat that
// as "price unknown" and skip CR calc.
export async function fetchSuiUsdPrice8dec(): Promise<bigint> {
  try {
    const url = `${PYTH_HERMES_URL}/api/latest_price_feeds?ids[]=${PYTH_SUI_USD_FEED_ID}`;
    const r = await fetch(url);
    if (!r.ok) return 0n;
    const j = (await r.json()) as Array<{
      price: { price: string; expo: number };
    }>;
    const f = j[0];
    if (!f) return 0n;
    const raw = BigInt(f.price.price);
    const expo = f.price.expo; // typically -8 for SUI/USD
    if (expo === -8) return raw;
    if (expo < -8) {
      const drop = -expo - 8;
      return raw / 10n ** BigInt(drop);
    }
    return raw * 10n ** BigInt(8 + expo);
  } catch {
    return 0n;
  }
}

// Returns troves with CR strictly below `LIQ_THRESHOLD_BPS` (150%).
// Skips troves with debt == 0 (already closed).
export async function discoverLiquidatable(
  client: SuiClient,
): Promise<{ candidates: UnderwaterTrove[]; price8dec: bigint; scanned: number }> {
  const [owners, price8dec] = await Promise.all([
    discoverTroveOwners(client),
    fetchSuiUsdPrice8dec(),
  ]);
  if (price8dec === 0n) {
    return { candidates: [], price8dec, scanned: owners.length };
  }
  const SUI_SCALE = 1_000_000_000n;
  const LIQ_THRESHOLD_BPS = 15_000n;

  const troves = await Promise.all(
    owners.map(async (owner) => {
      const t = await readTrove(client, owner);
      if (!t || t.debt === 0n) return null;
      // collUsd_8dec = coll_MIST * price_8dec / SUI_SCALE
      const collUsd = (t.collateral * price8dec) / SUI_SCALE;
      // crBps = collUsd_8dec * 10_000 / debt_8dec
      const crBps = (collUsd * 10_000n) / t.debt;
      return { owner, collateral: t.collateral, debt: t.debt, crBps };
    }),
  );
  const live = troves.filter((x): x is UnderwaterTrove => x !== null);
  const candidates = live
    .filter((t) => t.crBps < LIQ_THRESHOLD_BPS)
    .sort((a, b) => (a.crBps > b.crBps ? 1 : a.crBps < b.crBps ? -1 : 0));
  return { candidates, price8dec, scanned: live.length };
}

interface RegistryFields {
  total_debt: string;
  total_sp: string;
  product_factor: string;
  reward_index_d: string;
  reward_index_coll: string;
  sealed: boolean;
}

export async function readRegistry(client: SuiClient): Promise<RegistryFields | null> {
  const obj = await client.getObject({
    id: D_REGISTRY,
    options: { showContent: true },
  });
  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") return null;
  return (obj.data.content as unknown as { fields: RegistryFields }).fields;
}

// Reserve SUI balance held in Registry.reserve_coll. Used by reserve-redeem
// + reserve-donate UIs (capacity hint).
export async function readReserveBalance(client: SuiClient): Promise<bigint> {
  const res = await client.devInspectTransactionBlock({
    sender: "0x0000000000000000000000000000000000000000000000000000000000000000",
    transactionBlock: (() => {
      const tx = new Transaction();
      tx.moveCall({
        target: `${D_PACKAGE}::D::reserve_balance`,
        arguments: [tx.object(D_REGISTRY)],
      });
      return tx;
    })(),
  });
  const ret = res.results?.[0]?.returnValues?.[0]?.[0];
  if (!ret) return 0n;
  // u64 LE bytes
  const bytes = Array.isArray(ret) ? ret : Array.from(ret as Uint8Array);
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i] ?? 0);
  return v;
}

export interface SpPositionView {
  // Current effective D balance — what `sp_withdraw` would let you take.
  // Decays via product_factor from past liquidations.
  effective: bigint;
  // Pending unclaimed rewards.
  pendingD: bigint;
  pendingColl: bigint;
}

// Read a user's SP position. Mirrors D.move::sp_of's math:
//   eff      = initial_balance * product_factor / snapshot_product
//   p_d      = (reward_index_d   - snapshot_index_d   ) * init / snapshot_product
//   p_coll   = (reward_index_coll - snapshot_index_coll) * init / snapshot_product
export async function readSpPosition(
  client: SuiClient,
  owner: string,
): Promise<SpPositionView | null> {
  const reg = await client.getObject({
    id: D_REGISTRY,
    options: { showContent: true },
  });
  const c = reg.data?.content;
  if (!c || c.dataType !== "moveObject") return null;
  const fields = (c as {
    fields: Record<string, { fields?: { id?: { id: string } } } | string>;
  }).fields;
  const spTableId = (fields.sp_positions as { fields?: { id?: { id: string } } } | undefined)?.fields?.id?.id;
  if (!spTableId) return null;
  const productFactor = BigInt(fields.product_factor as string);
  const rewardD = BigInt(fields.reward_index_d as string);
  const rewardColl = BigInt(fields.reward_index_coll as string);
  try {
    const dyn = await client.getDynamicFieldObject({
      parentId: spTableId,
      name: { type: "address", value: owner },
    });
    const dc = dyn.data?.content;
    if (!dc || dc.dataType !== "moveObject") return null;
    const sp = (dc as {
      fields: {
        value?: {
          fields: {
            initial_balance: string;
            snapshot_product: string;
            snapshot_index_d: string;
            snapshot_index_coll: string;
          };
        };
      };
    }).fields.value?.fields;
    if (!sp) return null;
    const init = BigInt(sp.initial_balance);
    const snapP = BigInt(sp.snapshot_product);
    const snapD = BigInt(sp.snapshot_index_d);
    const snapColl = BigInt(sp.snapshot_index_coll);
    if (snapP === 0n) return null;
    const effective = (init * productFactor) / snapP;
    const pendingD = ((rewardD - snapD) * init) / snapP;
    const pendingColl = ((rewardColl - snapColl) * init) / snapP;
    return { effective, pendingD, pendingColl };
  } catch {
    return null;
  }
}

// Read a user's trove via the troves Table dynamic field.
export async function readTrove(client: SuiClient, owner: string): Promise<TroveView | null> {
  const reg = await client.getObject({
    id: D_REGISTRY,
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
// the downstream D entries should reference. Per D.move every
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

// D::open_trove_entry(reg, coll, debt, pi, clock, ctx) — transfers the
// minted Coin<D> back to sender. Use the entry variant so we don't
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
    target: `${D_PACKAGE}::D::open_trove_entry`,
    arguments: [
      tx.object(D_REGISTRY),
      coll,
      tx.pure.u64(args.borrowAmount),
      tx.object(priceInfo),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// D::add_collateral(reg, coll, ctx) — no return.
export async function buildAddCollateralTx(
  client: SuiClient,
  sender: string,
  amount: bigint,
): Promise<Transaction> {
  const tx = new Transaction();
  const coll = await takeExactCoin(client, tx, sender, SUI_COIN_TYPE, amount);
  tx.moveCall({
    target: `${D_PACKAGE}::D::add_collateral`,
    arguments: [tx.object(D_REGISTRY), coll],
  });
  return tx;
}

// D::close_trove_entry(reg, d_in, ctx) — burns trove debt; transfers
// Coin<SUI> collateral back to sender. d_in must hold at least full debt.
export async function buildCloseTroveTx(
  client: SuiClient,
  sender: string,
  dAmountAtLeastDebt: bigint,
): Promise<Transaction> {
  const tx = new Transaction();
  const dCoin = await takeExactCoin(
    client,
    tx,
    sender,
    D_COIN_TYPE,
    dAmountAtLeastDebt,
  );
  tx.moveCall({
    target: `${D_PACKAGE}::D::close_trove_entry`,
    arguments: [tx.object(D_REGISTRY), dCoin],
  });
  return tx;
}

// D::sp_deposit(reg, d_in, ctx) — deposits the FULL Coin<D> by value.
// We split exactly `amount` from the caller's pool so the deposit is the
// requested size, not whatever the user happened to hold.
export async function buildSpDepositTx(
  client: SuiClient,
  sender: string,
  amount: bigint,
): Promise<Transaction> {
  const tx = new Transaction();
  const dCoin = await takeExactCoin(client, tx, sender, D_COIN_TYPE, amount);
  tx.moveCall({
    target: `${D_PACKAGE}::D::sp_deposit`,
    arguments: [tx.object(D_REGISTRY), dCoin],
  });
  return tx;
}

// D::sp_withdraw_entry(reg, amt, ctx) — transfers Coin<D> back to sender.
export function buildSpWithdrawTx(amount: bigint): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${D_PACKAGE}::D::sp_withdraw_entry`,
    arguments: [tx.object(D_REGISTRY), tx.pure.u64(amount)],
  });
  return tx;
}

// D::sp_claim(reg, ctx) — settles pending SP rewards into the user's
// position. Does not transfer; rewards live on the Registry until withdrawn.
export function buildSpClaimTx(): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${D_PACKAGE}::D::sp_claim`,
    arguments: [tx.object(D_REGISTRY)],
  });
  return tx;
}

export interface DonationStats {
  spTotalRaw: bigint;
  spCount: number;
  reserveTotalRaw: bigint;
  reserveCount: number;
  // Last N donations, newest first.
  recentSp: { donor: string; amount: bigint; tx: string; ts: number }[];
  recentReserve: { donor: string; amount: bigint; tx: string; ts: number }[];
}

// Aggregate SPDonated + ReserveDonated events from D::D. Pages up to
// MAX_PAGES of 50 events per stream and sums them. Returns donor totals
// + recent N for display. Costs 2× ~10 RPC calls; cache caller-side.
export async function readDonationStats(
  client: SuiClient,
  recentN: number = 10,
  maxPages: number = 20,
): Promise<DonationStats> {
  async function pageEvents(eventName: string) {
    const all: Array<{ donor: string; amount: bigint; tx: string; ts: number }> = [];
    let cursor: { txDigest: string; eventSeq: string } | null | undefined = undefined;
    for (let i = 0; i < maxPages; i++) {
      const page = await client.queryEvents({
        query: { MoveEventType: `${D_PACKAGE}::D::${eventName}` },
        limit: 50,
        order: "descending",
        cursor: cursor ?? undefined,
      });
      for (const ev of page.data) {
        const j = ev.parsedJson as { donor?: string; amount?: string } | undefined;
        if (!j?.donor || !j?.amount) continue;
        all.push({
          donor: j.donor,
          amount: BigInt(j.amount),
          tx: ev.id.txDigest,
          ts: Number(ev.timestampMs ?? 0),
        });
      }
      if (!page.hasNextPage) break;
      cursor = page.nextCursor as typeof cursor;
    }
    return all;
  }
  const [sp, rsv] = await Promise.all([
    pageEvents("SPDonated"),
    pageEvents("ReserveDonated"),
  ]);
  const spTotal = sp.reduce((a, x) => a + x.amount, 0n);
  const rsvTotal = rsv.reduce((a, x) => a + x.amount, 0n);
  return {
    spTotalRaw: spTotal,
    spCount: sp.length,
    reserveTotalRaw: rsvTotal,
    reserveCount: rsv.length,
    recentSp: sp.slice(0, recentN),
    recentReserve: rsv.slice(0, recentN),
  };
}

// D::donate_to_sp(reg, d_in, ctx) — agnostic SP donation. Joins sp_pool
// balance only; does NOT increment total_sp. No reward dilution for keyed
// depositors. Permanently burns via future liquidation absorption.
export async function buildSpDonateTx(
  client: SuiClient,
  sender: string,
  amount: bigint,
): Promise<Transaction> {
  const tx = new Transaction();
  const dCoin = await takeExactCoin(client, tx, sender, D_COIN_TYPE, amount);
  tx.moveCall({
    target: `${D_PACKAGE}::D::donate_to_sp`,
    arguments: [tx.object(D_REGISTRY), dCoin],
  });
  return tx;
}

// D::donate_to_reserve(reg, sui_in, ctx) — fortifies reserve_coll capacity
// for redeem_from_reserve. Permissionless one-way deposit; no admin
// extraction path exists.
export async function buildReserveDonateTx(
  client: SuiClient,
  sender: string,
  amount: bigint,
): Promise<Transaction> {
  const tx = new Transaction();
  const sui = await takeExactCoin(client, tx, sender, SUI_COIN_TYPE, amount);
  tx.moveCall({
    target: `${D_PACKAGE}::D::donate_to_reserve`,
    arguments: [tx.object(D_REGISTRY), sui],
  });
  return tx;
}

export interface RedeemArgs {
  sender: string;
  target: string;
  amount: bigint;
}

// D::redeem_entry(reg, d_in, target, pi, clock, ctx) — burns D,
// transfers Coin<SUI> back to sender. Move arg order: d_in BEFORE target.
export async function buildRedeemTx(
  client: SuiClient,
  args: RedeemArgs,
): Promise<Transaction> {
  const tx = new Transaction();
  const priceInfo = await refreshPyth(client, tx);
  const dCoin = await takeExactCoin(
    client,
    tx,
    args.sender,
    D_COIN_TYPE,
    args.amount,
  );
  tx.moveCall({
    target: `${D_PACKAGE}::D::redeem_entry`,
    arguments: [
      tx.object(D_REGISTRY),
      dCoin,
      tx.pure.address(args.target),
      tx.object(priceInfo),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// D::redeem_from_reserve_entry(reg, d_in, pi, clock, ctx) — burns D,
// pulls SUI directly out of reserve_coll (no per-trove target). Requires
// reserve_balance >= net_coll_out. Same 1% fee as trove-redeem.
export async function buildRedeemFromReserveTx(
  client: SuiClient,
  sender: string,
  amount: bigint,
): Promise<Transaction> {
  const tx = new Transaction();
  const priceInfo = await refreshPyth(client, tx);
  const dCoin = await takeExactCoin(client, tx, sender, D_COIN_TYPE, amount);
  tx.moveCall({
    target: `${D_PACKAGE}::D::redeem_from_reserve_entry`,
    arguments: [
      tx.object(D_REGISTRY),
      dCoin,
      tx.object(priceInfo),
      tx.object("0x6"),
    ],
  });
  return tx;
}

export interface LiquidateArgs {
  target: string;
}

// D::liquidate_entry(reg, target, pi, clock, ctx) — transfers liquidator's
// SUI bonus back to sender.
export async function buildLiquidateTx(
  client: SuiClient,
  args: LiquidateArgs,
): Promise<Transaction> {
  const tx = new Transaction();
  const priceInfo = await refreshPyth(client, tx);
  tx.moveCall({
    target: `${D_PACKAGE}::D::liquidate_entry`,
    arguments: [
      tx.object(D_REGISTRY),
      tx.pure.address(args.target),
      tx.object(priceInfo),
      tx.object("0x6"),
    ],
  });
  return tx;
}
