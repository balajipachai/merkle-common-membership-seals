/**
 * The single off-chain leaf definition for Chaupal membership seals.
 *
 * This MUST agree, byte-for-byte, with `ChaupalSeals._leafFor` in
 * `contracts/src/ChaupalSeals.sol`:
 *
 *   keccak256(bytes.concat(keccak256(abi.encode(groupId, member))))
 *
 * `@openzeppelin/merkle-tree`'s `StandardMerkleTree.of(values, LEAF_ENCODING)` computes exactly
 * this double-hash internally for each value, so as long as every value passed to `.of()` is
 * `[groupId, member]` in that order with `LEAF_ENCODING` below, the resulting tree's leaves match
 * the contract's `leafFor(groupId, member)` exactly. `test/e2e/leaf-parity.test.ts` asserts this
 * against a live contract over anvil.
 */
import { encodeAbiParameters, keccak256 } from "viem";

/** ABI types for the leaf preimage, in order: (uint256 groupId, address member). */
export const LEAF_ENCODING = ["uint256", "address"] as const;

export type MemberValue = [groupId: bigint, member: `0x${string}`];

/**
 * A single member row as read from a steward's CSV, before it is narrowed down to the
 * `[groupId, address]` tuple that actually enters the tree. Only `address` ever enters the leaf;
 * `name`/`phone` never leave the steward's machine.
 */
export interface MemberRecord {
  name: string;
  phone: string;
  address: `0x${string}`;
  notes?: string;
}

/**
 * Builds the `values` array `StandardMerkleTree.of` expects: one `[groupId, address]` tuple per
 * member, in the same order as `members`.
 */
export function toLeafValues(groupId: bigint, addresses: readonly `0x${string}`[]): MemberValue[] {
  return addresses.map((address) => [groupId, address] as MemberValue);
}

/**
 * Computes the exact same double-hash `StandardMerkleTree.of` computes per leaf, directly from
 * `(groupId, member)`, without needing a tree. Used to assert byte-for-byte parity against the
 * contract's `leafFor(groupId, member)` view - this function and `ChaupalSeals._leafFor` must
 * always compute the identical value.
 */
export function computeLeaf(groupId: bigint, member: `0x${string}`): `0x${string}` {
  const inner = keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "address" }], [groupId, member]));
  return keccak256(inner);
}
