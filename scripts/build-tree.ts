#!/usr/bin/env tsx
/**
 * CLI: turns a steward's member CSV into a Merkle tree, root, and per-member proofs.
 *
 * Usage:
 *   npm run tree:build -- --group <id> --in members.csv --out cupboard/
 *
 * Writes (all gitignored except the checked-in example fixture):
 *   <out>/tree.json           the private "cupboard" copy (full tree, reloadable for next time)
 *   <out>/root.txt             the new root, in hex
 *   <out>/proofs/<address>.json  one file per member: { groupId, member, proof }
 *
 * This is the exact off-chain counterpart to `ChaupalSeals.claim`/`leafFor`: the leaf definition
 * lives once, in `lib/membership/leaf.ts`, and both this CLI and the /steward browser page import
 * it from there.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { addressesInTree, buildTree, dumpTree, parseMembersCsv, proofForAddress } from "../lib/membership/index.js";

interface Args {
  group?: string;
  in?: string;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--group") args.group = argv[++i];
    else if (token === "--in") args.in = argv[++i];
    else if (token === "--out") args.out = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.group || !args.in || !args.out) {
    console.error("Usage: tree:build -- --group <id> --in members.csv --out cupboard/");
    process.exitCode = 1;
    return;
  }

  const groupId = BigInt(args.group);
  const csvText = readFileSync(args.in, "utf8");
  const members = parseMembersCsv(csvText);

  const tree = buildTree(groupId, members);
  const root = tree.root;

  mkdirSync(args.out, { recursive: true });
  const proofsDir = join(args.out, "proofs");
  mkdirSync(proofsDir, { recursive: true });

  writeFileSync(join(args.out, "tree.json"), JSON.stringify(dumpTree(tree), null, 2) + "\n");
  writeFileSync(join(args.out, "root.txt"), root + "\n");

  for (const member of members) {
    const proof = proofForAddress(tree, groupId, member.address);
    const outPath = join(proofsDir, `${member.address}.json`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(
      outPath,
      JSON.stringify({ groupId: groupId.toString(), member: member.address, proof }, null, 2) + "\n",
    );
  }

  const addresses = addressesInTree(tree);
  console.log(`Group ${groupId}: built a tree over ${addresses.length} member(s).`);
  console.log(`Root: ${root}`);
  console.log(`Wrote ${args.out}/tree.json, ${args.out}/root.txt and ${addresses.length} proof file(s) under ${proofsDir}/`);
}

main();
