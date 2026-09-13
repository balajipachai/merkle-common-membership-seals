/**
 * Reads the steward-facing "which groups does the app show" curation list. Group registration
 * on-chain is fully permissionless (anyone can call `registerGroup`), so this env var is what
 * keeps a stranger's opportunistically-registered group from ever appearing in Chaupal's own
 * directory pages - it is a display allowlist, not an access-control mechanism. A steward whose
 * group id isn't listed here can still manage it directly at `/steward?group=<id>`.
 */
export function getCuratedGroupIds(): bigint[] {
  const raw = process.env.NEXT_PUBLIC_CHAUPAL_GROUP_IDS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => BigInt(s));
}
