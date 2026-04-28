import { useState } from "react";
import type { CoinInfo } from "../chain/coins";

type TokenLike = Pick<CoinInfo, "symbol"> & { iconUrl?: string };

// Token icon renderer with a letter-badge fallback. Whitelisted tokens
// ship bundled SVGs at /tokens/*.svg via `coin.iconUrl`; the user-typed
// custom-coin path renders the symbol's first 1-2 letters as a colored
// dot. <img> errors fall through to the same letter badge.
export function TokenIcon({
  token,
  size = 18,
  className = "",
}: {
  token: TokenLike;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showFallback = !token.iconUrl || failed;

  if (showFallback) {
    const letter =
      token.symbol.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "?";
    return (
      <span
        className={`token-icon token-icon-fallback ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.48),
          lineHeight: `${size}px`,
        }}
        title={token.symbol}
      >
        {letter}
      </span>
    );
  }

  return (
    <img
      className={`token-icon ${className}`}
      src={token.iconUrl}
      alt={token.symbol}
      title={token.symbol}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
