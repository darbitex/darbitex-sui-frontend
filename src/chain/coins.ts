import {
  ONE_COIN_TYPE,
  ONE_DECIMALS,
  SUI_COIN_TYPE,
  SUI_DECIMALS,
  USDC_COIN_TYPE,
  USDC_DECIMALS,
} from "../config";

export interface CoinInfo {
  type: string;
  symbol: string;
  decimals: number;
  iconUrl?: string;
}

// Curated list of coins the app knows about up-front. Anything else
// is fetched on-demand via getCoinMetadata.
export const KNOWN_COINS: Record<string, CoinInfo> = {
  [SUI_COIN_TYPE]: { type: SUI_COIN_TYPE, symbol: "SUI", decimals: SUI_DECIMALS },
  [USDC_COIN_TYPE]: { type: USDC_COIN_TYPE, symbol: "USDC", decimals: USDC_DECIMALS },
  [ONE_COIN_TYPE]: { type: ONE_COIN_TYPE, symbol: "ONE", decimals: ONE_DECIMALS },
};

// Sort two coin types lexicographically, matching darbitex::pool_factory's
// PairKey ordering. The factory enforces type_a < type_b strictly.
export function sortPair(a: string, b: string): [string, string] {
  // Strip leading "0x" for byte-comparison consistency with Move's
  // byte-wise compare on type-name strings.
  const norm = (t: string) => (t.startsWith("0x") ? t : `0x${t}`);
  const A = norm(a);
  const B = norm(b);
  return A < B ? [A, B] : [B, A];
}

// Display label for a coin type — falls back to a short suffix.
export function coinLabel(type: string, info?: CoinInfo): string {
  if (info?.symbol) return info.symbol;
  const known = KNOWN_COINS[type];
  if (known) return known.symbol;
  // ::module::TypeName -> TypeName
  const parts = type.split("::");
  return parts[parts.length - 1] || type.slice(0, 10);
}
