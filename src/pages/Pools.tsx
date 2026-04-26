import { useEffect, useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import {
  buildAddLiquidityTx,
  buildCreatePoolTx,
  listPools,
  type PoolView,
} from "../chain/darbitex";
import { coinLabel, KNOWN_COINS, sortPair } from "../chain/coins";
import { compactNumber, parseUnits, shortAddr } from "../chain/format";

const KNOWN_TYPES = Object.keys(KNOWN_COINS);

export function PoolsBody() {
  const client = useSuiClient();
  const [pools, setPools] = useState<PoolView[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expandedPool, setExpandedPool] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const ps = await listPools(client);
      setPools(ps);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listPools(client)
      .then((ps) => {
        if (!cancelled) setPools(ps);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <div>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn-ghost" onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancel" : "+ Create pool"}
        </button>
      </div>

      {creating && <CreatePoolForm onCreated={() => { setCreating(false); refresh(); }} />}

      {loading && <div className="page-loading">Loading pools…</div>}

      {!loading && pools.length === 0 && !creating && (
        <div className="empty-state">
          <p>No pools yet.</p>
          <p className="dim">
            The factory is sealed and permissionless — anyone can be first.
            Click <strong>+ Create pool</strong> above. To seed a SUI/ONE
            pool, mint some ONE first from the One → Trove tab.
          </p>
        </div>
      )}

      {!loading && pools.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Pair</th>
              <th>Reserves</th>
              <th>LP supply</th>
              <th>Pool ID</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pools.map((p) => {
              const isExpanded = expandedPool === p.poolId;
              return (
                <>
                  <tr key={p.poolId}>
                    <td>
                      {coinLabel(p.typeA)} / {coinLabel(p.typeB)}
                    </td>
                    <td>
                      {compactNumber(p.reserveA, KNOWN_COINS[p.typeA]?.decimals ?? 9)} /{" "}
                      {compactNumber(p.reserveB, KNOWN_COINS[p.typeB]?.decimals ?? 9)}
                    </td>
                    <td>{compactNumber(p.lpSupply, 9)}</td>
                    <td>
                      <a
                        href={`https://suiscan.xyz/mainnet/object/${p.poolId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {shortAddr(p.poolId)}
                      </a>
                    </td>
                    <td>
                      <button
                        className="btn-ghost"
                        onClick={() =>
                          setExpandedPool(isExpanded ? null : p.poolId)
                        }
                      >
                        {isExpanded ? "Close" : "Add liquidity"}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${p.poolId}-add`}>
                      <td colSpan={5}>
                        <AddLiquidityForm
                          pool={p}
                          onAdded={() => { setExpandedPool(null); refresh(); }}
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CreatePoolForm({ onCreated }: { onCreated: () => void }) {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [typeA, setTypeA] = useState(KNOWN_TYPES[0]);
  const [typeB, setTypeB] = useState(KNOWN_TYPES[1] ?? KNOWN_TYPES[0]);
  const [amountAStr, setAmountAStr] = useState("");
  const [amountBStr, setAmountBStr] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Canonical sort — Move's assert_sorted enforces strict type_a < type_b.
  const [sortedA, sortedB] = useMemo(() => sortPair(typeA, typeB), [typeA, typeB]);
  const flipped = sortedA !== typeA;

  const decimalsA = KNOWN_COINS[typeA]?.decimals ?? 9;
  const decimalsB = KNOWN_COINS[typeB]?.decimals ?? 9;

  async function onSubmit() {
    if (!account) return;
    if (typeA === typeB) {
      setStatusMsg("Pick two different coin types.");
      return;
    }
    setStatusMsg(null);
    try {
      const rawA = parseUnits(amountAStr || "0", decimalsA);
      const rawB = parseUnits(amountBStr || "0", decimalsB);
      if (rawA === 0n || rawB === 0n) {
        setStatusMsg("Both seed amounts must be > 0.");
        return;
      }
      const args = flipped
        ? {
            typeA: sortedA,
            typeB: sortedB,
            amountA: rawB,
            amountB: rawA,
            sender: account.address,
          }
        : {
            typeA: sortedA,
            typeB: sortedB,
            amountA: rawA,
            amountB: rawB,
            sender: account.address,
          };
      const tx = await buildCreatePoolTx(client, args);
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Created — ${res.digest.slice(0, 10)}…`);
      onCreated();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  if (!account) {
    return <div className="empty-state">Connect a wallet to create a pool.</div>;
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h2>Create canonical pool</h2>
      <p className="dim">
        Permissionless. Aborts if a pool for the pair already exists. Initial
        reserves set the starting ratio (price discovery).
      </p>

      <div className="grid-2">
        <div>
          <label className="field-label">Coin A</label>
          <select
            className="select"
            value={typeA}
            onChange={(e) => setTypeA(e.target.value)}
          >
            {KNOWN_TYPES.map((t) => (
              <option key={t} value={t}>
                {coinLabel(t)}
              </option>
            ))}
          </select>
          <div className="amount-row">
            <input
              className="input"
              value={amountAStr}
              onChange={(e) => setAmountAStr(e.target.value)}
              placeholder="0.0"
              inputMode="decimal"
            />
            <span className="amount-sym">{coinLabel(typeA)}</span>
          </div>
        </div>

        <div>
          <label className="field-label">Coin B</label>
          <select
            className="select"
            value={typeB}
            onChange={(e) => setTypeB(e.target.value)}
          >
            {KNOWN_TYPES.map((t) => (
              <option key={t} value={t}>
                {coinLabel(t)}
              </option>
            ))}
          </select>
          <div className="amount-row">
            <input
              className="input"
              value={amountBStr}
              onChange={(e) => setAmountBStr(e.target.value)}
              placeholder="0.0"
              inputMode="decimal"
            />
            <span className="amount-sym">{coinLabel(typeB)}</span>
          </div>
        </div>
      </div>

      {flipped && (
        <p className="dim">
          Note: Move stores the pair sorted as ({coinLabel(sortedA)},{" "}
          {coinLabel(sortedB)}). Your inputs will be sent in canonical order.
        </p>
      )}

      <button
        className="btn-primary"
        onClick={onSubmit}
        disabled={isPending}
        style={{ marginTop: 12 }}
      >
        {isPending ? "Submitting…" : "Create pool"}
      </button>
      {statusMsg && <div className="status">{statusMsg}</div>}
    </div>
  );
}

function AddLiquidityForm({
  pool,
  onAdded,
}: {
  pool: PoolView;
  onAdded: () => void;
}) {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [amountAStr, setAmountAStr] = useState("");
  const [amountBStr, setAmountBStr] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const decimalsA = KNOWN_COINS[pool.typeA]?.decimals ?? 9;
  const decimalsB = KNOWN_COINS[pool.typeB]?.decimals ?? 9;

  // Optimal-pair hint based on current reserves (matches Move math).
  const hintB = useMemo(() => {
    try {
      const rawA = parseUnits(amountAStr || "0", decimalsA);
      if (rawA === 0n || pool.reserveA === 0n) return "";
      const opt = (rawA * pool.reserveB) / pool.reserveA;
      return formatRaw(opt, decimalsB);
    } catch {
      return "";
    }
  }, [amountAStr, pool.reserveA, pool.reserveB, decimalsA, decimalsB]);

  async function onSubmit() {
    if (!account) return;
    setStatusMsg(null);
    try {
      const rawA = parseUnits(amountAStr || "0", decimalsA);
      const rawB = parseUnits(amountBStr || "0", decimalsB);
      if (rawA === 0n || rawB === 0n) {
        setStatusMsg("Both amounts must be > 0.");
        return;
      }
      const tx = await buildAddLiquidityTx(client, {
        pool,
        amountA: rawA,
        amountB: rawB,
        minShares: 0n,
        deadlineMs: BigInt(Date.now() + 60_000),
        sender: account.address,
      });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Added — ${res.digest.slice(0, 10)}…`);
      onAdded();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  if (!account) return <div className="dim">Connect wallet to add liquidity.</div>;

  return (
    <div style={{ padding: "12px 0" }}>
      <div className="grid-2">
        <div>
          <label className="field-label">{coinLabel(pool.typeA)}</label>
          <input
            className="input"
            value={amountAStr}
            onChange={(e) => setAmountAStr(e.target.value)}
            placeholder="0.0"
            inputMode="decimal"
          />
        </div>
        <div>
          <label className="field-label">{coinLabel(pool.typeB)}</label>
          <input
            className="input"
            value={amountBStr}
            onChange={(e) => setAmountBStr(e.target.value)}
            placeholder={hintB || "0.0"}
            inputMode="decimal"
          />
          {hintB && <span className="dim">optimal ≈ {hintB}</span>}
        </div>
      </div>
      <button
        className="btn-primary"
        onClick={onSubmit}
        disabled={isPending}
        style={{ marginTop: 12 }}
      >
        {isPending ? "Submitting…" : "Add liquidity"}
      </button>
      {statusMsg && <div className="status">{statusMsg}</div>}
    </div>
  );
}

function formatRaw(raw: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}
