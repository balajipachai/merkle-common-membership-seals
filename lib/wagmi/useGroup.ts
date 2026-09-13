"use client";

import { useReadContract } from "wagmi";
import { chaupalSealsAbi } from "@/lib/contracts/chaupalSeals";

export interface OnChainGroup {
  name: string;
  steward: `0x${string}`;
  pendingSteward: `0x${string}`;
  root: `0x${string}`;
  rootVersion: bigint;
}

/** Reads a group's on-chain state. Returns `undefined` while loading or if it doesn't exist. */
export function useGroup(contractAddress: `0x${string}` | undefined, groupId: bigint | undefined) {
  const { data, ...rest } = useReadContract({
    address: contractAddress,
    abi: chaupalSealsAbi,
    functionName: "groups",
    args: groupId !== undefined ? [groupId] : undefined,
    query: { enabled: Boolean(contractAddress) && groupId !== undefined },
  });

  const group: OnChainGroup | undefined = data
    ? {
        name: (data as readonly [string, `0x${string}`, `0x${string}`, `0x${string}`, bigint])[0],
        steward: (data as readonly [string, `0x${string}`, `0x${string}`, `0x${string}`, bigint])[1],
        pendingSteward: (data as readonly [string, `0x${string}`, `0x${string}`, `0x${string}`, bigint])[2],
        root: (data as readonly [string, `0x${string}`, `0x${string}`, `0x${string}`, bigint])[3],
        rootVersion: (data as readonly [string, `0x${string}`, `0x${string}`, `0x${string}`, bigint])[4],
      }
    : undefined;

  return { group, ...rest };
}
