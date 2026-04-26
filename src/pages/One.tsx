import { NavLink, Outlet } from "react-router-dom";

export function OneShell() {
  return (
    <section className="page">
      <h1 className="page-title">ONE</h1>
      <p className="page-subtitle">
        Immutable Liquity-V1 CDP. SUI collateral, Pyth oracle, 200% MCR, 1
        ONE min debt.
      </p>
      <nav className="subnav">
        <NavLink to="." end>Overview</NavLink>
        <NavLink to="trove">Trove</NavLink>
        <NavLink to="sp">Stability Pool</NavLink>
        <NavLink to="redeem">Redeem</NavLink>
        <NavLink to="liquidate">Liquidate</NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
