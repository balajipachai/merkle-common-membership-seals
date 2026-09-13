#!/usr/bin/env tsx
/**
 * Starts a local anvil node on port 8547 (never 8545/8546, which belong to the sibling zk/SIWE
 * projects), deploys ChaupalSeals to it using anvil's own unlocked account #0 (no private key
 * ever touches a file or env var), and writes `.env.local` with the deployed address and RPC
 * URL. Leaves anvil running in the foreground - stop it with Ctrl+C.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CONTRACTS_DIR = join(ROOT, "contracts");

const ANVIL_PORT = 8547;
const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
// Base Sepolia's chain id, so the app never needs a second chain definition for local dev - see
// `lib/wagmi/config.ts`.
const CHAIN_ID = 84532;

async function waitForAnvil(): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("anvil did not become ready within 30s");
}

function getUnlockedSender(): string {
  const result = spawnSync("cast", ["rpc", "eth_accounts", "--rpc-url", RPC_URL], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`cast rpc eth_accounts failed: ${result.stderr}`);
  }
  const accounts: string[] = JSON.parse(result.stdout);
  const first = accounts[0];
  if (!first) throw new Error("anvil returned no unlocked accounts");
  return first;
}

function deploy(sender: string): string {
  const result = spawnSync(
    "forge",
    [
      "script",
      "script/Deploy.s.sol",
      "--rpc-url",
      RPC_URL,
      "--unlocked",
      "--sender",
      sender,
      "--broadcast",
    ],
    { cwd: CONTRACTS_DIR, encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error("forge script deploy failed");
  }
  console.log(result.stdout);

  const match = result.stdout.match(/ChaupalSeals deployed at:\s*(0x[0-9a-fA-F]{40})/);
  if (!match) throw new Error("could not find deployed address in forge script output");
  return match[1]!;
}

async function main() {
  console.log(`Starting anvil on port ${ANVIL_PORT} (chain id ${CHAIN_ID})...`);
  const anvil = spawn("anvil", ["--port", String(ANVIL_PORT), "--chain-id", String(CHAIN_ID)], {
    stdio: "inherit",
  });

  const cleanup = () => {
    anvil.kill();
  };
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  await waitForAnvil();
  console.log("anvil is ready.");

  const sender = getUnlockedSender();
  console.log(`Deploying with unlocked account ${sender}...`);
  const address = deploy(sender);
  console.log(`ChaupalSeals deployed at ${address}`);

  const envPath = join(ROOT, ".env.local");
  const contents = [
    `NEXT_PUBLIC_RPC_URL=${RPC_URL}`,
    `NEXT_PUBLIC_SEALS_ADDRESS=${address}`,
    `NEXT_PUBLIC_CHAUPAL_GROUP_IDS=${process.env.NEXT_PUBLIC_CHAUPAL_GROUP_IDS ?? ""}`,
    "",
  ].join("\n");
  writeFileSync(envPath, contents);
  console.log(`Wrote ${envPath}`);

  if (!existsSync(join(ROOT, ".env.local"))) {
    throw new Error("failed to write .env.local");
  }

  console.log("\nLocal chain is running. Press Ctrl+C to stop anvil.\n");
  // Keep the process alive with anvil in the foreground.
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
