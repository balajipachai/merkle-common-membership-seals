/**
 * Vitest globalSetup for the E2E suite: starts a real anvil node on port 8547 (chain id 84532,
 * matching Base Sepolia so the app's own wagmi config needs no local-only branch), deploys
 * ChaupalSeals to it using anvil's own unlocked account #0 (never a hardcoded private key), and
 * writes the resulting RPC URL + contract address to `.cache/e2e-config.json` for test files to
 * read. Torn down (anvil killed) in the returned teardown function.
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const CONTRACTS_DIR = join(ROOT, "contracts");
export const E2E_CONFIG_PATH = join(ROOT, ".cache", "e2e-config.json");

const ANVIL_PORT = 8547;
export const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
const CHAIN_ID = 84532;

async function waitForAnvil(): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (res.ok) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`anvil did not become ready within 30s: ${String(lastError)}`);
}

async function getUnlockedAccounts(): Promise<string[]> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_accounts", params: [] }),
  });
  const json = (await res.json()) as { result: string[] };
  return json.result;
}

function deployContract(sender: string): string {
  const result = spawnSync(
    "forge",
    ["script", "script/Deploy.s.sol", "--rpc-url", RPC_URL, "--unlocked", "--sender", sender, "--broadcast"],
    { cwd: CONTRACTS_DIR, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`forge script deploy failed:\n${result.stdout}\n${result.stderr}`);
  }
  const match = result.stdout.match(/ChaupalSeals deployed at:\s*(0x[0-9a-fA-F]{40})/);
  if (!match) {
    throw new Error(`could not find deployed address in forge script output:\n${result.stdout}`);
  }
  return match[1]!;
}

export default async function globalSetup() {
  const anvil: ChildProcess = spawn(
    "anvil",
    ["--port", String(ANVIL_PORT), "--chain-id", String(CHAIN_ID), "--silent"],
    { stdio: "ignore" },
  );

  await waitForAnvil();

  const accounts = await getUnlockedAccounts();
  const sender = accounts[0];
  if (!sender) throw new Error("anvil returned no unlocked accounts");

  const sealsAddress = deployContract(sender);

  mkdirSync(dirname(E2E_CONFIG_PATH), { recursive: true });
  writeFileSync(
    E2E_CONFIG_PATH,
    JSON.stringify({ rpcUrl: RPC_URL, chainId: CHAIN_ID, sealsAddress, deployerAccounts: accounts }, null, 2),
  );

  return async () => {
    anvil.kill();
    rmSync(E2E_CONFIG_PATH, { force: true });
  };
}
