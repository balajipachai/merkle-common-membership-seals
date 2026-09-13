import { readFileSync } from "node:fs";
import {
  type Address,
  type WalletClient,
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  parseEventLogs,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { chaupalSealsAbi } from "../../lib/contracts/chaupalSeals.js";
import { E2E_CONFIG_PATH } from "./globalSetup.js";

export interface E2EConfig {
  rpcUrl: string;
  chainId: number;
  sealsAddress: Address;
  deployerAccounts: Address[];
}

export function loadE2EConfig(): E2EConfig {
  return JSON.parse(readFileSync(E2E_CONFIG_PATH, "utf8"));
}

export const config = loadE2EConfig();
const sealsAddress = config.sealsAddress;

/** The local anvil chain, pinned to Base Sepolia's own chain id (see globalSetup). */
export const anvilChain = defineChain({
  id: config.chainId,
  name: "anvil-local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
});

export const publicClient = createPublicClient({ chain: anvilChain, transport: http(config.rpcUrl) });

export const testClient = createTestClient({ chain: anvilChain, mode: "anvil", transport: http(config.rpcUrl) });

/**
 * Generates a fresh keypair at runtime (never a hardcoded/well-known key) and funds it via
 * anvil's `anvil_setBalance` cheatcode, so no anvil default private key is ever referenced to
 * move funds around.
 */
export async function createFundedAccount() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  await testClient.setBalance({ address: account.address, value: parseEther("100") });
  const walletClient = createWalletClient({ account, chain: anvilChain, transport: http(config.rpcUrl) });
  return { account, walletClient };
}

export async function registerGroup(walletClient: WalletClient, name: string): Promise<bigint> {
  const hash = await walletClient.writeContract({
    address: sealsAddress,
    abi: chaupalSealsAbi,
    functionName: "registerGroup",
    args: [name],
    chain: anvilChain,
    account: walletClient.account!,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const [event] = parseEventLogs({ abi: chaupalSealsAbi, eventName: "GroupRegistered", logs: receipt.logs });
  if (!event) throw new Error("GroupRegistered event not found in receipt");
  return (event.args as { groupId: bigint }).groupId;
}

export async function updateRoot(
  walletClient: WalletClient,
  groupId: bigint,
  root: `0x${string}`,
  leavers: readonly `0x${string}`[],
) {
  const hash = await walletClient.writeContract({
    address: sealsAddress,
    abi: chaupalSealsAbi,
    functionName: "updateRoot",
    args: [groupId, root, leavers],
    chain: anvilChain,
    account: walletClient.account!,
  });
  return publicClient.waitForTransactionReceipt({ hash });
}

export async function claim(walletClient: WalletClient, groupId: bigint, proof: readonly `0x${string}`[]) {
  const hash = await walletClient.writeContract({
    address: sealsAddress,
    abi: chaupalSealsAbi,
    functionName: "claim",
    args: [groupId, proof],
    chain: anvilChain,
    account: walletClient.account!,
  });
  return publicClient.waitForTransactionReceipt({ hash });
}

export async function sealOf(groupId: bigint, member: Address): Promise<bigint> {
  return publicClient.readContract({
    address: sealsAddress,
    abi: chaupalSealsAbi,
    functionName: "sealOf",
    args: [groupId, member],
  }) as Promise<bigint>;
}

export async function leafForOnChain(groupId: bigint, member: Address): Promise<`0x${string}`> {
  return publicClient.readContract({
    address: sealsAddress,
    abi: chaupalSealsAbi,
    functionName: "leafFor",
    args: [groupId, member],
  }) as Promise<`0x${string}`>;
}
