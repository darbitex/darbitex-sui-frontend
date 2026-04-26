import { NavLink, Outlet } from "react-router-dom";

export function Liquidity() {
  return (
    <section className="page">
      <h1 className="page-title">Liquidity</h1>
      <nav className="subnav">
        <NavLink to="pools" end>Pools</NavLink>
        <NavLink to="portfolio">Portfolio</NavLink>
        <NavLink to="locked">Locked</NavLink>
        <NavLink to="staking">Staking</NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
