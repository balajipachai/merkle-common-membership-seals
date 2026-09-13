"use client";

import { use } from "react";
import { useReadContracts } from "wagmi";
import { isAddress } from "viem";
import { chaupalSealsAbi } from "@/lib/contracts/chaupalSeals";
import { getCuratedGroupIds } from "@/lib/groups";

const SEALS_ADDRESS = process.env.NEXT_PUBLIC_SEALS_ADDRESS as `0x${string}` | undefined;

export default function SealLookupPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const groupIds = getCuratedGroupIds();
  const valid = isAddress(address);

  const { data, isLoading } = useReadContracts({
    contracts: groupIds.map((groupId) => ({
      address: SEALS_ADDRESS,
      abi: chaupalSealsAbi,
      functionName: "sealOf",
      args: [groupId, address as `0x${string}`],
    })),
    query: { enabled: Boolean(SEALS_ADDRESS) && valid },
  });

  return (
    <main className="page">
      <h1>Seal lookup</h1>
      <p className="lede">
        A read-only check of which curated Chaupal groups <span className="mono">{address}</span>{" "}
        holds a seal for. This is exactly the check Chaupal itself runs - no private list is
        touched, only public on-chain state.
      </p>

      {!valid ? (
        <p className="notice danger" role="alert">
          &quot;{address}&quot; is not a valid address.
        </p>
      ) : groupIds.length === 0 ? (
        <p className="notice warn">No groups are curated yet.</p>
      ) : isLoading ? (
        <p>Checking…</p>
      ) : (
        <table>
          <caption className="visually-hidden">Seal holdings by group</caption>
          <thead>
            <tr>
              <th scope="col">Group id</th>
              <th scope="col">Holds a seal?</th>
            </tr>
          </thead>
          <tbody>
            {groupIds.map((groupId, i) => {
              const tokenId = data?.[i]?.result as bigint | undefined;
              const holds = Boolean(tokenId && tokenId > 0n);
              return (
                <tr key={groupId.toString()}>
                  <td>{groupId.toString()}</td>
                  <td>
                    {holds ? (
                      <span className="badge success">Yes (token #{tokenId?.toString()})</span>
                    ) : (
                      <span className="badge">No</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
