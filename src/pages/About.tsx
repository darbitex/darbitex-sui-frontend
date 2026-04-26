import {
  DARBITEX_FACTORY,
  DARBITEX_PACKAGE,
  ONE_PACKAGE,
  ONE_REGISTRY,
  PYTH_SUI_USD_PRICE_INFO_OBJECT,
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
        <h2>ONE Sui</h2>
        <p>
          Liquity-V1-style CDP. SUI collateral, ONE stablecoin, Pyth SUI/USD
          oracle. 200% MCR, 150% liquidation threshold, 10% liquidation bonus
          (2.5% liquidator + 2.5% reserve + 50% Stability Pool). 1% fee on
          mint and on redeem. 1 ONE minimum debt — retail-first. Sealed and
          ownerless.
        </p>
        <ul className="kv">
          <li>
            <span className="dim">Package</span>
            <ExplorerLink id={ONE_PACKAGE} />
          </li>
          <li>
            <span className="dim">Registry</span>
            <ExplorerLink id={ONE_REGISTRY} />
          </li>
          <li>
            <span className="dim">Pyth SUI/USD</span>
            <ExplorerLink id={PYTH_SUI_USD_PRICE_INFO_OBJECT} />
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
            <span className="dim">ONE</span>
            <a
              href="https://github.com/darbitex/ONE"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/darbitex/ONE
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}
