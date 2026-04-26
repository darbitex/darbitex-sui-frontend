/**
 * Seed the first SUI/USDC pool on Darbitex Sui mainnet.
 *
 * Loads the deployer key from the local Sui CLI keystore (~/.sui/sui_config/sui.keystore)
 * — same wallet 0x6915bc38 that deployed Darbitex + ONE.
 *
 * Pool seed:
 *   - 0.353004781 SUI  (= 353_004_781 MIST)
 *   - 0.333       USDC (= 333_000 raw, 6 dec)
 * Implied spot: 1 SUI = 0.94333 USD.
 *
 * Run: npx tsx scripts/seed-first-pool.ts
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";

const DARBITEX_PACKAGE =
  "0xf4c6b9255d67590f3c715137ea0c53ce05578c0979ea3864271f39ebc112aa68";
const FACTORY =
  "0x5f3e1d526eda4c34d47ec2227abe82d81d10ddf0cf714a3df071da3044e05567";
const SUI_TYPE = "0x2::sui::SUI";
const USDC_TYPE =
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

const SUI_AMOUNT = 353_004_781n;
const USDC_AMOUNT = 333_000n;

function loadKeyFromKeystore(): Ed25519Keypair {
  const path = `${homedir()}/.sui/sui_config/sui.keystore`;
  const raw = JSON.parse(readFileSync(path, "utf8")) as string[];
  for (const b64 of raw) {
    // Legacy format on this machine: base64 of [0x00 | 32-byte secret].
    const bytes = Buffer.from(b64, "base64");
    if (bytes.length !== 33 || bytes[0] !== 0x00) continue;
    const kp = Ed25519Keypair.fromSecretKey(bytes.slice(1));
    return kp;
  }
  throw new Error("no Ed25519 key found in keystore");
}

async function main() {
  const kp = loadKeyFromKeystore();
  const sender = kp.toSuiAddress();
  console.log("sender:", sender);

  const client = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl("mainnet"),
    network: "mainnet",
  });

  // Pull all USDC coin objects, ordered desc by balance so the first
  // becomes the merge target.
  const usdcCoins = (await client.getCoins({ owner: sender, coinType: USDC_TYPE })).data;
  const total = usdcCoins.reduce((a, c) => a + BigInt(c.balance as string), 0n);
  console.log(`USDC coins: ${usdcCoins.length}, total raw: ${total}`);
  if (total < USDC_AMOUNT) throw new Error(`need ${USDC_AMOUNT} raw USDC, have ${total}`);

  // Sort by balance desc so the largest coin is the merge target.
  usdcCoins.sort((a, b) => Number(BigInt(b.balance as string) - BigInt(a.balance as string)));
  const primary = usdcCoins[0];
  const tail = usdcCoins.slice(1).filter((c) => BigInt(c.balance as string) > 0n);

  // Sanity for SUI gas budget.
  const suiCoins = (await client.getCoins({ owner: sender, coinType: SUI_TYPE })).data;
  const suiTotal = suiCoins.reduce((a, c) => a + BigInt(c.balance as string), 0n);
  console.log(`SUI total raw: ${suiTotal} (need ${SUI_AMOUNT} + gas ~50_000_000)`);
  if (suiTotal < SUI_AMOUNT + 50_000_000n) {
    throw new Error(`need ${SUI_AMOUNT + 50_000_000n} MIST, have ${suiTotal}`);
  }

  // Pre-sort: 0x2 < 0xdba3 lex on type-name strings → A=SUI, B=USDC.
  // create_canonical_pool_entry<A,B>(factory, coin_a, coin_b, clock, ctx)

  const tx = new Transaction();

  // Merge USDC coins into the primary if there are any tail coins.
  if (tail.length > 0) {
    tx.mergeCoins(
      tx.object(primary.coinObjectId),
      tail.map((c) => tx.object(c.coinObjectId)),
    );
  }
  // Split exactly 333_000 raw off the (now-merged) primary.
  const [usdcCoin] = tx.splitCoins(tx.object(primary.coinObjectId), [
    tx.pure.u64(USDC_AMOUNT),
  ]);
  // Split exactly 353_004_781 MIST off the gas coin.
  const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(SUI_AMOUNT)]);

  tx.moveCall({
    target: `${DARBITEX_PACKAGE}::pool_factory::create_canonical_pool_entry`,
    typeArguments: [SUI_TYPE, USDC_TYPE],
    arguments: [
      tx.object(FACTORY),
      suiCoin,
      usdcCoin,
      tx.object("0x6"),
    ],
  });

  tx.setSender(sender);
  tx.setGasBudget(50_000_000n);

  console.log("dry-running…");
  const built = await tx.build({ client });
  const dry = await client.dryRunTransactionBlock({ transactionBlock: built });
  if (dry.effects.status.status !== "success") {
    console.error("DRY-RUN FAILED");
    console.error(JSON.stringify(dry.effects.status, null, 2));
    process.exit(1);
  }
  console.log(
    "dry-run gas:",
    `computation=${dry.effects.gasUsed.computationCost}`,
    `storage=${dry.effects.gasUsed.storageCost}`,
    `rebate=${dry.effects.gasUsed.storageRebate}`,
  );

  if (process.env.EXECUTE !== "YES") {
    console.log("\nSet EXECUTE=YES to broadcast.");
    return;
  }

  console.log("executing…");
  const res = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true, showEvents: true, showObjectChanges: true },
  });
  console.log("digest:", res.digest);
  if (res.effects?.status.status !== "success") {
    console.error("FAILED:", res.effects?.status);
    process.exit(1);
  }
  console.log("status:", res.effects?.status.status);

  // Pull the new Pool + LpPosition out of object changes.
  for (const c of res.objectChanges ?? []) {
    if (c.type === "created" && c.objectType.includes("::pool::Pool<")) {
      console.log("Pool created:", c.objectId, c.objectType);
    }
    if (c.type === "created" && c.objectType.includes("::pool::LpPosition<")) {
      console.log("LP position:", c.objectId, c.objectType);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
