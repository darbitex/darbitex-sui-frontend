import { useEffect, useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import {
  buildAddLiquidityTx,
  buildClaimFeesTx,
  buildCreatePoolTx,
  buildRemoveLiquidityTx,
  listPools,
  listUserPositions,
  type PoolView,
} from "../chain/darbitex";
import { coinLabel, KNOWN_COINS, sortPair } from "../chain/coins";
import { compactNumber, formatUnits, parseUnits, shortAddr } from "../chain/format";

const KNOWN_TYPES = Object.keys(KNOWN_COINS);

interface UserPosition {
  id: string;
  poolId: string;
  shares: bigint;
  typeA: string;
  typeB: string;
}

type RowMode = "add" | "remove";
interface ExpandedRow {
  poolId: string;
  mode: RowMode;
}

export function PoolsBody() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const [pools, setPools] = useState<PoolView[]>([]);
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<ExpandedRow | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [ps, ups] = await Promise.all([
        listPools(client),
        account ? listUserPositions(client, account.address) : Promise.resolve([]),
      ]);
      setPools(ps);
      setPositions(ups);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listPools(client),
      account ? listUserPositions(client, account.address) : Promise.resolve([]),
    ])
      .then(([ps, ups]) => {
        if (cancelled) return;
        setPools(ps);
        setPositions(ups);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, account]);

  function positionsForPool(poolId: string): UserPosition[] {
    return positions.filter((p) => p.poolId === poolId);
  }

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
              const userPositions = positionsForPool(p.poolId);
              const hasPosition = userPositions.length > 0;
              const isExpanded = expanded?.poolId === p.poolId;
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
                      <div className="row" style={{ gap: 4, margin: 0 }}>
                        <button
                          className="btn-ghost"
                          style={{ padding: "6px 10px", fontSize: 11 }}
                          onClick={() =>
                            setExpanded(
                              isExpanded && expanded?.mode === "add"
                                ? null
                                : { poolId: p.poolId, mode: "add" },
                            )
                          }
                        >
                          {isExpanded && expanded?.mode === "add" ? "Close" : "Add"}
                        </button>
                        {hasPosition && (
                          <button
                            className="btn-ghost"
                            style={{ padding: "6px 10px", fontSize: 11 }}
                            onClick={() =>
                              setExpanded(
                                isExpanded && expanded?.mode === "remove"
                                  ? null
                                  : { poolId: p.poolId, mode: "remove" },
                              )
                            }
                          >
                            {isExpanded && expanded?.mode === "remove"
                              ? "Close"
                              : "Remove"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && expanded?.mode === "add" && (
                    <tr key={`${p.poolId}-add`}>
                      <td colSpan={5}>
                        <AddLiquidityForm
                          pool={p}
                          onAdded={() => { setExpanded(null); refresh(); }}
                        />
                      </td>
                    </tr>
                  )}
                  {isExpanded && expanded?.mode === "remove" && hasPosition && (
                    <tr key={`${p.poolId}-remove`}>
                      <td colSpan={5}>
                        <RemoveLiquidityPanel
                          pool={p}
                          positions={userPositions}
                          onChanged={() => { setExpanded(null); refresh(); }}
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
  const [balA, setBalA] = useState<bigint>(0n);
  const [balB, setBalB] = useState<bigint>(0n);

  const decimalsA = KNOWN_COINS[pool.typeA]?.decimals ?? 9;
  const decimalsB = KNOWN_COINS[pool.typeB]?.decimals ?? 9;

  // Live wallet balances per leg.
  useEffect(() => {
    if (!account) {
      setBalA(0n);
      setBalB(0n);
      return;
    }
    let cancelled = false;
    Promise.all([
      client.getBalance({ owner: account.address, coinType: pool.typeA }),
      client.getBalance({ owner: account.address, coinType: pool.typeB }),
    ]).then(([a, b]) => {
      if (!cancelled) {
        setBalA(BigInt(a.totalBalance as string));
        setBalB(BigInt(b.totalBalance as string));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client, account, pool.typeA, pool.typeB, statusMsg]);

  // Bidirectional auto-fill: editing A computes optimal B from reserves;
  // editing B computes optimal A. Matches the ratio Move's add_liquidity
  // would actually accept (`amount_b_optimal = amount_a * reserve_b / reserve_a`).
  function onChangeA(v: string) {
    setAmountAStr(v);
    if (pool.reserveA === 0n || pool.reserveB === 0n) return;
    try {
      const rawA = parseUnits(v || "0", decimalsA);
      if (rawA === 0n) {
        setAmountBStr("");
        return;
      }
      const optB = (rawA * pool.reserveB) / pool.reserveA;
      setAmountBStr(formatUnits(optB, decimalsB));
    } catch {
      /* invalid input — leave B alone */
    }
  }

  function onChangeB(v: string) {
    setAmountBStr(v);
    if (pool.reserveA === 0n || pool.reserveB === 0n) return;
    try {
      const rawB = parseUnits(v || "0", decimalsB);
      if (rawB === 0n) {
        setAmountAStr("");
        return;
      }
      const optA = (rawB * pool.reserveA) / pool.reserveB;
      setAmountAStr(formatUnits(optA, decimalsA));
    } catch {
      /* invalid input — leave A alone */
    }
  }

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
          <div className="row" style={{ justifyContent: "space-between" }}>
            <label className="field-label" style={{ margin: 0 }}>{coinLabel(pool.typeA)}</label>
            <span className="dim">bal: {formatUnits(balA, decimalsA)}</span>
          </div>
          <div className="amount-row">
            <input
              className="input"
              value={amountAStr}
              onChange={(e) => onChangeA(e.target.value)}
              placeholder="0.0"
              inputMode="decimal"
            />
            {balA > 0n && (
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: "4px 10px", fontSize: 11 }}
                onClick={() => onChangeA(formatUnits(balA, decimalsA))}
              >
                max
              </button>
            )}
          </div>
        </div>
        <div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <label className="field-label" style={{ margin: 0 }}>{coinLabel(pool.typeB)}</label>
            <span className="dim">bal: {formatUnits(balB, decimalsB)}</span>
          </div>
          <div className="amount-row">
            <input
              className="input"
              value={amountBStr}
              onChange={(e) => onChangeB(e.target.value)}
              placeholder="0.0"
              inputMode="decimal"
            />
            {balB > 0n && (
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: "4px 10px", fontSize: 11 }}
                onClick={() => onChangeB(formatUnits(balB, decimalsB))}
              >
                max
              </button>
            )}
          </div>
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

function RemoveLiquidityPanel({
  pool,
  positions,
  onChanged,
}: {
  pool: PoolView;
  positions: UserPosition[];
  onChanged: () => void;
}) {
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  async function onClaim(positionId: string) {
    setStatusMsg(null);
    try {
      const tx = buildClaimFeesTx(pool, positionId, BigInt(Date.now() + 60_000));
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Claimed — ${res.digest.slice(0, 10)}…`);
      onChanged();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  async function onRemove(positionId: string) {
    setStatusMsg(null);
    try {
      const tx = buildRemoveLiquidityTx({
        pool,
        positionId,
        minA: 0n,
        minB: 0n,
        deadlineMs: BigInt(Date.now() + 60_000),
      });
      const res = await signAndExecute({ transaction: tx });
      setStatusMsg(`Removed — ${res.digest.slice(0, 10)}…`);
      onChanged();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  return (
    <div style={{ padding: "12px 0" }}>
      <p className="dim">
        Move's <code>remove_liquidity_entry</code> burns the entire LP
        position by value — partial removal is not supported. To keep some
        liquidity, withdraw all and re-add only the part you want to keep.
      </p>
      {positions.map((pos) => (
        <div
          key={pos.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            padding: "8px 0",
            borderTop: "1px dashed #1a1a1a",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="dim" style={{ fontSize: 11 }}>position</div>
            <code style={{ color: "#ff8800", fontSize: 11 }}>
              {pos.id.slice(0, 10)}…{pos.id.slice(-6)}
            </code>
            <div className="dim" style={{ fontSize: 11 }}>
              {pos.shares.toString()} shares
            </div>
          </div>
          <div className="row" style={{ gap: 6, margin: 0 }}>
            <button
              className="btn-ghost"
              style={{ padding: "6px 10px", fontSize: 11 }}
              disabled={isPending}
              onClick={() => onClaim(pos.id)}
            >
              Claim fees
            </button>
            <button
              className="btn-ghost"
              style={{ padding: "6px 10px", fontSize: 11 }}
              disabled={isPending}
              onClick={() => onRemove(pos.id)}
            >
              Remove 100%
            </button>
          </div>
        </div>
      ))}
      {statusMsg && <div className="status">{statusMsg}</div>}
    </div>
  );
}
