"use client";

import Link from "next/link";
import { getCuratedGroupIds } from "@/lib/groups";
import { useGroup } from "@/lib/wagmi/useGroup";

const SEALS_ADDRESS = process.env.NEXT_PUBLIC_SEALS_ADDRESS as `0x${string}` | undefined;

function GroupRow({ groupId }: { groupId: bigint }) {
  const { group, isLoading } = useGroup(SEALS_ADDRESS, groupId);

  if (isLoading) {
    return (
      <li className="card">
        <p>Loading group {groupId.toString()}…</p>
      </li>
    );
  }

  if (!group || group.steward === "0x0000000000000000000000000000000000000000") {
    return (
      <li className="card">
        <p>
          Group {groupId.toString()} is listed but not yet registered on-chain.
        </p>
      </li>
    );
  }

  const zeroRoot = `0x${"0".repeat(64)}`;
  const hasRoot = group.root !== zeroRoot;

  return (
    <li className="card">
      <h2 style={{ marginTop: 0 }}>{group.name}</h2>
      <p className="mono" style={{ color: "var(--text-muted)" }}>
        group id {groupId.toString()} · steward {group.steward.slice(0, 6)}…{group.steward.slice(-4)}
      </p>
      <p>
        {hasRoot ? (
          <span className="badge success">Root version {group.rootVersion.toString()}</span>
        ) : (
          <span className="badge warn">No root published yet</span>
        )}
      </p>
      <Link href={`/seal/${group.steward}`}>Look up a seal for this group&apos;s steward →</Link>
    </li>
  );
}

export default function GroupsPage() {
  const groupIds = getCuratedGroupIds();

  return (
    <main className="page">
      <h1>Chaupal groups</h1>
      <p className="lede">
        This is a curated list ({groupIds.length} group{groupIds.length === 1 ? "" : "s"}) set by
        Chaupal via <code>NEXT_PUBLIC_CHAUPAL_GROUP_IDS</code>. Group registration itself is
        permissionless on-chain, so this page intentionally does not show every registered group -
        only the ones Chaupal has curated into its directory.
      </p>

      {groupIds.length === 0 ? (
        <p className="notice warn">No group ids are configured yet.</p>
      ) : (
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
          {groupIds.map((id) => (
            <GroupRow key={id.toString()} groupId={id} />
          ))}
        </ul>
      )}
    </main>
  );
}
