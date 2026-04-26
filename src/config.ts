// Darbitex Sui — immutable AMM, sealed 2026-04-26.
// Package permanently frozen via sui::package::make_immutable.
export const DARBITEX_PACKAGE =
  "0xf4c6b9255d67590f3c715137ea0c53ce05578c0979ea3864271f39ebc112aa68";

// FactoryRegistry shared object. sealed=true, pool_count=0 at deploy.
export const DARBITEX_FACTORY =
  "0x5f3e1d526eda4c34d47ec2227abe82d81d10ddf0cf714a3df071da3044e05567";

// ONE Sui — immutable Liquity-V1 CDP, SUI collateral, Pyth oracle.
// Package sealed via make_immutable; Registry.sealed=true.
export const ONE_PACKAGE =
  "0x9f39a102363cec6218392c2e22208b3e05972ecc87af5daa62bac7015bf3b8dc";

export const ONE_REGISTRY =
  "0xef9abb071f648903183863a099d0564ca6a745605298c9304841d8ae80b2877a";

export const ONE_COIN_TYPE = `${ONE_PACKAGE}::ONE::ONE`;

// Pyth SUI/USD on Sui mainnet. PriceInfoObject must be refreshed in the
// same PTB as any oracle-dependent ONE entry, or the call aborts E_STALE.
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

// ONE protocol parameters (informational; locked on-chain forever).
export const ONE_DECIMALS = 8;
export const SUI_DECIMALS = 9;
export const ONE_MCR_BPS = 20_000; // 200%
export const ONE_LIQ_THRESHOLD_BPS = 15_000; // 150%
export const ONE_FEE_BPS = 100; // 1% mint + 1% redeem
export const ONE_MIN_DEBT = 100_000_000n; // 1 ONE in raw units

// Darbitex AMM constants.
export const DARBITEX_SWAP_FEE_BPS = 5;
export const DARBITEX_FLASH_FEE_BPS = 5;

// Sui mainnet chain id (used by SuiNS / Walrus host site).
export const SUI_NETWORK = "mainnet" as const;

// Default slippage tolerance in bps (50 = 0.5%).
export const DEFAULT_SLIPPAGE_BPS = 50;
