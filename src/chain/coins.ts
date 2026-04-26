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

// Sui's `type_name::into_string()` (used by Move events + the on-chain
// PairKey) emits types WITHOUT the `0x` prefix and with the address
// segment padded to 64 hex chars — e.g. `0000…0002::sui::SUI`. The
// frontend often writes the short form `0x2::sui::SUI`. Normalize both
// to one canonical form (`0x` + 64-hex address + `::module::Type`) so
// `===` comparisons across event data and config strings actually match.
export function normalizeType(t: string): string {
  const stripped = t.startsWith("0x") ? t.slice(2) : t;
  const idx = stripped.indexOf("::");
  if (idx === -1) return `0x${stripped.padStart(64, "0")}`;
  const addr = stripped.slice(0, idx);
  return `0x${addr.padStart(64, "0")}${stripped.slice(idx)}`;
}

// Curated whitelist. Keyed by the NORMALIZED form so the same key works
// whether the lookup string came from a Move event, from `config.ts`,
// or from a user-typed type string.
const RAW_COINS: CoinInfo[] = [
  { type: SUI_COIN_TYPE, symbol: "SUI", decimals: SUI_DECIMALS },
  { type: USDC_COIN_TYPE, symbol: "USDC", decimals: USDC_DECIMALS },
  { type: ONE_COIN_TYPE, symbol: "ONE", decimals: ONE_DECIMALS },
];

export const KNOWN_COINS: Record<string, CoinInfo> = Object.fromEntries(
  RAW_COINS.map((c) => [normalizeType(c.type), { ...c, type: normalizeType(c.type) }]),
);

// Sort two coin types lexicographically, matching darbitex::pool_factory's
// PairKey ordering. Move's `assert_sorted` does a byte-wise compare on the
// fully-padded `type_name::into_string()` form, so we normalize first.
export function sortPair(a: string, b: string): [string, string] {
  const A = normalizeType(a);
  const B = normalizeType(b);
  return A < B ? [A, B] : [B, A];
}

// Display label for a coin type — falls back to a short suffix.
export function coinLabel(type: string, info?: CoinInfo): string {
  if (info?.symbol) return info.symbol;
  const known = KNOWN_COINS[normalizeType(type)];
  if (known) return known.symbol;
  const parts = type.split("::");
  return parts[parts.length - 1] || type.slice(0, 10);
}
