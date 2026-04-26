import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { Transaction, TransactionResult } from "@mysten/sui/transactions";
import { SUI_COIN_TYPE } from "../config";
import { normalizeType } from "./coins";

type SuiClient = SuiJsonRpcClient;
const SUI_TYPE_CANONICAL = normalizeType(SUI_COIN_TYPE);

// Returns a TransactionResult representing a Coin<T> of exactly `amount`,
// suitable as a moveCall argument or transfer target.
//
// SUI: splits off the gas coin in-place.
// Non-SUI: finds owned coins of `coinType`, merges them as needed into a
// primary coin, then splits exactly `amount` off that primary.
//
// Throws if the user does not own enough of `coinType`.
export async function takeExactCoin(
  client: SuiClient,
  tx: Transaction,
  owner: string,
  coinType: string,
  amount: bigint,
): Promise<TransactionResult> {
  if (normalizeType(coinType) === SUI_TYPE_CANONICAL) {
    return tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
  }
  const coins = await client.getCoins({ owner, coinType });
  let total = 0n;
  for (const c of coins.data) total += BigInt(c.balance as string);
  if (total < amount) {
    throw new Error(
      `Insufficient ${coinType.split("::").pop()}: need ${amount}, have ${total}`,
    );
  }
  const primary = tx.object(coins.data[0].coinObjectId);
  if (coins.data.length > 1) {
    tx.mergeCoins(
      primary,
      coins.data.slice(1).map((c) => tx.object(c.coinObjectId)),
    );
  }
  return tx.splitCoins(primary, [tx.pure.u64(amount)]);
}
