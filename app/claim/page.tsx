"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { baseSepolia } from "wagmi/chains";
import { useAccount, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { decodeProofBundle, type ProofBundle } from "@/lib/membership/proofBundle";
import { chaupalSealsAbi } from "@/lib/contracts/chaupalSeals";
import { ConnectWallet } from "@/components/ConnectWallet";

const DEFAULT_SEALS_ADDRESS = process.env.NEXT_PUBLIC_SEALS_ADDRESS as `0x${string}` | undefined;

type BundleState = { status: "loading" } | { status: "missing" } | { status: "invalid" } | { status: "ok"; bundle: ProofBundle };

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** Reads the proof bundle from the URL fragment; `null` on the server, where there is no hash. */
function useBundleFromFragment(): BundleState {
  const fragment = useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash.replace(/^#/, ""),
    () => null,
  );

  return useMemo<BundleState>(() => {
    if (fragment === null) return { status: "loading" };
    if (!fragment) return { status: "missing" };
    try {
      return { status: "ok", bundle: decodeProofBundle(fragment) };
    } catch {
      return { status: "invalid" };
    }
  }, [fragment]);
}

export default function ClaimPage() {
  const bundleState = useBundleFromFragment();
  const { address: connectedAddress, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: txHash, isPending: isWriting, error: writeError } = useWriteContract();
  const { isLoading: isMining, isSuccess: isMined } = useWaitForTransactionReceipt({ hash: txHash });

  const bundle = bundleState.status === "ok" ? bundleState.bundle : undefined;
  const contractAddress = (bundle?.contractAddress ?? DEFAULT_SEALS_ADDRESS) as `0x${string}` | undefined;
  const groupId = bundle ? BigInt(bundle.groupId) : undefined;

  const { data: existingTokenId } = useReadContract({
    address: contractAddress,
    abi: chaupalSealsAbi,
    functionName: "sealOf",
    args: bundle && connectedAddress ? [groupId!, connectedAddress] : undefined,
    query: { enabled: Boolean(contractAddress && bundle && connectedAddress) },
  });

  const alreadyHeld = useMemo(() => Boolean(existingTokenId && (existingTokenId as bigint) > 0n), [existingTokenId]);

  const walletMismatch =
    isConnected && bundle && connectedAddress && connectedAddress.toLowerCase() !== bundle.member.toLowerCase();

  const wrongChain = isConnected && chainId !== baseSepolia.id;

  function handleClaim() {
    if (!bundle || !contractAddress || !groupId) return;
    writeContract({
      address: contractAddress,
      abi: chaupalSealsAbi,
      functionName: "claim",
      args: [groupId, bundle.proof],
    });
  }

  return (
    <main className="page">
      <h1>Claim your seal</h1>

      {bundleState.status === "loading" ? <p>Reading your claim link…</p> : null}

      {bundleState.status === "missing" ? (
        <p className="notice warn" role="alert">
          This page needs a claim link from your steward, of the form <code>/claim#…</code>. Open
          the link they sent you, or scan the QR code they printed.
        </p>
      ) : null}

      {bundleState.status === "invalid" ? (
        <p className="notice danger" role="alert">
          This claim link could not be read. It may be corrupted or incomplete - ask your steward
          to resend it.
        </p>
      ) : null}

      {bundle ? (
        <div className="stack">
          <div className="card">
            <p>
              This proof is for group <strong>{bundle.groupName ?? bundle.groupId}</strong>,
              member <span className="mono">{bundle.member}</span>.
            </p>
            {!contractAddress ? (
              <p className="notice danger" role="alert">
                No contract address is configured. Set NEXT_PUBLIC_SEALS_ADDRESS, or use a claim
                link that embeds one.
              </p>
            ) : null}
          </div>

          <ConnectWallet />

          {walletMismatch ? (
            <p className="notice warn" role="alert">
              Your connected wallet (<span className="mono">{connectedAddress}</span>) is not the
              address this proof was issued for. Claiming now would revert - connect{" "}
              <span className="mono">{bundle.member}</span> instead.
            </p>
          ) : null}

          {isConnected && alreadyHeld ? (
            <p className="notice success">
              This wallet already holds a seal for this group.{" "}
              <Link href={`/seal/${connectedAddress}`}>View it →</Link>
            </p>
          ) : null}

          {isConnected && !walletMismatch && !alreadyHeld && contractAddress ? (
            <div className="stack">
              {wrongChain ? (
                <button type="button" className="btn" onClick={() => switchChain({ chainId: baseSepolia.id })}>
                  Switch to Base Sepolia
                </button>
              ) : (
                <button type="button" className="btn" disabled={isWriting || isMining} onClick={handleClaim}>
                  {isWriting ? "Confirm in wallet…" : isMining ? "Claiming…" : "Claim my seal"}
                </button>
              )}
              {writeError ? (
                <p className="notice danger" role="alert">
                  {writeError.message}
                </p>
              ) : null}
              {isMined ? (
                <p className="notice success">
                  Seal claimed! <Link href={`/seal/${connectedAddress}`}>View your seals →</Link>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
