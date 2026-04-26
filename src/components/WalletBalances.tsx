import { useEffect, useState } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { coinLabel, KNOWN_COINS } from "../chain/coins";
import { formatUnits } from "../chain/format";

interface Props {
  // Coin types to display. Defaults to every entry in KNOWN_COINS.
  types?: string[];
}

// Compact horizontal bar showing the wallet's balances for the chosen
// coin types. Hides when no wallet is connected. Refetches whenever the
// active account changes.
export function WalletBalances({ types }: Props) {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const list = types ?? Object.keys(KNOWN_COINS);
  const [balances, setBalances] = useState<Record<string, bigint>>({});

  useEffect(() => {
    if (!account) {
      setBalances({});
      return;
    }
    let cancelled = false;
    Promise.all(
      list.map((t) =>
        client
          .getBalance({ owner: account.address, coinType: t })
          .then((b) => [t, BigInt(b.totalBalance as string)] as const)
          .catch(() => [t, 0n] as const),
      ),
    ).then((entries) => {
      if (!cancelled) setBalances(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
    // `list` is rebuilt every render but its contents are stable per Props,
    // so we depend on its joined identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, account, list.join(",")]);

  if (!account) return null;

  return (
    <div className="balance-bar">
      {list.map((t) => {
        const meta = KNOWN_COINS[t];
        if (!meta) return null;
        return (
          <div key={t} className="balance-chip">
            <span className="dim">{coinLabel(t)}</span>{" "}
            <span>{formatUnits(balances[t] ?? 0n, meta.decimals)}</span>
          </div>
        );
      })}
    </div>
  );
}
