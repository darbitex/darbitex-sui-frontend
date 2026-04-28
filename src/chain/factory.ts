import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import {
  D_COIN_TYPE,
  D_REGISTRY,
  SUI_COIN_REGISTRY,
  TF_FEE_RAW,
  TF_ICON_MAX,
  TF_ICON_MIN,
  TF_ICON_PREFIX,
  TF_NAME_MAX,
  TF_NAME_MIN,
  TF_DESC_MAX,
  TF_DESC_MIN,
  TF_REQUIRED_DECIMALS,
  TF_SYMBOL_MAX,
  TF_SYMBOL_MIN,
  TOKEN_FACTORY_PACKAGE,
  TOKEN_FACTORY_REGISTRY,
} from "../config";
import { takeExactCoin } from "./coinSelect";

type SuiClient = SuiJsonRpcClient;

export interface FactoryRegistryView {
  sealed: boolean;
  tokens_launched: string;
}

export async function readFactoryRegistry(
  client: SuiClient,
): Promise<FactoryRegistryView | null> {
  const obj = await client.getObject({
    id: TOKEN_FACTORY_REGISTRY,
    options: { showContent: true },
  });
  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") return null;
  const fields = (obj.data.content as unknown as { fields: FactoryRegistryView }).fields;
  return { sealed: fields.sealed, tokens_launched: fields.tokens_launched };
}

// Check whether a symbol is already registered in the factory's `symbols`
// Table. The Table key type is `vector<u8>`; the dynamic-field name is the
// raw byte vector. Returns true if taken.
export async function readSymbolTaken(
  client: SuiClient,
  symbol: string,
): Promise<boolean> {
  const reg = await client.getObject({
    id: TOKEN_FACTORY_REGISTRY,
    options: { showContent: true },
  });
  const c = reg.data?.content;
  if (!c || c.dataType !== "moveObject") return false;
  const fields = (c as {
    fields: Record<string, { fields?: { id?: { id: string } } } | string | boolean>;
  }).fields;
  const symTable = fields.symbols as { fields?: { id?: { id: string } } } | undefined;
  const symTableId = symTable?.fields?.id?.id;
  if (!symTableId) return false;
  const symBytes = Array.from(new TextEncoder().encode(symbol));
  try {
    const dyn = await client.getDynamicFieldObject({
      parentId: symTableId,
      name: { type: "vector<u8>", value: symBytes },
    });
    return !!dyn.data;
  } catch {
    return false;
  }
}

// Form-side validation. Returns null if all good, or an error message.
export interface LaunchForm {
  symbol: string;
  name: string;
  description: string;
  iconUrl: string;
}

export function validateLaunchForm(f: LaunchForm): string | null {
  const sBytes = new TextEncoder().encode(f.symbol);
  if (sBytes.length < TF_SYMBOL_MIN || sBytes.length > TF_SYMBOL_MAX) {
    return `Symbol must be ${TF_SYMBOL_MIN}-${TF_SYMBOL_MAX} bytes.`;
  }
  for (const b of sBytes) {
    if (b < 0x21 || b > 0x7e) {
      return `Symbol contains a non-printable-ASCII byte (0x${b.toString(16)}).`;
    }
  }
  // OTW Move-source compatibility: symbol must start with [A-Za-z_]
  // and contain only [A-Za-z0-9_] so it can be used as the OTW struct
  // name. Factory itself accepts a wider charset, but the wizard's
  // generated Move source needs a valid identifier.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(f.symbol)) {
    return "Symbol must be a valid Move identifier ([A-Za-z_][A-Za-z0-9_]*) so the generated OTW package compiles.";
  }
  const nBytes = new TextEncoder().encode(f.name);
  if (nBytes.length < TF_NAME_MIN || nBytes.length > TF_NAME_MAX) {
    return `Name must be ${TF_NAME_MIN}-${TF_NAME_MAX} bytes.`;
  }
  const dBytes = new TextEncoder().encode(f.description);
  if (dBytes.length < TF_DESC_MIN || dBytes.length > TF_DESC_MAX) {
    return `Description must be ${TF_DESC_MIN}-${TF_DESC_MAX} bytes.`;
  }
  if (!f.iconUrl.startsWith(TF_ICON_PREFIX)) {
    return `Icon URL must begin with ${TF_ICON_PREFIX} (RFC 2397 data URI).`;
  }
  const iBytes = new TextEncoder().encode(f.iconUrl);
  if (iBytes.length < TF_ICON_MIN || iBytes.length > TF_ICON_MAX) {
    return `Icon URI must be ${TF_ICON_MIN}-${TF_ICON_MAX} bytes (got ${iBytes.length}).`;
  }
  return null;
}

export function feeForSymbol(symbol: string): bigint {
  const len = new TextEncoder().encode(symbol).length;
  if (len === 1) return TF_FEE_RAW[1];
  if (len === 2) return TF_FEE_RAW[2];
  if (len === 3) return TF_FEE_RAW[3];
  if (len === 4) return TF_FEE_RAW[4];
  return TF_FEE_RAW[5];
}

// Sui's OTW rule: the witness struct's name MUST be the all-uppercase
// form of the module's last segment. We always uppercase both regardless
// of the user's display-symbol case, so e.g. `MyToken` → module
// `mytoken::MYTOKEN`, struct `MYTOKEN`. The symbol stored in the
// Currency (and read by the factory for uniqueness + display) is passed
// to coin_registry as the user's exact-case input — independent of the
// OTW struct name.
export function otwIdentifier(symbol: string): string {
  return symbol.toUpperCase();
}

// Generate the OTW Move source the user will compile + publish via
// `sui client publish`. Decimals locked at 9 (factory enforces).
export function generateOtwSource(symbol: string): string {
  const lower = symbol.toLowerCase();
  const upper = otwIdentifier(symbol);
  return `module ${lower}::${upper};

use std::string;
use sui::coin_registry;

public struct ${upper} has drop {}

fun init(otw: ${upper}, ctx: &mut TxContext) {
    let (initializer, treasury) = coin_registry::new_currency_with_otw<${upper}>(
        otw,
        ${TF_REQUIRED_DECIMALS},
        string::utf8(b"${symbol}"),
        string::utf8(b"placeholder"),
        string::utf8(b"placeholder"),
        string::utf8(b"data:image/png;base64,placeholder"),
        ctx,
    );
    let cap = coin_registry::finalize(initializer, ctx);
    transfer::public_transfer(treasury, ctx.sender());
    transfer::public_transfer(cap, ctx.sender());
}
`;
}

export function generateMoveToml(symbol: string): string {
  const lower = symbol.toLowerCase();
  return `[package]
name = "${lower}"
edition = "2024.beta"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/mainnet" }

[addresses]
${lower} = "0x0"
`;
}

export interface PublishExtract {
  otwPackageId: string;
  treasuryCapId: string;
  metadataCapId: string;
  upgradeCapId: string;
  // Currency<T> sits as OwnedObject of 0xc as a Receiving<>. Capture its
  // version + digest at publish time so we can build the receivingRef.
  currencyReceiving: { objectId: string; version: string; digest: string };
  otwCoinType: string;
  sender: string;
}

// Read an OTW publish tx and extract the four caps + Currency<T> receiving
// reference. Caller passes the symbol so we filter struct types by it.
export async function parsePublishTx(
  client: SuiClient,
  digest: string,
  symbol: string,
): Promise<PublishExtract> {
  const tx = await client.getTransactionBlock({
    digest,
    options: { showEffects: true, showObjectChanges: true, showInput: true },
  });
  if (tx.effects?.status?.status !== "success") {
    throw new Error(`Publish tx not successful: ${JSON.stringify(tx.effects?.status)}`);
  }
  const sender =
    (tx.transaction?.data as { sender?: string } | undefined)?.sender ?? "";
  // OTW struct + module names live in uppercase (see otwIdentifier). The
  // runtime type tag is `<otw_pkg>::<UPPER>::<UPPER>`. parsePublishTx must
  // search for that, NOT the user's display-symbol case.
  const upper = otwIdentifier(symbol);
  const wantSuffix = `::${upper}::${upper}>`;
  let otwPackageId = "";
  let treasuryCapId = "";
  let metadataCapId = "";
  let upgradeCapId = "";
  let currencyReceiving: { objectId: string; version: string; digest: string } | null = null;
  for (const change of tx.objectChanges ?? []) {
    if (change.type === "published") {
      otwPackageId = (change as { packageId: string }).packageId;
    } else if (change.type === "created") {
      const c = change as {
        objectType?: string;
        objectId?: string;
        version?: string | number;
        digest?: string;
      };
      const ot = c.objectType ?? "";
      if (ot.includes("TreasuryCap<") && ot.endsWith(wantSuffix)) {
        treasuryCapId = c.objectId ?? "";
      } else if (ot.includes("MetadataCap<") && ot.endsWith(wantSuffix)) {
        metadataCapId = c.objectId ?? "";
      } else if (ot === "0x2::package::UpgradeCap") {
        upgradeCapId = c.objectId ?? "";
      } else if (ot.includes("Currency<") && ot.endsWith(wantSuffix)) {
        currencyReceiving = {
          objectId: c.objectId ?? "",
          version: String(c.version ?? ""),
          digest: c.digest ?? "",
        };
      }
    }
  }
  if (!otwPackageId || !treasuryCapId || !metadataCapId || !upgradeCapId || !currencyReceiving) {
    const missing: string[] = [];
    if (!otwPackageId) missing.push("otw_package_id");
    if (!treasuryCapId) missing.push("treasury_cap");
    if (!metadataCapId) missing.push("metadata_cap");
    if (!upgradeCapId) missing.push("upgrade_cap");
    if (!currencyReceiving) missing.push("currency_receiving");
    throw new Error(
      `Tx ${digest.slice(0, 10)}… is missing expected publish artifacts (${missing.join(", ")}). ` +
        `Make sure you published the OTW package generated for symbol "${symbol}".`,
    );
  }
  return {
    otwPackageId,
    treasuryCapId,
    metadataCapId,
    upgradeCapId,
    currencyReceiving,
    otwCoinType: `${otwPackageId}::${upper}::${upper}`,
    sender,
  };
}

// Tx2 — anyone-callable: shares Currency<T> by promoting the Receiving
// referenced object (owned by 0xc) to a shared object keyed by T.
export function buildFinalizeRegistrationTx(extract: PublishExtract): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: "0x2::coin_registry::finalize_registration",
    typeArguments: [extract.otwCoinType],
    arguments: [
      tx.object(SUI_COIN_REGISTRY),
      tx.receivingRef({
        objectId: extract.currencyReceiving.objectId,
        version: extract.currencyReceiving.version,
        digest: extract.currencyReceiving.digest,
      }),
    ],
  });
  return tx;
}

// After Tx2, the Currency<T> object_id is the same as currencyReceiving.objectId
// — the value is unchanged, just the ownership flipped to shared. So we
// reuse that id directly as the shared object input for Tx3.
export interface LaunchTxArgs {
  sender: string;
  extract: PublishExtract;
  name: string;
  description: string;
  iconUrl: string;
  // Exact tier fee in raw D units. Caller computes via feeForSymbol().
  feeRaw: bigint;
}

export async function buildLaunchTx(
  client: SuiClient,
  args: LaunchTxArgs,
): Promise<Transaction> {
  const tx = new Transaction();
  const fee = await takeExactCoin(client, tx, args.sender, D_COIN_TYPE, args.feeRaw);
  const enc = new TextEncoder();
  tx.moveCall({
    target: `${TOKEN_FACTORY_PACKAGE}::factory::launch`,
    typeArguments: [args.extract.otwCoinType],
    arguments: [
      tx.object(TOKEN_FACTORY_REGISTRY),
      tx.object(args.extract.currencyReceiving.objectId),
      tx.object(args.extract.treasuryCapId),
      tx.object(args.extract.metadataCapId),
      tx.object(args.extract.upgradeCapId),
      tx.pure.vector("u8", Array.from(enc.encode(args.name))),
      tx.pure.vector("u8", Array.from(enc.encode(args.description))),
      tx.pure.vector("u8", Array.from(enc.encode(args.iconUrl))),
      fee,
      tx.object(D_REGISTRY),
    ],
  });
  return tx;
}

// Aggregate: count of TokenLaunched events == tokens_launched. Also returns
// recent N for display.
export interface LaunchHistoryEntry {
  creator: string;
  symbol: string;
  name: string;
  coinType: string;
  feePaid: bigint;
  tx: string;
  ts: number;
}

export async function readRecentLaunches(
  client: SuiClient,
  recentN: number = 10,
  maxPages: number = 10,
): Promise<LaunchHistoryEntry[]> {
  const all: LaunchHistoryEntry[] = [];
  let cursor: { txDigest: string; eventSeq: string } | null | undefined = undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await client.queryEvents({
      query: { MoveEventType: `${TOKEN_FACTORY_PACKAGE}::factory::TokenLaunched` },
      limit: 50,
      order: "descending",
      cursor: cursor ?? undefined,
    });
    for (const ev of page.data) {
      const j = ev.parsedJson as
        | {
            creator?: string;
            coin_type?: { name?: string };
            symbol?: number[] | string;
            name?: number[] | string;
            fee_paid?: string;
          }
        | undefined;
      if (!j) continue;
      const sym =
        typeof j.symbol === "string"
          ? j.symbol
          : new TextDecoder().decode(new Uint8Array(j.symbol ?? []));
      const nm =
        typeof j.name === "string"
          ? j.name
          : new TextDecoder().decode(new Uint8Array(j.name ?? []));
      all.push({
        creator: j.creator ?? "",
        symbol: sym,
        name: nm,
        coinType: j.coin_type?.name ?? "",
        feePaid: BigInt(j.fee_paid ?? "0"),
        tx: ev.id.txDigest,
        ts: Number(ev.timestampMs ?? 0),
      });
    }
    if (!page.hasNextPage) break;
    cursor = page.nextCursor as typeof cursor;
  }
  return all.slice(0, recentN);
}

