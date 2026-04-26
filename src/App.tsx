import { lazy, Suspense } from "react";
import type { ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { WalletProvider } from "./wallet/Provider";

const TradePage = lazy(() => import("./pages/Trade").then((m) => ({ default: m.TradePage })));

const Liquidity = lazy(() => import("./pages/Liquidity").then((m) => ({ default: m.Liquidity })));
const PoolsBody = lazy(() => import("./pages/Pools").then((m) => ({ default: m.PoolsBody })));
const PortfolioBody = lazy(() =>
  import("./pages/Portfolio").then((m) => ({ default: m.PortfolioBody })),
);

const OneShell = lazy(() => import("./pages/One").then((m) => ({ default: m.OneShell })));
const OneOverview = lazy(() =>
  import("./pages/one/Overview").then((m) => ({ default: m.OneOverview })),
);
const OneTrove = lazy(() => import("./pages/one/Trove").then((m) => ({ default: m.OneTrove })));
const OneSp = lazy(() => import("./pages/one/Sp").then((m) => ({ default: m.OneSp })));
const OneRedeem = lazy(() => import("./pages/one/Redeem").then((m) => ({ default: m.OneRedeem })));
const OneLiquidate = lazy(() =>
  import("./pages/one/Liquidate").then((m) => ({ default: m.OneLiquidate })),
);

const AboutPage = lazy(() => import("./pages/About").then((m) => ({ default: m.AboutPage })));

function PageFallback() {
  return <div className="page-loading">Loading…</div>;
}

function wrap(element: ReactElement) {
  return <Suspense fallback={<PageFallback />}>{element}</Suspense>;
}

export function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={wrap(<TradePage />)} />

            <Route path="liquidity" element={wrap(<Liquidity />)}>
              <Route index element={<Navigate to="pools" replace />} />
              <Route path="pools" element={wrap(<PoolsBody />)} />
              <Route path="portfolio" element={wrap(<PortfolioBody />)} />
            </Route>

            <Route path="one" element={wrap(<OneShell />)}>
              <Route index element={wrap(<OneOverview />)} />
              <Route path="trove" element={wrap(<OneTrove />)} />
              <Route path="sp" element={wrap(<OneSp />)} />
              <Route path="redeem" element={wrap(<OneRedeem />)} />
              <Route path="liquidate" element={wrap(<OneLiquidate />)} />
            </Route>

            <Route path="about" element={wrap(<AboutPage />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  );
}
