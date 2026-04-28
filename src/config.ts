// Darbitex Sui — immutable AMM, sealed 2026-04-26.
// Package permanently frozen via sui::package::make_immutable.
export const DARBITEX_PACKAGE =
  "0xf4c6b9255d67590f3c715137ea0c53ce05578c0979ea3864271f39ebc112aa68";

// FactoryRegistry shared object. sealed=true, pool_count=0 at deploy.
export const DARBITEX_FACTORY =
  "0x5f3e1d526eda4c34d47ec2227abe82d81d10ddf0cf714a3df071da3044e05567";

// Darbitex LP locker — immutable time-lock satellite, sealed 2026-04-26.
// Wraps darbitex::pool::LpPosition with a one-way unlock_at_ms gate.
export const LOCKER_PACKAGE =
  "0x62d8ca51e77fccbbc8be88905760a84db752a02fb398da115294cb5aa373d23c";

// Darbitex LP staking — immutable agnostic emission primitive, sealed 2026-04-27.
// Accepts naked LpPosition and locked LockedPosition via StakedLp enum.
export const STAKING_PACKAGE =
  "0x1647e7c513d1be2e95b5e1db28baf67480f82ed3457a478192bc57d13580d85b";

// D — immutable Liquity-V1 CDP stablecoin v0.2.0, SUI collateral, Pyth oracle.
// Rebrand of ONE v0.1.0 + 10/90 fee split + agnostic donate_to_sp /
// donate_to_reserve. Package sealed via make_immutable; Registry.sealed=true.
export const D_PACKAGE =
  "0x898d83f0e128eb2024e435bc9da116d78f47c631e74096e505f5c86f8910b0d7";

export const D_REGISTRY =
  "0x22992b14865add7112b62f6d1e0e5194d8495c701f82e1d907148dfb53b9fc82";

export const D_COIN_TYPE = `${D_PACKAGE}::D::D`;

// Pyth SUI/USD on Sui mainnet. PriceInfoObject must be refreshed in the
// same PTB as any oracle-dependent D entry, or the call aborts E_STALE.
export const PYTH_SUI_USD_PRICE_INFO_OBJECT =
  "0x801dbc2f0053d34734814b2d6df491ce7807a725fe9a01ad74a07e9c51396c37";
export const PYTH_SUI_USD_FEED_ID =
  "0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744";

// Pyth Hermes endpoint (price update VAA stream).
export const PYTH_HERMES_URL = "https://hermes.pyth.network";

// SUI native coin type. SUI is 9 decimals (MIST).
export const SUI_COIN_TYPE = "0x2::sui::SUI";

// Circle's native USDC on Sui mainnet (issued by Circle via CCTP).
// 6 decimals. The canonical USDC type — bridged variants like the
// Wormhole-wrapped USDC at 0x5d4b...::coin::COIN are deprecated.
export const USDC_COIN_TYPE =
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
export const USDC_DECIMALS = 6;

// D protocol parameters (informational; locked on-chain forever).
export const D_DECIMALS = 8;
export const SUI_DECIMALS = 9;
export const D_MCR_BPS = 20_000; // 200%
export const D_LIQ_THRESHOLD_BPS = 15_000; // 150%
export const D_FEE_BPS = 100; // 1% mint + 1% redeem
export const D_MIN_DEBT = 100_000_000n; // 1 D in raw units (8 dec)

// Darbitex AMM constants.
export const DARBITEX_SWAP_FEE_BPS = 5;
export const DARBITEX_FLASH_FEE_BPS = 5;

// Darbitex Sui Token Factory — permissionless 1B-fixed-supply coin minter,
// sealed 2026-04-29 via package::make_immutable.
export const TOKEN_FACTORY_PACKAGE =
  "0xecc1e4904528453701abd873df637f8d2da3ab780dbcb33c36db005d7c920d89";
export const TOKEN_FACTORY_REGISTRY =
  "0x4cc55154df42b8bab323d7671fd504c444b49f8897bfd4f84f05826b9ccd42cf";
// Sui CoinRegistry shared object — type-keyed registry that holds Currency<T>.
export const SUI_COIN_REGISTRY = "0xc";
// Factory launch constraints (mirrored from factory.move).
export const TF_REQUIRED_DECIMALS = 9;
export const TF_TOTAL_SUPPLY = 1_000_000_000_000_000_000n; // 1B * 10^9
export const TF_SYMBOL_MIN = 1;
export const TF_SYMBOL_MAX = 32;
export const TF_NAME_MIN = 1;
export const TF_NAME_MAX = 64;
export const TF_DESC_MIN = 1;
export const TF_DESC_MAX = 1000;
export const TF_ICON_MIN = 12;
export const TF_ICON_MAX = 65_536;
export const TF_ICON_PREFIX = "data:image/";
// Tier fee in raw D units (8 decimals).
export const TF_FEE_RAW: Record<number, bigint> = {
  1: 100_000_000_000n, // 1000 D
  2: 10_000_000_000n,  // 100 D
  3: 1_000_000_000n,   // 10 D
  4: 100_000_000n,     // 1 D
  5: 10_000_000n,      // 0.1 D (5+ chars)
};

// Sui mainnet chain id (used by SuiNS / Walrus host site).
export const SUI_NETWORK = "mainnet" as const;

// Default slippage tolerance in bps (50 = 0.5%).
export const DEFAULT_SLIPPAGE_BPS = 50;
