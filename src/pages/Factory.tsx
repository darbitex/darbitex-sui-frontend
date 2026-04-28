import { useEffect, useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { WalletBalances } from "../components/WalletBalances";
import {
  buildFinalizeRegistrationTx,
  buildLaunchTx,
  buildOtwPublishTx,
  feeForSymbol,
  generateMoveToml,
  generateOtwSource,
  otwIdentifier,
  parsePublishTx,
  readFactoryRegistry,
  readRecentLaunches,
  readSymbolTaken,
  validateLaunchForm,
  type FactoryRegistryView,
  type LaunchHistoryEntry,
  type PublishExtract,
} from "../chain/factory";
import { useCoinBalance } from "../chain/useBalance";
import { compactNumber, formatUnits, shortAddr } from "../chain/format";
import {
  D_COIN_TYPE,
  D_DECIMALS,
  SUI_COIN_TYPE,
  TF_ICON_MAX,
  TF_ICON_PREFIX,
  TOKEN_FACTORY_REGISTRY,
} from "../config";

type Step = "form" | "publish" | "finalize" | "launch" | "done";

export function FactoryPage() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const [step, setStep] = useState<Step>("form");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Form state.
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconUrl, setIconUrl] = useState("");

  // Symbol availability check (debounced).
  const [symbolTaken, setSymbolTaken] = useState<null | boolean>(null);
  const [checkingSym, setCheckingSym] = useState(false);

  const dBal = useCoinBalance(D_COIN_TYPE, statusMsg);

  // Factory registry status + recent launches.
  const [registry, setRegistry] = useState<FactoryRegistryView | null>(null);
  const [launches, setLaunches] = useState<LaunchHistoryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([readFactoryRegistry(client), readRecentLaunches(client)])
      .then(([r, l]) => {
        if (cancelled) return;
        setRegistry(r);
        setLaunches(l);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, statusMsg]);

  useEffect(() => {
    setSymbolTaken(null);
    if (!symbol) return;
    const t = setTimeout(() => {
      setCheckingSym(true);
      readSymbolTaken(client, symbol)
        .then((taken) => setSymbolTaken(taken))
        .catch(() => setSymbolTaken(null))
        .finally(() => setCheckingSym(false));
    }, 400);
    return () => clearTimeout(t);
  }, [client, symbol]);

  const formError = useMemo(
    () => validateLaunchForm({ symbol, name, description, iconUrl }),
    [symbol, name, description, iconUrl],
  );
  const fee = useMemo(() => (symbol ? feeForSymbol(symbol) : 0n), [symbol]);
  const enoughD = dBal >= fee;

  // Icon upload state.
  const [iconError, setIconError] = useState<string | null>(null);

  function onIconFile(file: File | null) {
    setIconError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setIconError(`File type "${file.type || "unknown"}" is not an image.`);
      return;
    }
    // Worst-case base64 inflation is ~4/3 + scheme prefix; bail early if
    // even a perfectly-encoded version would blow TF_ICON_MAX.
    const projected = Math.ceil((file.size * 4) / 3) + 32;
    if (projected > TF_ICON_MAX) {
      setIconError(
        `File is ${file.size} bytes; base64 would exceed the ${TF_ICON_MAX}-byte on-chain limit. Resize/compress first.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setIconError("Failed to read file.");
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        setIconError("Reader returned non-string.");
        return;
      }
      // FileReader produces a data:<mime>;base64,<...> URI directly.
      if (!result.startsWith(TF_ICON_PREFIX)) {
        setIconError(`Reader returned a URI without ${TF_ICON_PREFIX} prefix.`);
        return;
      }
      const byteLen = new TextEncoder().encode(result).length;
      if (byteLen > TF_ICON_MAX) {
        setIconError(
          `Encoded URI is ${byteLen} bytes; on-chain max is ${TF_ICON_MAX}. Resize/compress first.`,
        );
        return;
      }
      setIconUrl(result);
    };
    reader.readAsDataURL(file);
  }

  const iconBytes = useMemo(
    () => (iconUrl ? new TextEncoder().encode(iconUrl).length : 0),
    [iconUrl],
  );

  // Tx2/Tx3 state.
  const [publishDigest, setPublishDigest] = useState("");
  const [extract, setExtract] = useState<PublishExtract | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  const moveSrc = symbol && !formError ? generateOtwSource(symbol) : "";
  const moveToml = symbol && !formError ? generateMoveToml(symbol) : "";

  function copy(text: string) {
    void navigator.clipboard.writeText(text).catch(() => {});
  }

  function downloadFile(filename: string, body: string) {
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  }

  function onContinueFromForm() {
    if (formError) return;
    if (symbolTaken === true) return;
    setStep("publish");
  }

  async function onParsePublish() {
    if (!publishDigest) return;
    setParseError(null);
    setParsing(true);
    try {
      const ex = await parsePublishTx(client, publishDigest.trim(), symbol);
      if (account && ex.sender && ex.sender !== account.address) {
        setParseError(
          `This publish tx was sent by ${shortAddr(ex.sender)}, not your connected wallet ${shortAddr(account.address)}. ` +
            `The OTW caps live in the publisher's wallet — connect that wallet first.`,
        );
        return;
      }
      setExtract(ex);
      setStep("finalize");
    } catch (e) {
      setParseError((e as Error).message);
    } finally {
      setParsing(false);
    }
  }

  // In-browser OTW publish via @mysten/move-bytecode-template. Mutates a
  // precompiled TEMPLATE.mv (struct + symbol-string), wraps it in a
  // tx.publish, signs via the connected wallet, then auto-extracts caps
  // from the resulting tx's objectChanges (same path the CLI fallback
  // uses) and advances to the finalize step.
  const [browserPublishing, setBrowserPublishing] = useState(false);
  async function onPublishInBrowser() {
    if (!account || !symbol || formError) return;
    setStatusMsg(null);
    setParseError(null);
    setBrowserPublishing(true);
    try {
      const tx = await buildOtwPublishTx(account.address, symbol);
      const res = await signAndExecute({ transaction: tx });
      // Wait for indexing so the follow-up getTransactionBlock can read
      // objectChanges. signAndExecute returns once the validator quorum
      // signs, but RPC nodes lag a moment.
      await client.waitForTransaction({ digest: res.digest });
      setStatusMsg(`OTW published — ${res.digest.slice(0, 10)}…`);
      const ex = await parsePublishTx(client, res.digest, symbol);
      setExtract(ex);
      setPublishDigest(res.digest);
      setStep("finalize");
    } catch (e) {
      setParseError((e as Error).message);
    } finally {
      setBrowserPublishing(false);
    }
  }

  async function onFinalize() {
    if (!extract || !account) return;
    setStatusMsg(null);
    try {
      const tx = buildFinalizeRegistrationTx(extract);
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Currency<${otwIdentifier(symbol)}> shared — ${res.digest.slice(0, 10)}…`);
      setStep("launch");
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  async function onLaunch() {
    if (!extract || !account) return;
    setStatusMsg(null);
    try {
      const tx = await buildLaunchTx(client, {
        sender: account.address,
        extract,
        name,
        description,
        iconUrl,
        feeRaw: fee,
      });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Token launched — ${res.digest.slice(0, 10)}…`);
      setStep("done");
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  function reset() {
    setSymbol("");
    setName("");
    setDescription("");
    setIconUrl("");
    setPublishDigest("");
    setExtract(null);
    setStatusMsg(null);
    setParseError(null);
    setStep("form");
  }

  return (
    <section className="page">
      <h1 className="page-title">Launch a token</h1>
      <p className="page-subtitle">
        Permissionless 1B-fixed-supply minter. 9 decimals, no premint, sealed
        OTW package, immutable metadata, on-chain icon. Tier fee in D routed
        100% to D's Stability Pool as an agnostic donation.
      </p>
      <WalletBalances types={[SUI_COIN_TYPE, D_COIN_TYPE]} />

      <div className="grid-2">
        <div className="stat-card">
          <div className="stat-label">Tokens launched</div>
          <div className="stat-value">{registry?.tokens_launched ?? "—"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Factory sealed</div>
          <div className="stat-value">{registry?.sealed ? "✓ immutable" : "no"}</div>
        </div>
      </div>

      {registry?.sealed === false && (
        <div className="status">
          Factory is not yet sealed. Launches still work; ownership controls remain on the
          deployer wallet until <code>factory::seal</code> is called.
        </div>
      )}

      <div className="panel">
        <h2>How this works</h2>
        <p className="dim">
          A token launch needs <strong>3 wallet signatures</strong>. They
          cannot be merged into a single PTB — see <em>Why not 1 PTB?</em>{" "}
          below. All three are signed via your connected browser wallet —
          no CLI required.
        </p>
        <ul className="kv" style={{ fontSize: 12 }}>
          <li>
            <span className="dim">Tx1 — Publish OTW</span>
            <span>
              This page loads a precompiled <code>TEMPLATE.mv</code> Move
              bytecode (built once from{" "}
              <code>scripts/otw-template/</code>), runs two
              <code> @mysten/move-bytecode-template</code> WASM mutations
              in your browser — rename identifier{" "}
              <code>TEMPLATE</code> →{" "}
              <code>{symbol ? otwIdentifier(symbol) : "MYTOKEN"}</code>{" "}
              (the OTW witness struct + module name) and replace the
              constant-pool symbol bytes <code>"TEMPLATE"</code> →{" "}
              <code>"{symbol || "MyToken"}"</code> — then submits a Sui{" "}
              <code>tx.publish</code> via your wallet. Sui's One-Time-Witness
              rule requires the witness type to live in its own package, so
              this step must always be a <em>publish</em> kind tx, never a
              regular Move call. Outputs: <code>Currency&lt;T&gt;</code>{" "}
              (sent as <code>Receiving</code> to <code>0xc</code>),{" "}
              <code>TreasuryCap&lt;T&gt;</code>,{" "}
              <code>MetadataCap&lt;T&gt;</code>, <code>UpgradeCap</code>.
              ≈ 0.05 SUI gas. A CLI fallback is available under Step 2 if
              you'd rather inspect + compile the Move source yourself.
            </span>
          </li>
          <li>
            <span className="dim">Tx2 — Finalize registration</span>
            <span>
              Calls <code>0x2::coin_registry::finalize_registration&lt;T&gt;</code>{" "}
              to promote <code>Currency&lt;T&gt;</code> from owned-by-
              <code>0xc</code> to a globally-shared object. Anyone-callable;
              this page signs it from your wallet. ≈ 0.005 SUI gas.
            </span>
          </li>
          <li>
            <span className="dim">Tx3 — factory::launch</span>
            <span>
              Atomic: pays the tier fee in D to <code>D::donate_to_sp</code>,
              seals your OTW package via <code>package::make_immutable</code>,
              writes name + description + icon via the MetadataCap, deletes
              the MetadataCap, mints 1B tokens to your wallet, converts the
              TreasuryCap to BurnOnly, and registers the symbol in the
              factory's namespace Table. ≈ 0.15 SUI gas + tier fee in D.
            </span>
          </li>
        </ul>
        <details>
          <summary className="dim" style={{ fontSize: 12 }}>
            Why not 1 PTB?
          </summary>
          <p className="dim" style={{ fontSize: 12 }}>
            <strong>Tx1 cannot be a PTB call.</strong> A package publish is
            its own transaction kind — PTBs are sequences of Move calls
            against existing packages and cannot upload new bytecode. This
            is true whether the publish runs from CLI or from in-browser
            bytecode mutation; both produce the same Sui <em>publish</em>{" "}
            transaction kind.
            <br />
            <br />
            <strong>Tx2 and Tx3 cannot be merged either.</strong> Sui PTBs
            declare every object input (and its ownership class — Owned,
            Shared, Receiving, ImmObject) at the start of the transaction.
            The <code>Currency&lt;T&gt;</code> object transitions from
            <code> Receiving&lt;Currency&lt;T&gt;&gt;</code> to a shared
            object <em>during</em> Tx2 — but a single PTB can't
            simultaneously reference the same object as both Receiving (for
            Tx2) and Shared-mut (for Tx3). The factory's <code>launch</code>{" "}
            entry takes <code>&amp;mut Currency&lt;T&gt;</code>, which only
            resolves once the object is shared. Three transactions are the
            architectural minimum.
          </p>
        </details>
      </div>

      <div className="panel">
        <h2>How to acquire D</h2>
        <p className="dim">
          The fee is paid in <strong>D</strong>, the immutable
          SUI-collateralised stablecoin in this app (<code>{D_DECIMALS}</code>{" "}
          decimals). Cheapest path for new users:
        </p>
        <ol className="kv" style={{ fontSize: 12, paddingLeft: 16 }}>
          <li>
            Go to <a href="/one/trove">D → Trove</a> and open a trove. Minimum
            debt is 1 D; minimum CR is 200% (you must deposit twice the USD
            value of D you mint).
          </li>
          <li>
            For a 5+ character symbol (0.1 D fee) you need ≥ 1 D in the
            trove anyway — so a single 1-D trove gives enough buffer to
            launch one token and keep some D left over.
          </li>
          <li>
            For shorter symbols the fee escalates fast (1ch = 1000 D, 2 = 100,
            3 = 10, 4 = 1). Open a larger trove or batch via{" "}
            <a href="/one/redeem">redemption</a> against an existing trove
            holder.
          </li>
          <li>
            Alternative paths: receive D via transfer, claim D from{" "}
            <a href="/one/sp">SP rewards</a> after a liquidation, or swap for
            D once a SUI/D AMM pool exists (none seeded at launch).
          </li>
        </ol>
        <p className="dim" style={{ fontSize: 11 }}>
          Note: D's mint fee is 1%, with 10% of that fee redirected to D's
          Stability Pool as an agnostic donation and 90% paid out as SP
          rewards. So when you mint 1 D you receive 0.99 D in your wallet.
        </p>
      </div>

      <div className="panel">
        <h2>1. Token details</h2>
        <p className="dim">
          Decimals are locked at 9. Total supply is fixed at 1B. Symbol must be
          ASCII-printable, 1–32 bytes, AND a valid Move identifier (so the
          generated OTW source compiles).
        </p>
        <label className="field-label">Symbol</label>
        <input
          className="input"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="MYTOKEN"
        />
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="dim">
            Fee tier:{" "}
            {symbol
              ? `${formatUnits(fee, D_DECIMALS)} D (${new TextEncoder().encode(symbol).length}-byte symbol)`
              : "—"}
          </span>
          <span className="dim">
            {checkingSym
              ? "checking…"
              : symbol && symbolTaken === true
                ? "✗ taken in this factory"
                : symbol && symbolTaken === false
                  ? "✓ available"
                  : ""}
          </span>
        </div>
        {symbol && !formError && (
          <div className="warning-box" style={{ fontSize: 11 }}>
            <strong>Auto-generated identifiers</strong> (you don't need to
            edit anything — the wizard handles all of this for you):
            <ul className="kv" style={{ margin: "4px 0 0", fontSize: 11 }}>
              <li>
                <span className="dim">Display symbol</span>
                <code>{symbol}</code>
              </li>
              <li>
                <span className="dim">OTW struct + module</span>
                <code>{otwIdentifier(symbol)}</code>
              </li>
              <li>
                <span className="dim">Move package alias</span>
                <code>{symbol.toLowerCase()}</code>
              </li>
              <li>
                <span className="dim">Source filename</span>
                <code>{otwIdentifier(symbol)}.move</code>
              </li>
            </ul>
            Sui's One-Time-Witness rule requires the struct name to equal
            the uppercase form of the module name — the generator emits{" "}
            <code>{otwIdentifier(symbol)}</code> in the .move file
            regardless of how you cased the symbol. Your display-case
            symbol <code>{symbol}</code> still goes into the Currency's
            on-chain metadata and is what wallets show.
          </div>
        )}
        <label className="field-label">Name</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Token"
        />
        <label className="field-label">Description</label>
        <textarea
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description shown in wallets and explorers."
          rows={3}
          style={{ resize: "vertical" }}
        />
        <label className="field-label">Icon</label>
        <div className="warning-box">
          <strong>Image upload only — no URLs.</strong> The factory enforces
          an on-chain <code>{TF_ICON_PREFIX}…</code> data-URI prefix, so HTTPS
          / IPFS / Arweave / Walrus links are rejected at launch. Pick a
          local file; this page base64-encodes and embeds it directly.
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            <li>
              <strong>Allowed types:</strong> PNG, JPEG, WebP, GIF, SVG
            </li>
            <li>
              <strong>Max size:</strong> {TF_ICON_MAX.toLocaleString()} bytes{" "}
              <em>after base64</em> (≈ 48 KB raw image — base64 inflates ~33%)
            </li>
            <li>
              <strong>Recommended:</strong> 256×256 PNG, &lt; 20 KB raw, for
              fastest tx + clean wallet rendering
            </li>
            <li>
              <strong>SVG caveat:</strong> wallets that inline-render SVG can
              execute embedded <code>&lt;script&gt;</code>; keep SVGs as
              static art only
            </li>
          </ul>
        </div>
        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            onChange={(e) => onIconFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 12, flex: 1 }}
          />
          {iconUrl && iconUrl.startsWith(TF_ICON_PREFIX) && (
            <img
              src={iconUrl}
              alt="icon preview"
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                background: "#0a0a0a",
                border: "1px solid #1a1a1a",
                objectFit: "contain",
              }}
            />
          )}
        </div>
        {iconUrl && (
          <p className="dim" style={{ fontSize: 11, marginTop: 4 }}>
            Encoded size: {iconBytes.toLocaleString()} / {TF_ICON_MAX.toLocaleString()} bytes
          </p>
        )}
        {iconError && <div className="status">{iconError}</div>}
        <details>
          <summary className="dim" style={{ fontSize: 11 }}>
            …or paste a {TF_ICON_PREFIX} URI manually
          </summary>
          <textarea
            className="input"
            value={iconUrl}
            onChange={(e) => setIconUrl(e.target.value)}
            placeholder={`${TF_ICON_PREFIX}png;base64,iVBORw0KGgo…`}
            rows={3}
            style={{ resize: "vertical", fontFamily: "monospace", fontSize: 11, marginTop: 6 }}
          />
        </details>
        <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
          <span className="dim">
            Your D balance: <strong>{formatUnits(dBal, D_DECIMALS)} D</strong>
            {symbol && !enoughD && (
              <>
                {" "}
                — need {formatUnits(fee, D_DECIMALS)} for fee.
              </>
            )}
          </span>
          <button
            className="btn-primary"
            onClick={onContinueFromForm}
            disabled={
              !!formError || symbolTaken === true || !account || !enoughD
            }
          >
            Continue
          </button>
        </div>
        {formError && <div className="status">{formError}</div>}
        {!account && <div className="status">Connect a wallet to continue.</div>}
      </div>

      {step !== "form" && (
        <div className="panel">
          <h2>2. Publish the OTW package</h2>
          <p className="dim">
            One click: this page mutates a precompiled OTW template
            (renames the witness struct + module name to{" "}
            <code>{otwIdentifier(symbol)}</code> and patches the symbol
            string to <code>{symbol}</code>) and submits a publish tx via
            your wallet. No CLI, no terminal, no Move toolchain. ~0.05 SUI
            gas.
          </p>
          <button
            className="btn-primary"
            onClick={onPublishInBrowser}
            disabled={browserPublishing || isPending || !account}
            style={{ width: "100%", padding: "14px 20px", fontSize: 14 }}
          >
            {browserPublishing
              ? "Mutating bytecode + signing…"
              : isPending
                ? "Submitting…"
                : `Publish ${otwIdentifier(symbol)} OTW (in-browser)`}
          </button>

          <details style={{ marginTop: 16 }}>
            <summary className="dim" style={{ fontSize: 12 }}>
              Or publish manually via <code>sui client publish</code> CLI
            </summary>
            <p className="dim" style={{ fontSize: 12, marginTop: 6 }}>
              Useful if you've already published the OTW package or you'd
              rather inspect the Move source first. Download the two
              files below into an empty folder, run{" "}
              <code>sui client publish --gas-budget 200000000 --json</code>{" "}
              from that folder, then paste the digest. Make sure the
              publisher wallet is the same one you connected here ({" "}
              {account ? shortAddr(account.address) : "—"}).
            </p>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn-ghost"
                onClick={() => downloadFile(`${otwIdentifier(symbol)}.move`, moveSrc)}
              >
                Download {otwIdentifier(symbol)}.move
              </button>
              <button
                className="btn-ghost"
                onClick={() => downloadFile("Move.toml", moveToml)}
              >
                Download Move.toml
              </button>
              <button className="btn-ghost" onClick={() => copy(moveSrc)}>
                Copy {otwIdentifier(symbol)}.move
              </button>
              <button className="btn-ghost" onClick={() => copy(moveToml)}>
                Copy Move.toml
              </button>
            </div>
            <details style={{ marginTop: 8 }}>
              <summary className="dim">Show generated {otwIdentifier(symbol)}.move</summary>
              <pre className="code-block">{moveSrc}</pre>
            </details>
            <details>
              <summary className="dim">Show Move.toml</summary>
              <pre className="code-block">{moveToml}</pre>
            </details>

            <label className="field-label" style={{ marginTop: 12 }}>
              Publish tx digest
            </label>
            <input
              className="input"
              value={publishDigest}
              onChange={(e) => setPublishDigest(e.target.value)}
              placeholder="3xPq…"
              style={{ fontFamily: "monospace", fontSize: 12 }}
            />
            <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
              <span className="dim">
                {extract
                  ? `OTW pkg: ${shortAddr(extract.otwPackageId)}`
                  : "Extracts caps + Currency<T> from your publish tx."}
              </span>
              <button
                className="btn-ghost"
                onClick={onParsePublish}
                disabled={parsing || !publishDigest.trim()}
              >
                {parsing ? "Reading tx…" : "Verify publish"}
              </button>
            </div>
          </details>
          {parseError && <div className="status">{parseError}</div>}
        </div>
      )}

      {extract && step !== "form" && step !== "publish" && (
        <div className="panel">
          <h2>3. Finalize Currency registration</h2>
          <p className="dim">
            One-shot anyone-callable promotion of{" "}
            <code>Currency&lt;{otwIdentifier(symbol)}&gt;</code>{" "}
            from <code>0xc</code>-owned to a globally-shared object. Required
            before <code>factory::launch</code> can mutate it.
          </p>
          <ul className="kv">
            <li>
              <span className="dim">OTW package</span>
              <code>{extract.otwPackageId}</code>
            </li>
            <li>
              <span className="dim">TreasuryCap</span>
              <code>{extract.treasuryCapId}</code>
            </li>
            <li>
              <span className="dim">MetadataCap</span>
              <code>{extract.metadataCapId}</code>
            </li>
            <li>
              <span className="dim">UpgradeCap</span>
              <code>{extract.upgradeCapId}</code>
            </li>
            <li>
              <span className="dim">Currency Receiving</span>
              <code>{extract.currencyReceiving.objectId}</code>
            </li>
          </ul>
          {step === "finalize" ? (
            <button
              className="btn-primary"
              onClick={onFinalize}
              disabled={isPending}
            >
              {isPending ? "Submitting…" : "Finalize registration"}
            </button>
          ) : (
            <p className="dim">✓ Currency shared</p>
          )}
        </div>
      )}

      {extract && (step === "launch" || step === "done") && (
        <div className="panel">
          <h2>4. Launch</h2>
          <p className="dim">
            Atomic <code>factory::launch&lt;{otwIdentifier(symbol)}&gt;</code>:
            pay the tier fee in D (donated to SP), seal the OTW package via{" "}
            <code>package::make_immutable</code>, write metadata, mint 1B to
            you, and convert TreasuryCap to BurnOnly. All in one tx.
          </p>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="dim">
              Tier fee: <strong>{formatUnits(fee, D_DECIMALS)} D</strong>
            </span>
            <span className="dim">
              You receive: <strong>1,000,000,000 {symbol}</strong>
            </span>
          </div>
          {step === "launch" ? (
            <button
              className="btn-primary"
              onClick={onLaunch}
              disabled={isPending}
            >
              {isPending ? "Submitting…" : `Pay ${formatUnits(fee, D_DECIMALS)} D and launch`}
            </button>
          ) : (
            <>
              <p className="dim">✓ Launched. The token is live and your wallet holds 1B {symbol}.</p>
              <button className="btn-ghost" onClick={reset}>
                Launch another
              </button>
            </>
          )}
        </div>
      )}

      {statusMsg && <div className="status">{statusMsg}</div>}

      <div className="panel">
        <h2>Recent launches</h2>
        {launches.length === 0 ? (
          <p className="dim">No tokens launched yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th>Creator</th>
                <th>Fee paid</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {launches.map((l) => (
                <tr key={l.tx}>
                  <td>
                    <strong>{l.symbol}</strong>
                  </td>
                  <td>{l.name}</td>
                  <td>
                    <a
                      href={`https://suiscan.xyz/mainnet/account/${l.creator}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {shortAddr(l.creator)}
                    </a>
                  </td>
                  <td>{compactNumber(l.feePaid, D_DECIMALS)} D</td>
                  <td>
                    <a
                      href={`https://suiscan.xyz/mainnet/tx/${l.tx}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {l.tx.slice(0, 8)}…
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="dim" style={{ marginTop: 8 }}>
          Factory registry:{" "}
          <a
            href={`https://suiscan.xyz/mainnet/object/${TOKEN_FACTORY_REGISTRY}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <code>{shortAddr(TOKEN_FACTORY_REGISTRY)}</code>
          </a>
        </p>
      </div>
    </section>
  );
}
