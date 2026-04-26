import { ConnectButton as DappKitConnectButton } from "@mysten/dapp-kit";

export function ConnectButton() {
  return <DappKitConnectButton connectText="Connect" className="wallet-btn" />;
}
