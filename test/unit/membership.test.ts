import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import {
  LEAF_ENCODING,
  buildClaimUrl,
  buildTree,
  computeLeaf,
  decodeProofBundle,
  diffMembers,
  encodeProofBundle,
  parseMembersCsv,
  proofForAddress,
} from "../../lib/membership/index";

const A = getAddress("0x1111111111111111111111111111111111111111");
const B = getAddress("0x2222222222222222222222222222222222222222");
const C = getAddress("0x3333333333333333333333333333333333333333");

const member = (address: `0x${string}`) => ({ name: "", phone: "", address });
const encoding = LEAF_ENCODING as unknown as string[];

describe("leaf", () => {
  it("matches the StandardMerkleTree leaf hash", () => {
    const tree = buildTree(1n, [member(A), member(B)]);
    expect(computeLeaf(1n, A)).toBe(tree.leafHash([1n, A]));
  });

  it("differs across groups for the same member", () => {
    expect(computeLeaf(1n, A)).not.toBe(computeLeaf(2n, A));
  });
});

describe("tree", () => {
  it("issues a proof that verifies for the member's own group only", () => {
    const tree = buildTree(1n, [member(A), member(B), member(C)]);
    const proof = proofForAddress(tree, 1n, A);

    expect(StandardMerkleTree.verify(tree.root, encoding, [1n, A], proof)).toBe(true);
    // Root-copy attack: the same root and proof must not verify a leaf for another group.
    expect(StandardMerkleTree.verify(tree.root, encoding, [2n, A], proof)).toBe(false);
  });

  it("refuses to issue a proof for a non-member", () => {
    const tree = buildTree(1n, [member(A)]);
    expect(() => proofForAddress(tree, 1n, B)).toThrow(/not a member/);
  });
});

describe("parseMembersCsv", () => {
  it("parses rows with a header and checksums addresses", () => {
    const csv = `name,phone,address,notes\nAsha,123,${A.toLowerCase()},\n"Ravi, Jr.",456,${B},late joiner`;
    const records = parseMembersCsv(csv);
    expect(records.map((r) => r.address)).toEqual([A, B]);
    expect(records[1]).toMatchObject({ name: "Ravi, Jr.", notes: "late joiner" });
  });

  it("rejects duplicate addresses regardless of case", () => {
    expect(() => parseMembersCsv(`x,1,${A}\ny,2,${A.toLowerCase()}`)).toThrow(/duplicate/);
  });

  it("rejects an invalid address", () => {
    expect(() => parseMembersCsv("x,1,0x1234")).toThrow(/not a valid address/);
  });
});

describe("proof bundle", () => {
  const bundle = { groupId: "1", member: A, proof: [computeLeaf(1n, B)], groupName: "Sangat" };

  it("round-trips through encode/decode", () => {
    expect(decodeProofBundle(encodeProofBundle(bundle))).toEqual(bundle);
  });

  it("carries the bundle in the URL fragment, which browsers never send to a server", () => {
    const url = new URL(buildClaimUrl("https://example.org/claim", bundle));
    expect(url.search).toBe("");
    expect(decodeProofBundle(url.hash.slice(1))).toEqual(bundle);
  });

  it("rejects garbage", () => {
    expect(() => decodeProofBundle("not-a-bundle")).toThrow();
  });
});

describe("diffMembers", () => {
  it("finds joiners and leavers, ignoring address case", () => {
    expect(diffMembers([A, B], [B.toLowerCase() as `0x${string}`, C])).toEqual({ joiners: [C], leavers: [A] });
  });
});
