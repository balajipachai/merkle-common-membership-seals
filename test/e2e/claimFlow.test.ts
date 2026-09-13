import { describe, expect, it } from "vitest";
import { buildTree, computeLeaf, decodeProofBundle, encodeProofBundle, proofForAddress } from "../../lib/membership/index.js";
import { claim, createFundedAccount, leafForOnChain, registerGroup, sealOf, updateRoot } from "./helpers.js";

/**
 * Full steward -> member lifecycle against real anvil bytecode: register a group, publish a
 * Merkle root built by the app's own tree code, claim with an app-generated proof (round-tripped
 * through the QR/URL proof bundle), and revoke a leaver on the next root update.
 */
describe("claim flow (e2e)", () => {
  it("off-chain leaf encoding matches the contract's leafFor byte-for-byte", async () => {
    const { account } = await createFundedAccount();
    expect(await leafForOnChain(7n, account.address)).toBe(computeLeaf(7n, account.address));
  });

  it("steward publishes a root, members claim, leavers are revoked", async () => {
    const steward = await createFundedAccount();
    const alice = await createFundedAccount();
    const bob = await createFundedAccount();
    const outsider = await createFundedAccount();

    const groupId = await registerGroup(steward.walletClient, "Chaupal E2E");

    const members = [alice, bob].map((m, i) => ({ name: `m${i}`, phone: "", address: m.account.address }));
    const tree = buildTree(groupId, members);
    await updateRoot(steward.walletClient, groupId, tree.root as `0x${string}`, []);

    // Alice claims through a proof that survived the claim-link encoding.
    const proof = proofForAddress(tree, groupId, alice.account.address);
    const bundle = decodeProofBundle(
      encodeProofBundle({ groupId: groupId.toString(), member: alice.account.address, proof }),
    );
    expect(BigInt(bundle.groupId)).toBe(groupId);
    const receipt = await claim(alice.walletClient, groupId, bundle.proof);
    expect(receipt.status).toBe("success");
    expect(await sealOf(groupId, alice.account.address)).toBeGreaterThan(0n);

    // Double claim and a stranger's claim both revert.
    await expect(claim(alice.walletClient, groupId, proof)).rejects.toThrow();
    await expect(claim(outsider.walletClient, groupId, proof)).rejects.toThrow();

    // Bob claims, then leaves: the steward's next root drops him and revokes his seal.
    await claim(bob.walletClient, groupId, proofForAddress(tree, groupId, bob.account.address));
    expect(await sealOf(groupId, bob.account.address)).toBeGreaterThan(0n);

    const nextTree = buildTree(groupId, [members[0]!]);
    await updateRoot(steward.walletClient, groupId, nextTree.root as `0x${string}`, [bob.account.address]);
    expect(await sealOf(groupId, bob.account.address)).toBe(0n);
    expect(await sealOf(groupId, alice.account.address)).toBeGreaterThan(0n);
  });
});
