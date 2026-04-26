import { useEffect, useState } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";

// Fetch the current wallet's total balance for one coin type, refetching
// on every `bump` change. Pass an integer/string that ticks after every
// transaction so the UI re-pulls the new balance.
export function useCoinBalance(coinType: string, bump?: unknown): bigint {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const [bal, setBal] = useState<bigint>(0n);

  useEffect(() => {
    if (!account) {
      setBal(0n);
      return;
    }
    let cancelled = false;
    client
      .getBalance({ owner: account.address, coinType })
      .then((b) => {
        if (!cancelled) setBal(BigInt(b.totalBalance as string));
      })
      .catch(() => {
        if (!cancelled) setBal(0n);
      });
    return () => {
      cancelled = true;
    };
  }, [client, account, coinType, bump]);

  return bal;
}
