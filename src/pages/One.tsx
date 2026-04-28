import { NavLink, Outlet } from "react-router-dom";
import { WalletBalances } from "../components/WalletBalances";
import { D_COIN_TYPE, SUI_COIN_TYPE } from "../config";

export function OneShell() {
  return (
    <section className="page">
      <h1 className="page-title">D</h1>
      <p className="page-subtitle">
        Immutable Liquity-V1 CDP. SUI collateral, Pyth oracle, 200% MCR, 1
        D min debt. 10% of every fee donated to the SP (agnostic, no
        dilution).
      </p>
      <WalletBalances types={[SUI_COIN_TYPE, D_COIN_TYPE]} />
      <nav className="subnav">
        <NavLink to="." end>Overview</NavLink>
        <NavLink to="trove">Trove</NavLink>
        <NavLink to="sp">Stability Pool</NavLink>
        <NavLink to="redeem">Redeem</NavLink>
        <NavLink to="liquidate">Liquidate</NavLink>
        <NavLink to="donate">Donate</NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
