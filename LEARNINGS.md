# Learnings: A Public Fingerprint of a Private List

Notes from building Chaupal Seals. Twelve community groups each publish only a Merkle root of their member list;
a member proves they are on their own group's list and receives a soulbound seal. These notes cover what the root
does and doesn't hide, why the leaf matters more than the verification call, what it takes for independent
stewards to share one contract, and the deploy and tooling traps we hit on the way to Base Sepolia.

---

## 1. A Merkle root is a commitment, not a list

A root is 32 bytes that commits to an exact set of leaves. Publishing it reveals nothing about the members, yet it
lets anyone holding a leaf and its proof convince the contract that the leaf is in the set, in `O(log n)` hashes.

What each party holds:

| Who | Holds | Never leaves |
|---|---|---|
| Steward | The CSV (name, phone, address) and the full tree (`cupboard/tree.json`) | The steward's machine — `cupboard/` and `*.csv` are gitignored |
| Member | Their own proof, inside a claim link | The URL fragment (`/claim#…`), which browsers never send to a server |
| Chain | One root per group, plus which addresses claimed | — |

**What stays private:** names, phones and notes never enter a leaf, only `(groupId, address)`. So the full roll,
and anyone who hasn't claimed, stays in the cupboard.

**What does not:**
- **Claiming is public.** `claim` is a transaction, and `SealClaimed(groupId, member, tokenId)` names the member.
  Holding a seal *is* the public statement; members should know that before they claim.
- **A proof leaks its neighbours' leaves.** The first element of every proof is the sibling leaf, and a leaf is
  just `hash(groupId, address)`. An observer with a list of candidate addresses can hash each one and compare it
  against the sibling hashes in claim calldata. The pseudonymity of addresses is the only shield here — which is
  one more reason names and phone numbers must never be in the leaf.

## 2. The leaf is the security boundary

Copying `MerkleProof.verify` from a library is the easy part. Nearly every property of the system comes from
*what is hashed into the leaf* and *where that leaf comes from*.

```solidity
function claim(uint256 groupId, bytes32[] calldata proof) external {
    bytes32 root = groups[groupId].root;                 // from storage, never a parameter
    if (root == bytes32(0)) revert RootNotSet();
    if (sealOf[groupId][msg.sender] != 0) revert AlreadyClaimed();
    bytes32 leaf = _leafFor(groupId, msg.sender);        // derived here, from msg.sender
    if (!MerkleProof.verifyCalldata(proof, root, leaf)) revert InvalidProof();
    ...
}

function _leafFor(uint256 groupId, address member) internal pure returns (bytes32) {
    return keccak256(bytes.concat(keccak256(abi.encode(groupId, member))));
}
```

| Decision | What goes wrong otherwise | Test |
|---|---|---|
| Leaf derived from `msg.sender` | If the member (or the leaf) is a parameter, anyone who sees a proof in a claim link or in the mempool can claim with it | `test_TC1_ProofIsBoundToCallerNotAParameter`, `test_TC1_UnrelatedAddressCannotClaimWithSomeoneElsesProof` |
| `groupId` in the preimage | **Root-copy attack**: a steward copies another group's root, and every member of that group can claim in theirs. With `groupId` inside, those leaves were never computed for the copying group, so no valid proof exists there | `test_TC2_RootCopyAttackFails`, `test_TC2_LeafForDiffersAcrossGroupsForSameMember` |
| Root read from storage | A root parameter lets the caller supply a tree containing only themselves | `test_TC4_ClaimHasNoRootParameter`, `test_TC4_RootNotSetReverts` |
| Double hash | See below | — |
| Prior-issuance check reads state | A frontend-only guard is no guard | `test_TC5_SecondClaimReverts`, `testFuzz_DoubleClaimAlwaysReverts` |

**Why the double hash is not decoration.** An internal node is `keccak256(a ‖ b)` over two 32-byte hashes: a
64-byte preimage. `abi.encode(uint256, address)` is *also* exactly 64 bytes. With a single hash, a leaf and an
internal node are the same kind of object, which opens a second-preimage attack: present an internal node as a
leaf with a shorter proof. Hashing the leaf twice puts leaves in a different domain from nodes. It is also exactly
what OpenZeppelin's `StandardMerkleTree` does, so the off-chain tree and the contract agree without custom code.

**One formula, asserted in two places.** The leaf lives off-chain once, in `lib/membership/leaf.ts`, shared by the
CLI and the `/steward` page. The contract exposes `leafFor(groupId, member)` as a `pure` view, and the e2e suite
checks `computeLeaf(...) === leafFor(...)` byte-for-byte against real deployed bytecode. `claim` itself never calls
`leafFor` — it derives the leaf inline — so the view is only a mirror for tooling, never an input.

## 3. Twelve stewards, no admin

The contract has no owner, no role, and no function that can touch more than one group's root, steward or seals.

- **Registration is permissionless.** `registerGroup` makes the caller that group's steward. The trade-off is that
  anyone can register a group with a familiar name, so the app displays only the ids in
  `NEXT_PUBLIC_CHAUPAL_GROUP_IDS`. Curation happens off-chain, at the edge where it is cheap to change.
- **Each root is guarded by its own steward.** `onlySteward(groupId)` compares `msg.sender` with
  `groups[groupId].steward` — not a shared role that any steward holds, which would let one steward rewrite
  another group's root (`test_TC3_OtherGroupsStewardCannotSetThisGroupsRoot`).
- **Two-step handoff.** `transferStewardship` then `acceptStewardship`, the `Ownable2Step` pattern per group, so a
  typo'd address can't strand a group with no steward.

## 4. Joining, leaving, and what a root update does *not* do

- **Joining:** add the row, rebuild the tree, publish the new root. Existing seals are untouched, because a seal is
  recorded in `sealOf`, not re-proven.
- **Every root update invalidates every outstanding proof** (`test_TC4_RootUpdateInvalidatesOldProofs`). Members
  who haven't claimed yet need fresh links after any change to the list, even an unrelated one.
- **Removing someone from the tree does not revoke their seal.** A seal is a snapshot of membership at claim time.
  So `updateRoot(groupId, root, leavers)` burns the seals of `leavers` in the *same* transaction as the new root,
  and the `/steward` page diffs the old and new lists, intersected with on-chain `sealOf`, to fill `leavers`.
- **The burn loop is bounded.** `MAX_LEAVERS_PER_UPDATE = 200` keeps the gas of one update predictable no matter
  how large a group grows (`test_MaxLeaversUpdateIsGasSane`).
- **Rejoining works**: a renounced or revoked member who is in a later tree can claim again
  (`test_TC5_RenounceThenReclaimWorks`, `test_TC5_RejoinUnderNewRootWorks`), because the burn clears `sealOf`.

## 5. Soulbound at the hook, not at the entry points

OpenZeppelin v5's ERC-721 routes every mint, transfer and burn through one internal `_update`. Overriding it to
reject `from != 0 && to != 0` blocks `transferFrom`, `safeTransferFrom`, and any future path through the same
hook, while still allowing mint and burn. `approve` and `setApprovalForAll` also revert, since there is nothing to
approve. Hiding transfer buttons in the UI would enforce nothing. The invariant suite fuzzes claim, renounce,
transfer and approve attempts, and checks that a seal never changes owner and that balances match held seals.

## 6. Integration and tooling traps

- **A JSON-imported ABI kills viem/wagmi type inference.** `import abi from "./X.abi.json"` widens every `type` to
  `string`, so `useReadContracts` and `parseEventLogs` fail to typecheck. Inline the ABI with `as const` and
  regenerate it with `forge inspect ChaupalSeals abi --json`.
- **Turbopack doesn't resolve `./leaf.js` to `leaf.ts`.** NodeNext-style `.js` import suffixes worked under
  `tsx` and vitest but broke `next build`. With `moduleResolution: "bundler"`, write extensionless imports.
- **The e2e suite runs on anvil with Base Sepolia's chain id (84532)**, so the app's wagmi config needs no
  local-only branch. Accounts are generated at runtime and funded with `anvil_setBalance`, so no well-known key is
  ever referenced.

## 7. Deploying and verifying on Base Sepolia

- **A local run can pose as a real deploy.** Because anvil also runs with `--chain-id 84532`, local `forge script`
  runs wrote into `broadcast/Deploy.s.sol/84532/` — where the real deploy record belongs — and one was committed
  as if it were real. The giveaways: the sender was anvil's default account `0xf39f…2266`, and the address was
  `0x5FbD…0aa3` (the first CREATE from that account), which has no code on Base Sepolia (`cast code` returned
  `0x`). Check the sender and `cast code` before trusting a broadcast file.
- **Etherscan's V1 API is retired.** A `url = "https://api-sepolia.basescan.org/api"` in `foundry.toml`'s
  `[etherscan]` section made forge fail with `Failed to deserialize content` and a V1 deprecation notice. Drop the
  `url`; forge then uses the V2 multichain API with the same key.
- **Sourcify needs no API key** (`--verifier sourcify`), and forwards the source to Blockscout and Etherscan. The
  Etherscan forward can fail on Sourcify's shared quota (`Daily limit of 500 source code submissions reached`), so
  verify on Basescan with your own key afterwards. `NOTOK — Pending in queue` from `--watch` is normal polling,
  not an error.
- **Broadcast records look like leaked keys to secret scanners.** Transaction and block hashes match the
  `0x` + 64-hex private-key pattern, so tracking the real deploy record made `check-secrets` (and so `npm test`)
  fail. We checked that every match was a tx or block hash, then exempted `contracts/broadcast/**/*.json` from that
  one pattern only. A full tx hash in a README link trips the same check.

## Deployed

`ChaupalSeals` on Base Sepolia: `0xA0A5bDb07cD91411D937a43Cf2C113A41e308817`, verified on Basescan, Sourcify and
Blockscout. See the README for links and the steward runbook.
