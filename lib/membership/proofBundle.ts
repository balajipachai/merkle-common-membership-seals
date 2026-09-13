/**
 * Encodes/decodes the per-member claim bundle carried entirely in the URL fragment
 * (`/claim#<base64url>`), which browsers never send to a server, so a member's proof and address
 * never traverse any network on its way from steward to member.
 */

export interface ProofBundle {
  /** Chaupal group id, as a decimal string (bigint-safe across JSON). */
  groupId: string;
  /** The address this proof was computed for. Claiming reverts unless msg.sender matches. */
  member: `0x${string}`;
  proof: `0x${string}`[];
  groupName?: string;
  contractAddress?: `0x${string}`;
  chainId?: number;
  /** The root version the proof was generated against, shown for staleness context in the UI. */
  rootVersion?: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = typeof Buffer !== "undefined" ? Buffer.from(bytes).toString("base64") : btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(padded, "base64"));
  }
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeProofBundle(bundle: ProofBundle): string {
  const json = JSON.stringify(bundle);
  const bytes = new TextEncoder().encode(json);
  return base64UrlEncode(bytes);
}

export function decodeProofBundle(encoded: string): ProofBundle {
  const bytes = base64UrlDecode(encoded);
  const json = new TextDecoder().decode(bytes);
  const parsed: unknown = JSON.parse(json);

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Malformed proof bundle");
  }
  const candidate = parsed as Partial<ProofBundle>;
  if (
    typeof candidate.groupId !== "string" ||
    typeof candidate.member !== "string" ||
    !Array.isArray(candidate.proof) ||
    !candidate.proof.every((p) => typeof p === "string")
  ) {
    throw new Error("Malformed proof bundle");
  }

  return candidate as ProofBundle;
}

/** Builds the shareable claim URL for a bundle, given the app's own claim page URL. */
export function buildClaimUrl(baseClaimUrl: string, bundle: ProofBundle): string {
  const fragment = encodeProofBundle(bundle);
  return `${baseClaimUrl}#${fragment}`;
}
