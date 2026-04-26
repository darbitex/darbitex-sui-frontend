/**
 * Bind niocoin.sui SuiNS name -> the new Walrus site object via
 * controller::set_user_data with key="walrus_site_id".
 *
 * Recipe per memory `darbitex_status.md` + `darbitex_final_deployed.md`:
 *   ControllerV2 0x71af0354... :: controller::set_user_data
 *   Args: SuiNS shared 0x6e0ddefc..., NFT, "walrus_site_id" (key),
 *         <site_object_id_string> (value), Clock 0x6
 *
 * Run: npx tsx scripts/bind-suins.ts                # dry-run
 *      EXECUTE=YES npx tsx scripts/bind-suins.ts   # broadcast
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { SuinsClient, SuinsTransaction } from "@mysten/suins";
import { Transaction } from "@mysten/sui/transactions";

const NIOCOIN_NFT =
  "0x5d69eba8ed1f59cebd58d54311445b520427df2e7713eb838875a2b0038ba015";
const SITE_OBJECT_ID =
  "0xd6194fb86e172757264920743fa3c20801f944bd9f0ddd0f48b318fd01d8baa1";

function loadKey(): Ed25519Keypair {
  const path = `${homedir()}/.sui/sui_config/sui.keystore`;
  const raw = JSON.parse(readFileSync(path, "utf8")) as string[];
  for (const b64 of raw) {
    const bytes = Buffer.from(b64, "base64");
    if (bytes.length !== 33 || bytes[0] !== 0x00) continue;
    return Ed25519Keypair.fromSecretKey(bytes.slice(1));
  }
  throw new Error("no Ed25519 key found in keystore");
}

async function main() {
  const kp = loadKey();
  const sender = kp.toSuiAddress();
  console.log("sender:", sender);
  console.log("NFT:   ", NIOCOIN_NFT);
  console.log("site:  ", SITE_OBJECT_ID);

  const client = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl("mainnet"),
    network: "mainnet",
  });
  const suins = new SuinsClient({ client, network: "mainnet" });

  const tx = new Transaction();
  const stx = new SuinsTransaction(suins, tx);
  // walrus_site_id is one of ALLOWED_METADATA in @mysten/suins; the SDK
  // routes it through controller::set_user_data on package
  // 0x71af0354... with the SuiNS shared object resolved internally.
  stx.setUserData({
    nft: NIOCOIN_NFT,
    key: "walrus_site_id",
    value: SITE_OBJECT_ID,
  });
  tx.setSender(sender);
  tx.setGasBudget(50_000_000n);

  const built = await tx.build({ client });
  const dry = await client.dryRunTransactionBlock({ transactionBlock: built });
  if (dry.effects.status.status !== "success") {
    console.error("DRY-RUN FAILED:", JSON.stringify(dry.effects.status, null, 2));
    process.exit(1);
  }
  console.log(
    "dry-run OK — gas:",
    `comp=${dry.effects.gasUsed.computationCost}`,
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
    options: { showEffects: true, showEvents: true },
  });
  console.log("digest:", res.digest);
  console.log("status:", res.effects?.status.status);
  if (res.effects?.status.status !== "success") process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
