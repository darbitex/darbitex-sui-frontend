import {
  DARBITEX_FACTORY,
  DARBITEX_PACKAGE,
  D_PACKAGE,
  D_REGISTRY,
  PYTH_SUI_USD_PRICE_INFO_OBJECT,
  TOKEN_FACTORY_PACKAGE,
  TOKEN_FACTORY_REGISTRY,
} from "../config";

function ExplorerLink({ id, label }: { id: string; label?: string }) {
  return (
    <a
      href={`https://suiscan.xyz/mainnet/object/${id}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <code>{label ?? id}</code>
    </a>
  );
}

export function AboutPage() {
  return (
    <section className="page">
      <h1 className="page-title">About</h1>

      <div className="panel">
        <h2>Part of the Darbitex ecosystem</h2>
        <p>
          Darbitex Sui is the Sui-mainnet sibling of <strong>Darbitex on
          Aptos</strong> — same design philosophy (immutable, ownerless,
          zero-admin AMM with surplus-fee capture and a Liquity-V1-style
          stablecoin), ported to Sui's object model. The Aptos deployment is
          the original and runs the broader product surface (arbitrage,
          flashbot, vault, staking, factory, disperse).
        </p>
        <ul className="kv">
          <li>
            <span className="dim">Aptos frontend</span>
            <a
              href="https://darbitex.wal.app"
              target="_blank"
              rel="noopener noreferrer"
            >
              darbitex.wal.app
            </a>
          </li>
          <li>
            <span className="dim">Sui frontend</span>
            <a
              href="https://niocoin.wal.app"
              target="_blank"
              rel="noopener noreferrer"
            >
              niocoin.wal.app
            </a>
          </li>
        </ul>
      </div>

      <div className="panel">
        <h2>Darbitex Sui</h2>
        <p>
          x*y=k AMM. 5 bps swap fee, 5 bps flash-loan fee, 100% to LPs. No
          treasury, no admin, no upgrade — the package is sealed via{" "}
          <code>sui::package::make_immutable</code>. LP positions are
          per-position NFTs with individual fee debt accumulators.
        </p>
        <ul className="kv">
          <li>
            <span className="dim">Package</span>
            <ExplorerLink id={DARBITEX_PACKAGE} />
          </li>
          <li>
            <span className="dim">Factory</span>
            <ExplorerLink id={DARBITEX_FACTORY} />
          </li>
        </ul>
      </div>

      <div className="panel">
        <h2>D Sui (v0.2.0)</h2>
        <p>
          Liquity-V1-style CDP. SUI collateral, D stablecoin, Pyth SUI/USD
          oracle. 200% MCR, 150% liquidation threshold, 10% liquidation bonus
          (2.5% liquidator + 2.5% reserve + 50% Stability Pool). 1% fee on
          mint and on redeem, split <strong>10% to SP as agnostic donation
          + 90% to keyed SP depositors</strong> as reward (no dilution from
          the donation flow). 1 D minimum debt. Permissionless{" "}
          <code>donate_to_sp</code> and <code>donate_to_reserve</code>.
          Sealed and ownerless.
        </p>
        <ul className="kv">
          <li>
            <span className="dim">Package</span>
            <ExplorerLink id={D_PACKAGE} />
          </li>
          <li>
            <span className="dim">Registry</span>
            <ExplorerLink id={D_REGISTRY} />
          </li>
          <li>
            <span className="dim">Pyth SUI/USD</span>
            <ExplorerLink id={PYTH_SUI_USD_PRICE_INFO_OBJECT} />
          </li>
        </ul>
      </div>

      <div className="panel">
        <h2>Darbitex Sui Token Factory</h2>
        <p>
          Permissionless 1B-fixed-supply coin minter. 9 decimals, no premint,
          immutable metadata, on-chain icon (data:image/...). Tier fee in D
          (1ch=1000 / 2=100 / 3=10 / 4=1 / 5+=0.1) routed entirely through{" "}
          <code>D::donate_to_sp</code> as an SP donation — every launch
          permanently locks D in the protocol. Caller's OTW UpgradeCap is
          consumed atomically inside <code>launch</code> via{" "}
          <code>package::make_immutable</code>. Symbol uniqueness within
          this factory is Table-keyed.
        </p>
        <ul className="kv">
          <li>
            <span className="dim">Package</span>
            <ExplorerLink id={TOKEN_FACTORY_PACKAGE} />
          </li>
          <li>
            <span className="dim">FactoryRegistry</span>
            <ExplorerLink id={TOKEN_FACTORY_REGISTRY} />
          </li>
        </ul>
      </div>

      <div className="panel">
        <h2>Disclosure</h2>
        <p>
          Built by a solo developer with AI tooling. Audits are AI-only —
          multi-round Claude self-audit plus external LLM review (Gemini, Grok,
          Qwen, DeepSeek, Kimi). No professional human security firm has
          reviewed this code. Once sealed, the protocol has no team, foundation,
          legal entity, or support channel. All losses from bugs, exploits,
          oracle issues, market manipulation, user error, or any other cause
          are borne entirely by users. The full 11-item on-chain disclosure is
          readable from <code>pool::read_warning()</code> on the Darbitex
          package.
        </p>
      </div>

      <div className="panel">
        <h2>Source</h2>
        <ul className="kv">
          <li>
            <span className="dim">Darbitex Sui</span>
            <a
              href="https://github.com/darbitex/darbitex-sui"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/darbitex/darbitex-sui
            </a>
          </li>
          <li>
            <span className="dim">D</span>
            <a
              href="https://github.com/darbitex/D"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/darbitex/D
            </a>
          </li>
          <li>
            <span className="dim">Token Factory</span>
            <a
              href="https://github.com/darbitex/darbitex-sui-token-factory"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/darbitex/darbitex-sui-token-factory
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}
