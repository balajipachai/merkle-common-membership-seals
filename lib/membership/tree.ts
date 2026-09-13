import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { getAddress, isAddress } from "viem";
import { LEAF_ENCODING, type MemberRecord, type MemberValue, toLeafValues } from "./leaf";

export type ChaupalMerkleTree = StandardMerkleTree<MemberValue>;

/** Parses the steward's `name,phone,address,notes` CSV. Only `address` ever enters a leaf. */
export function parseMembersCsv(csvText: string): MemberRecord[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("Empty member list");
  }

  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const expected = ["name", "phone", "address", "notes"];
  const hasHeader = expected.every((col, i) => header[i] === col);
  const rows = hasHeader ? lines.slice(1) : lines;

  const records: MemberRecord[] = [];
  const seen = new Set<string>();

  rows.forEach((line, idx) => {
    const rowNumber = idx + (hasHeader ? 2 : 1);
    const parts = splitCsvLine(line);
    const [name = "", phone = "", rawAddress = "", notes = ""] = parts;

    if (!isAddress(rawAddress)) {
      throw new Error(`Row ${rowNumber}: "${rawAddress}" is not a valid address`);
    }
    const address = getAddress(rawAddress); // checksums, and normalizes case for dedupe

    if (seen.has(address)) {
      throw new Error(`Row ${rowNumber}: duplicate address ${address}`);
    }
    seen.add(address);

    records.push({ name, phone, address, notes: notes || undefined });
  });

  if (records.length === 0) {
    throw new Error("No member rows found after the header");
  }

  return records;
}

function splitCsvLine(line: string): string[] {
  // Minimal CSV splitting sufficient for name,phone,address,notes with optional quoting.
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      result.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result.map((s) => s.trim());
}

/** Builds a `StandardMerkleTree` for `groupId` over the given member records. */
export function buildTree(groupId: bigint, members: MemberRecord[]): ChaupalMerkleTree {
  const addresses = members.map((m) => m.address);
  const values = toLeafValues(groupId, addresses);
  return StandardMerkleTree.of(values, LEAF_ENCODING as unknown as string[]);
}

/** Serializes a tree to the JSON shape written to `cupboard/tree.json` (steward-private). */
export function dumpTree(tree: ChaupalMerkleTree) {
  return tree.dump();
}

/** Rehydrates a tree previously written by `dumpTree`. */
export function loadTree(dumped: ReturnType<typeof dumpTree>): ChaupalMerkleTree {
  return StandardMerkleTree.load(dumped as never);
}

/** Returns the Merkle proof for `groupId`'s leaf belonging to `address`. */
export function proofForAddress(tree: ChaupalMerkleTree, groupId: bigint, address: `0x${string}`): `0x${string}`[] {
  const checksummed = getAddress(address);
  for (const [index, value] of tree.entries()) {
    const [leafGroupId, leafAddress] = value;
    if (leafGroupId === groupId && getAddress(leafAddress) === checksummed) {
      return tree.getProof(index) as `0x${string}`[];
    }
  }
  throw new Error(`Address ${checksummed} is not a member of group ${groupId} in this tree`);
}

/** All addresses present in a tree (for diffing and export). */
export function addressesInTree(tree: ChaupalMerkleTree): `0x${string}`[] {
  const out: `0x${string}`[] = [];
  for (const [, value] of tree.entries()) {
    out.push(getAddress(value[1]) as `0x${string}`);
  }
  return out;
}

export interface TreeDiff {
  joiners: `0x${string}`[];
  leavers: `0x${string}`[];
}

/**
 * Diffs a previous member list against a new one. `leavers` are addresses present before but
 * absent now; the steward page further intersects these with on-chain `sealOf` to know which
 * leavers actually hold a seal worth burning.
 */
export function diffMembers(previous: readonly `0x${string}`[], next: readonly `0x${string}`[]): TreeDiff {
  const prevSet = new Set(previous.map((a) => getAddress(a)));
  const nextSet = new Set(next.map((a) => getAddress(a)));

  const joiners = [...nextSet].filter((a) => !prevSet.has(a)) as `0x${string}`[];
  const leavers = [...prevSet].filter((a) => !nextSet.has(a)) as `0x${string}`[];

  return { joiners, leavers };
}
