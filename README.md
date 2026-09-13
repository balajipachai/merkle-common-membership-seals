# Chaupal Seals — Merkle membership seals

Each Chaupal group publishes only the **Merkle root** of its member list on-chain. A member proves they are on
their own group's list and claims a **soulbound seal** (ERC-721 + ERC-5192) — while names, families and phone
numbers stay in the group's cupboard. Every group has its own steward; no global admin can touch another group's
root.

## Deployment

| | |
|---|---|
| Network | Base Sepolia (chain id `84532`) |
| `ChaupalSeals` | [`0xA0A5bDb07cD91411D937a43Cf2C113A41e308817`](https://sepolia.basescan.org/address/0xA0A5bDb07cD91411D937a43Cf2C113A41e308817) |
| Deploy tx | `0xed50fd07…96b9f2` (full hash in the broadcast record below) |
| Deployer | `0xA7864883fB579245478F75aC4882b170E7d7676c` |
| Verified source | [Basescan](https://sepolia.basescan.org/address/0xA0A5bDb07cD91411D937a43Cf2C113A41e308817#code) · [Sourcify (exact match)](https://repo.sourcify.dev/84532/0xA0A5bDb07cD91411D937a43Cf2C113A41e308817) · [Blockscout](https://base-sepolia.blockscout.com/address/0xA0A5bDb07cD91411D937a43Cf2C113A41e308817) |

The broadcast record lives in `contracts/broadcast/Deploy.s.sol/84532/`.

## How it works

- **Leaf** = `keccak256(keccak256(abi.encode(groupId, member)))` — the OpenZeppelin `StandardMerkleTree` leaf.
  The group id is in the preimage, so a proof for one group never verifies against another group's root.
- **`claim(groupId, proof)`** derives the leaf from `msg.sender` inside the contract and verifies it against the
  root **stored** for that group. A second claim by the same member reverts (`AlreadyClaimed`).
- **`updateRoot(groupId, root, leavers)`** is callable only by that group's own steward, and burns the seals of
  `leavers` in the same transaction.
- **Seals are soulbound**: every transfer and approval reverts (`Soulbound`). A member can `renounceSeal` their own.
- **Group registration is permissionless**; the app shows only the groups listed in `NEXT_PUBLIC_CHAUPAL_GROUP_IDS`.

The leaf formula exists once off-chain, in `lib/membership/leaf.ts`, shared by the CLI and the `/steward` page. The
e2e suite asserts it matches the contract's `leafFor` byte-for-byte.

## Steward runbook

**One-time:** connect a wallet at `/steward` and register your group — that wallet becomes the group's steward.
Stewardship can be handed over later with the two-step `transferStewardship` / `acceptStewardship`.

**The day someone joins**

1. Add their row (name, phone, wallet address) to your members CSV — it never leaves your machine.
2. Rebuild the tree, in `/steward` or with the CLI:
   ```bash
   npm run tree:build -- --group <id> --in members.csv --out cupboard/
   ```
3. Publish the new root with `updateRoot` (no leavers). Existing seals are unaffected.
4. Send the new member their claim link / QR. The proof travels in the URL fragment (`/claim#…`), which browsers
   never send to a server. They connect the same wallet and claim.

**The day someone leaves**

1. Remove their row from the CSV and rebuild the tree.
2. Publish the new root and list their address in `leavers` — their seal is burned in the same transaction.
3. Members who haven't claimed yet need fresh proofs against the new root; existing seals stay valid.

## Local development

Requires Node ≥ 24 and Foundry.

```bash
npm install
(cd contracts && forge soldeer install)
npm run dev:local      # starts anvil (chain id 84532), deploys, writes .env.local, runs the app on :3020
```

Point the app at the live deployment instead by copying `.env.example` to `.env.local` — it already carries the
Base Sepolia address.

## Tests

```bash
(cd contracts && forge test)   # unit + invariant tests
npm run test:e2e               # full steward → member lifecycle against real anvil bytecode
npm run check-secrets          # no credentials in tracked files
npm run typecheck && npm run lint && npm run build
```

## Deploying & verifying

Keys live in an encrypted Foundry keystore — never in a file or env var.

```bash
cd contracts
cast wallet import chaupal-deployer --interactive
forge script script/Deploy.s.sol --account chaupal-deployer \
  --rpc-url https://sepolia.base.org --broadcast --verify

# verify an existing deployment only (Sourcify needs no API key)
forge verify-contract <address> src/ChaupalSeals.sol:ChaupalSeals --chain base-sepolia --verifier sourcify
```

After deploying, set `NEXT_PUBLIC_SEALS_ADDRESS` in `.env.local` and in your hosting environment.
