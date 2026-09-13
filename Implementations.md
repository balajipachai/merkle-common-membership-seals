# Problem Statement:

A Seal of Belonging for Every Chaupal
India has never run on a single template. A Punjabi sangat that feeds whoever walks in. A Maharashtrian mandal that has organised the same Ganpati for sixty years. A weavers' collective in Nagaland where the pattern on a shawl tells you the village. Each carries its own lineage, its own customs, its own idea of who counts as one of us — and membership in each of them is a real, specific thing, kept locally: a register in a steel cupboard, an elder who knows every family by name.

Chaupal is a small network trying to bring twelve of these groups into one shared space — joint event listings, group-only threads, a pooled discount scheme with local vendors. Two things are non-negotiable for the twelve. There will be no single administrator deciding who belongs in all of them; the weavers' collective is not going to ask a committee in Pune to approve its weavers. And no member roll goes onto a public chain, because a list of names, families and phone numbers is exactly the thing these groups have always kept in the cupboard.

What they will agree to is publishing a fingerprint of their own list. A member should be able to prove they are on their own group's list, receive a seal that says so, and carry it into Chaupal — without the list becoming readable and without any other group's steward being able to touch theirs.

# Tech Stack

- Solidity
- @openzeppelin/merkle-tree
- OpenZeppelin Contracts
- Foundry
- viem
- Next.js

# Learnings

1. How a Merkle root turns a private list into a public commitment; why what you put into the leaf matters more than the proof verification you copy from a library; and what it takes for twelve independent stewards to share one contract without any of them being in charge of the others.

# What to do:

1. Give each group a way to publish the fingerprint of its own member list, and to change it when the list changes.
2. Let a member of any group prove they belong there and receive a seal for it.
3. Make a seal mean what it says — it stays with the member who earned it.
4. Give a steward something they can run to maintain their list, and a member something they can use, without either of them needing a terminal.


# Output

- Deliverable. A repo with the contracts, the off-chain tooling that turns a member list into a root and into proofs, and the member-facing flow — plus a README explaining what a steward does on the day someone joins and the day someone leaves.
- Create an overall learnings document at the end with all the important details.

# Acceptance Criteria:

- A member of any one of the twelve groups proves they belong and holds a seal only they can hold, while the group's list stays in the group's cupboard.

# Test Cases:

1. Membership leaf derived from the caller inside the contract - 18 pts
Passes if The leaf passed to proof verification is computed inside the claim function from msg.sender.
Fails if The leaf, or the member identity inside it, is taken from a function parameter rather than derived from msg.sender; or the contract contains no leaf derivation at all.

2. Group identifier included in the leaf preimage - 14 pts
Passes if The group identifier is one of the values encoded into the leaf preimage, in both the contract's leaf derivation and the off-chain tree construction.
Fails if The leaf preimage encodes only member identity, so a proof issued for one group verifies against another group's root; or the repo contains no leaf construction to inspect.

3. Each group's root writable only by that group's own steward - 10 pts
Passes if The root-setting function requires the caller to be the steward recorded for the particular group whose root is being written.
Fails if A single owner or shared role can set the root of any group; or any steward can write any group's root; or the root-setting function has no access control at all.

4. Proof verified against the stored root - 10 pts
Passes if The root used in verification is read from contract storage for the group being claimed against.
Fails if The root used in verification comes from a function parameter or other caller-supplied value; or no root is stored in the contract.

5. Second claim by the same member reverts - 10 pts
Passes if The claim function reads contract state that records prior issuance for this member in this group, and reverts when it is already set.
Fails if No such state is recorded anywhere; or it is written but never read before issuing; or duplicate prevention exists only in the frontend or the off-chain tooling.

6. Seal cannot be transferred - 8 pts
Passes if The contract makes transfers revert for issued seals, through an override on the transfer path or the shared hook the base implementation routes through.
Fails if Transfer functions are inherited without modification so a seal can be moved between addresses; or non-transferability is enforced only by hiding controls in the interface.

7. Tree construction script committed to the repo - 5 pts
Passes if The repo contains runnable code that builds the tree from a member list and derives the root.
Fails if Roots and proofs appear only as hardcoded literals or committed fixtures with no code that generates them; or no tree-building code exists in the repo.

8. No credential appears in any tracked file - 5 pts
Passes if No credential, key, or authenticated URL appears in any tracked file; secrets are referenced through environment variables with an example file carrying placeholders only.
Fails if Any tracked file contains a private key, mnemonic, API key, password, or a URL with an embedded credential — including ones marked as test or throwaway.

# Important

- For smart contracts refer /Users/iamthebatman/Desktop/github.com/balajipachai/solidity-dev-skill
- If at te end anything worth updating in solidity-dev-skill, update that
- Make logical commits at the end and push to at the end after all the testing 

```bash
git remote add origin git@github.com:balajipachai/merkle-common-membership-seals.git
git branch -M main
git push -u origin main
```

