"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { chaupalSealsAbi } from "@/lib/contracts/chaupalSeals";
import { useGroup } from "@/lib/wagmi/useGroup";
import { ConnectWallet } from "@/components/ConnectWallet";
import { ProofQr } from "@/components/ProofQr";
import {
  addressesInTree,
  buildTree,
  diffMembers,
  dumpTree,
  loadTree,
  parseMembersCsv,
  proofForAddress,
  type MemberRecord,
} from "@/lib/membership";
import { buildClaimUrl } from "@/lib/membership/proofBundle";

const SEALS_ADDRESS = process.env.NEXT_PUBLIC_SEALS_ADDRESS as `0x${string}` | undefined;
const ZERO_ROOT = `0x${"0".repeat(64)}`;

export default function StewardPage() {
  const { address } = useAccount();
  const [groupIdInput, setGroupIdInput] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<bigint | undefined>();
  const [newGroupName, setNewGroupName] = useState("");

  const { group } = useGroup(SEALS_ADDRESS, selectedGroupId);

  const [members, setMembers] = useState<MemberRecord[] | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [previousAddresses, setPreviousAddresses] = useState<`0x${string}`[] | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const tree = useMemo(() => {
    if (!members || selectedGroupId === undefined) return null;
    return buildTree(selectedGroupId, members);
  }, [members, selectedGroupId]);

  const newRoot = tree?.root as `0x${string}` | undefined;

  const diff = useMemo(() => {
    if (!tree || !previousAddresses) return null;
    return diffMembers(previousAddresses, addressesInTree(tree));
  }, [tree, previousAddresses]);

  const leaverCandidates = diff?.leavers ?? [];

  const { data: leaverSealData } = useReadContracts({
    contracts: leaverCandidates.map((leaver) => ({
      address: SEALS_ADDRESS,
      abi: chaupalSealsAbi,
      functionName: "sealOf",
      args: [selectedGroupId ?? 0n, leaver],
    })),
    query: {
      enabled: Boolean(SEALS_ADDRESS && selectedGroupId !== undefined && leaverCandidates.length > 0),
    },
  });

  const leaversWithSeals = leaverCandidates.filter((_, i) => {
    const tokenId = leaverSealData?.[i]?.result as bigint | undefined;
    return Boolean(tokenId && tokenId > 0n);
  });

  const { writeContract: writeRegister, isPending: isRegistering, data: registerTx } = useWriteContract();
  const { isLoading: isRegisterMining, isSuccess: isRegistered } = useWaitForTransactionReceipt({ hash: registerTx });

  const {
    writeContract: writeUpdateRoot,
    data: updateTx,
    isPending: isUpdating,
    error: updateError,
  } = useWriteContract();
  const { isLoading: isUpdateMining, isSuccess: isUpdated } = useWaitForTransactionReceipt({ hash: updateTx });

  const isSteward = Boolean(address && group && group.steward.toLowerCase() === address.toLowerCase());

  async function handleCsvFile(file: File) {
    setCsvError(null);
    try {
      const text = await file.text();
      setMembers(parseMembersCsv(text));
    } catch (err) {
      setCsvError((err as Error).message);
      setMembers(null);
    }
  }

  async function handlePreviousTreeFile(file: File) {
    try {
      const text = await file.text();
      const dumped = JSON.parse(text);
      const prevTree = loadTree(dumped);
      setPreviousAddresses(addressesInTree(prevTree));
    } catch {
      setCsvError("Could not read the previous tree.json file.");
    }
  }

  function handleRegister() {
    if (!SEALS_ADDRESS || !newGroupName) return;
    writeRegister({
      address: SEALS_ADDRESS,
      abi: chaupalSealsAbi,
      functionName: "registerGroup",
      args: [newGroupName],
    });
  }

  function handlePublishRoot() {
    if (!SEALS_ADDRESS || selectedGroupId === undefined || !newRoot || !confirmChecked) return;
    writeUpdateRoot({
      address: SEALS_ADDRESS,
      abi: chaupalSealsAbi,
      functionName: "updateRoot",
      args: [selectedGroupId, newRoot, leaversWithSeals],
    });
  }

  function downloadTreeJson() {
    if (!tree || selectedGroupId === undefined) return;
    const dump = dumpTree(tree);
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `group-${selectedGroupId}-tree.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const claimBaseUrl = typeof window !== "undefined" ? `${window.location.origin}/claim` : "/claim";

  return (
    <main className="page">
      <h1>Steward tools</h1>
      <p className="lede">
        Everything here runs in your browser. Your member list is never uploaded anywhere - only
        the root you choose to publish, and only when you click Publish.
      </p>

      <div className="card">
        <ConnectWallet />
      </div>

      <h2>1. Register or select your group</h2>
      <div className="card stack">
        <div>
          <label htmlFor="new-group-name">Register a new group</label>
          <div className="row">
            <input
              id="new-group-name"
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="e.g. Punjabi Sangat"
              maxLength={64}
            />
            <button type="button" className="btn" disabled={!newGroupName || isRegistering} onClick={handleRegister}>
              {isRegistering ? "Confirm in wallet…" : "Register"}
            </button>
          </div>
          {isRegisterMining ? <p>Registering…</p> : null}
          {isRegistered ? (
            <p className="notice success">
              Group registered. Find its id in your wallet&apos;s activity or the block explorer,
              then load it below.
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="group-id">Or load a group you already steward</label>
          <div className="row">
            <input
              id="group-id"
              type="number"
              min={1}
              value={groupIdInput}
              onChange={(e) => setGroupIdInput(e.target.value)}
              placeholder="Group id"
            />
            <button
              type="button"
              className="btn secondary"
              disabled={!groupIdInput}
              onClick={() => setSelectedGroupId(BigInt(groupIdInput))}
            >
              Load
            </button>
          </div>
        </div>

        {selectedGroupId !== undefined && group ? (
          <div className="notice">
            <p style={{ margin: 0 }}>
              <strong>{group.name || "(unregistered)"}</strong> (group {selectedGroupId.toString()})
              {group.steward !== "0x0000000000000000000000000000000000000000" ? (
                <>
                  {" "}
                  - steward <span className="mono">{group.steward}</span>
                </>
              ) : null}
            </p>
            {!isSteward ? (
              <p className="notice warn" role="alert" style={{ marginTop: 8 }}>
                Your connected wallet is not this group&apos;s steward. You can still build a tree
                and preview the diff, but publishing the root will revert.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {selectedGroupId !== undefined ? (
        <>
          <h2>2. Load the member list</h2>
          <div className="card stack">
            <div>
              <label htmlFor="csv-file">Member CSV (name, phone, address, notes)</label>
              <input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => e.target.files?.[0] && handleCsvFile(e.target.files[0])}
              />
            </div>
            <div>
              <label htmlFor="prev-tree-file">Previous tree.json (optional, to detect leavers)</label>
              <input
                id="prev-tree-file"
                type="file"
                accept=".json,application/json"
                onChange={(e) => e.target.files?.[0] && handlePreviousTreeFile(e.target.files[0])}
              />
            </div>
            {csvError ? (
              <p className="notice danger" role="alert">
                {csvError}
              </p>
            ) : null}
            {members ? <p>{members.length} member(s) loaded.</p> : null}
          </div>
        </>
      ) : null}

      {tree && newRoot && selectedGroupId !== undefined ? (
        <>
          <h2>3. Review and publish</h2>
          <div className="card stack">
            <p>
              New root: <span className="mono">{newRoot}</span>
            </p>
            <p>
              On-chain root: <span className="mono">{group?.root ?? "(unknown)"}</span>{" "}
              {group?.root === ZERO_ROOT ? <span className="badge warn">none yet</span> : null}
            </p>
            {diff ? (
              <div>
                <p>
                  {diff.joiners.length} joiner(s), {diff.leavers.length} leaver(s) in the list,{" "}
                  {leaversWithSeals.length} of whom currently hold a seal and will be burned in the
                  same transaction.
                </p>
                {leaversWithSeals.length > 0 ? (
                  <ul>
                    {leaversWithSeals.map((a) => (
                      <li key={a} className="mono">
                        {a}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="notice warn">
                No previous tree.json was loaded, so leavers can&apos;t be detected automatically.
                Load last time&apos;s tree.json above if anyone left.
              </p>
            )}

            <label className="row" style={{ alignItems: "flex-start" }}>
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
                style={{ width: "auto", marginTop: 4 }}
              />
              <span>
                I have reviewed the {leaversWithSeals.length} seal(s) that will be burned, and I
                want to publish this root now.
              </span>
            </label>

            <div className="row">
              <button
                type="button"
                className="btn"
                disabled={!isSteward || !confirmChecked || isUpdating}
                onClick={handlePublishRoot}
              >
                {isUpdating ? "Confirm in wallet…" : "Publish root"}
              </button>
              <button type="button" className="btn secondary" onClick={downloadTreeJson}>
                Download tree.json (your private cupboard copy)
              </button>
            </div>
            {isUpdateMining ? <p>Publishing…</p> : null}
            {updateError ? (
              <p className="notice danger" role="alert">
                {updateError.message}
              </p>
            ) : null}
            {isUpdated ? <p className="notice success">Root published. Members can now claim below.</p> : null}
          </div>

          <h2>4. Claim links for members</h2>
          <div className="card stack">
            <p>Share each member their own link - it only works for their own connected wallet.</p>
            <div className="stack no-print">
              {members?.map((m) => {
                const proof = proofForAddress(tree, selectedGroupId, m.address);
                const url = buildClaimUrl(claimBaseUrl, {
                  groupId: selectedGroupId.toString(),
                  member: m.address,
                  proof,
                  groupName: group?.name,
                  contractAddress: SEALS_ADDRESS,
                });
                return (
                  <details key={m.address} className="card">
                    <summary>
                      {m.name || m.address} <span className="mono">{m.address}</span>
                    </summary>
                    <div className="row" style={{ marginTop: 12 }}>
                      <ProofQr value={url} size={140} />
                      <div>
                        <p className="mono" style={{ maxWidth: 420 }}>
                          {url}
                        </p>
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => navigator.clipboard.writeText(url)}
                        >
                          Copy link
                        </button>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
            <button type="button" className="btn secondary no-print" onClick={() => window.print()}>
              Print claim sheet
            </button>
          </div>
        </>
      ) : null}
    </main>
  );
}
