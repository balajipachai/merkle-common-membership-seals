"use client";

import { useMemo } from "react";
import { useConnectors } from "wagmi";

/**
 * Returns the connector list with the generic `injected` connector hidden whenever at least one
 * wallet has been discovered via EIP-6963 (`window.ethereum#eip6963:announceProvider`). wagmi
 * auto-registers a distinct connector per announced provider (id derived from its rdns, e.g.
 * `io.metamask`), so once those exist the generic `injected` entry is redundant and confusing -
 * most often it duplicates whichever EIP-6963 wallet is currently window.ethereum.
 */
export function useVisibleConnectors() {
  const connectors = useConnectors();

  return useMemo(() => {
    const hasEip6963 = connectors.some((c) => c.id !== "injected" && c.type === "injected");
    if (!hasEip6963) return connectors;
    return connectors.filter((c) => c.id !== "injected");
  }, [connectors]);
}
