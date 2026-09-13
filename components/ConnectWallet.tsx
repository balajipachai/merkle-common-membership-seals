"use client";

import { baseSepolia } from "wagmi/chains";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { useVisibleConnectors } from "@/lib/wagmi/useVisibleConnectors";

export function ConnectWallet() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, isPending: isConnecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const connectors = useVisibleConnectors();

  if (isConnected && address) {
    const wrongChain = chainId !== baseSepolia.id;
    return (
      <div className="row" role="status">
        <span className="mono">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        {wrongChain ? (
          <button
            type="button"
            className="btn secondary"
            disabled={isSwitching}
            onClick={() => switchChain({ chainId: baseSepolia.id })}
          >
            {isSwitching ? "Switching…" : "Switch to Base Sepolia"}
          </button>
        ) : (
          <span className="badge success">Base Sepolia</span>
        )}
        <button type="button" className="btn secondary" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="row">
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            type="button"
            className="btn"
            disabled={isConnecting}
            onClick={() => connect({ connector })}
          >
            Connect {connector.name}
          </button>
        ))}
      </div>
      {connectError ? (
        <p className="notice danger" role="alert">
          {connectError.message}
        </p>
      ) : null}
    </div>
  );
}
