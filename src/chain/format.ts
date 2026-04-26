// Pretty-print raw u64-ish numbers as decimal strings without losing
// precision. Avoids Number() on big values.
export function formatUnits(raw: bigint | string | number, decimals: number): string {
  const v = typeof raw === "bigint" ? raw : BigInt(raw);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  if (frac === 0n) return `${neg ? "-" : ""}${whole.toString()}`;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}.${fracStr}`;
}

// Parse a user-typed decimal string into raw u64 units. Throws on
// trailing precision loss.
export function parseUnits(input: string, decimals: number): bigint {
  const trimmed = input.trim();
  if (trimmed === "" || trimmed === ".") return 0n;
  const neg = trimmed.startsWith("-");
  const bare = neg ? trimmed.slice(1) : trimmed;
  const [whole = "0", frac = ""] = bare.split(".");
  if (frac.length > decimals) {
    throw new Error(`too many decimals (max ${decimals})`);
  }
  const padded = frac.padEnd(decimals, "0");
  const v = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
  return neg ? -v : v;
}

// Compact display: 1234.5678 -> "1.23k", 0.000123 -> "0.000123"
export function compactNumber(raw: bigint | string | number, decimals: number): string {
  const human = Number(formatUnits(raw, decimals));
  if (!isFinite(human)) return "—";
  if (human === 0) return "0";
  const abs = Math.abs(human);
  if (abs >= 1e9) return `${(human / 1e9).toFixed(2)}b`;
  if (abs >= 1e6) return `${(human / 1e6).toFixed(2)}m`;
  if (abs >= 1e3) return `${(human / 1e3).toFixed(2)}k`;
  if (abs >= 1) return human.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return human.toPrecision(3);
}

export function shortAddr(addr: string, head = 6, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function bpsToPct(bps: number | bigint): string {
  return `${(Number(bps) / 100).toFixed(2)}%`;
}
