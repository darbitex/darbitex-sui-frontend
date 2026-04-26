# Walrus Quilt Registry — Darbitex Sui Frontend (niocoin.wal.app)

Source of truth for which Walrus blobs back the live combined ONE Sui +
Darbitex Sui frontend. Cross-check this file against on-chain state before
any deploy, extend, share, or burn operation. Same safety SOPs apply as
the Aptos sibling registries — see
`~/darbitex-final/frontend/docs/walrus-quilts.md` and
`~/darbitex-beta/frontend/docs/walrus-quilts.md` for long-form rationale
on short leases, shared-blob funding risks, and deploy checklists.

## Live site

- **Site Object ID:** `0xd6194fb86e172757264920743fa3c20801f944bd9f0ddd0f48b318fd01d8baa1`
- **SuiNS binding:** `niocoin.sui` → `niocoin.wal.app` — **LIVE** as of 2026-04-26 via SuiNS controller `set_user_data` (tx `6Df5WEuQVevRMWYGoa65aJy7wmEXZgfTmayFs4YmNgMt`).
- **Walrus network:** mainnet
- **Operational wallet:** `0x6915bc38bccd03a6295e9737143e4ef3318bcdc75be80a3114f317633bdd3304` (`~/.sui/sui_config/client.yaml`)
- **SuiNS registration NFT:** `0x5d69eba8...` (holds `niocoin.sui`)
- **Blob ownership model:** shared (policy — see beta/final docs)

## Active shared quilts

Last verified: **2026-04-27** (epoch 29, epoch duration 14 days).

| # | Shared Object ID | Blob ID (content hash) | Size | Exp. epoch | Exp. date | Resources |
|---|---|---|---|---|---|---|
| 2 | `0xaf951bb198dadcb330c3307c94b7be111960bef0e8050d954906e379f3e401a3` | `S-iUVWNBj7Ohk2r9OXUrtpB1r9pnQQkwZ9NUVzPZX9k` | 1.27 MiB | 34 | ~2026-07-06 | **Locker + Staking UI** — `/liquidity/locked` and `/liquidity/staking` sub-routes added. Lock action embedded in Portfolio per-position panel (5 duration presets: 1d/7d/30d/90d/1y). Reward-pool list event-sourced from `LpRewardPoolCreated`; per-pool Manage panel covers stake naked + stake locked + claim rewards + claim LP fees + unstake (auto-dispatched on `isLocked`) + permissionless `deposit_rewards` top-up + create-reward-pool form. Pending reward via `devInspect` of `stake_pending_reward<A,B,R>` (no gas). Pool dependency: 12 Move targets across `darbitex_lp_locker::lock` (sealed pkg `0x62d8ca51...`) and `darbitex_lp_staking::staking` (sealed pkg `0x1647e7c5...`) — all argument orders + type-arg arity verified against on-chain ABI before deploy. Bonus: Create Pool form gained live wallet balance display + max button (matched AddLiquidityForm pattern). |
| 1 | `0xefa5c2e6751485cab2d38a899913170b2c26d8641377499ccd1716e7d14d7243` | `C8Wi-NbAmGfzKsscEAs2hQgMKkay6m2bdW0-ZpwyVso` | 1.27 MiB | 34 | ~2026-07-06 | **ORPHANED — replaced by #2 on 2026-04-27.** Genesis publish (Trade / Liquidity / ONE / About). Left to expire. Not funded, residual lease only — NOT the 6.458 WAL incident class. |

Short lease (5 epochs) per the beta/final SOP. **Not funded.** No `fund-shared-blob` or `extend --shared` while frontend is iterating — orphan = permanent WAL burn per `feedback_walrus_fund_extend_flow.md`.

## Archival split — deferred

**Status:** intentionally deferred until feature-freeze, same as Final.

The Sui frontend will follow the same dev/archival split pattern as
darbitex-final: working site iterates on short 5-epoch leases, separate
archival site object holds a frozen snapshot funded to max lease. Not
implemented yet because the frontend is in active iteration. Revisit when:

- Locker + Staking UX is feature-complete
- Sui DEX has live pools (currently `pool_count = 0` per `darbitex_sui_deployed.md`)
- An archival SuiNS arrangement is decided

## SuiNS repoint recipe

Done via `@mysten/suins` SDK in `scripts/bind-suins.ts` (per genesis
deploy memory). The site object ID is unchanged across `update` deploys,
so SuiNS does not need to be repointed unless we ever migrate to a new
site object.

If a future migration is needed, the recipe is symmetric to Aptos — call
`controller::set_user_data(suins_obj, niocoin_nft, "walrus_site_id", new_obj, clock)`.

## Deploy history

- **2026-04-26 genesis publish:** `site-builder publish --epochs 5 dist --site-name "Darbitex Sui"` → site object `0xd6194fb8...`, owned blob shared as `0xefa5c2e6...` (blob id `C8Wi-NbAm…ZpwyVso`). 4 pages: Trade / Liquidity (Pools+Portfolio) / ONE (5 sub-tabs) / About. Pyth SUI/USD inline VAA refresh. Slush + browser-wallet auto-detect via `@mysten/dapp-kit`. Cost: 5.025 MFROST + 0.109 SUI gas.
- **2026-04-26 SuiNS bind:** `niocoin.sui` NFT → `walrus_site_id = 0xd6194fb8...` via `@mysten/suins` SDK. tx `6Df5WEuQVevRMWYGoa65aJy7wmEXZgfTmayFs4YmNgMt`. `niocoin.wal.app` HTTP 200 immediately.
- **2026-04-27 Locker + Staking UI:** `site-builder update --epochs 5 dist <site_id>` → owned blob `0xd3cae366...` → shared `0xaf951bb1...` (blob id `S-iUVWNBj7O…ZPZX9k`). 47 quilt patches (24 created, 23 deleted). Cost: 5.025 MFROST + 0.025 SUI gas. Sub-routes added: `/liquidity/locked`, `/liquidity/staking`. Required lowering `gas_budget` in `~/.config/walrus/sites-config.yaml` mainnet context from default 500M to 200M MIST (deployer wallet's largest gas coin was 0.39 SUI, below the 0.5 SUI default).

## Deploy checklist (MANDATORY ORDER)

1. `npm run build` (or `./node_modules/.bin/vite build`)
2. `site-builder update --dry-run --epochs 5 dist 0xd6194fb86e172757264920743fa3c20801f944bd9f0ddd0f48b318fd01d8baa1`
   - **Read the dry-run output.** If estimated storage cost is near full-publish cost (≈ 5 MFROST), the entire quilt is being repacked — confirm the change is real before paying. Per `feedback_walrus_deploy.md`, full repack on a small change is a flag.
   - Tooling note: site-builder's `--dry-run` enters an interactive `y/N` prompt; in non-terminal shells it errors with "not a terminal" after printing the estimate. The estimate is still valid.
3. `site-builder update --epochs 5 dist 0xd6194fb86e172757264920743fa3c20801f944bd9f0ddd0f48b318fd01d8baa1`
   - **Always** use `update`, never `publish` (SuiNS bound to the object ID above)
   - **Default `--epochs 5`** while frontend is iterating
4. `walrus --context mainnet list-blobs` — find any new OWNED blobs
5. For each NEW owned blob: `walrus --context mainnet share --blob-obj-id <id>`
6. Re-run `walrus list-blobs` — MUST be empty
7. Update the table in this file with new shared object IDs + exp epochs.
   Move any newly-orphaned quilts to the "Superseded" list. Orphan owned
   blobs from a bad deploy that never made it to `share` can be burned
   safely via `walrus burn-blobs --object-ids <id>`.
8. Commit and push — the table on `main` must match on-chain reality.

## Destructive-op safety rules

Same as final/beta docs:

- **Never** `site-builder destroy` — burns ALL referenced shared blobs, including those shared with other live sites (per `feedback_walrus_destroy_shared_blob.md`).
- **Never** transfer the Site object out of the operational wallet without first updating SuiNS.
- Burn orphans individually via `walrus burn-blobs --object-ids <id>`. Shared blobs cannot be burned and have no withdraw path (per `feedback_walrus_fund_extend_flow.md`).
- Do NOT `fund-shared-blob` or `extend --shared` on the active iterating frontend — orphan = permanent WAL burn.
