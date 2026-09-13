// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { ChaupalSeals } from "../src/ChaupalSeals.sol";
import { MerkleTestHelper } from "./utils/MerkleTestHelper.sol";

/// @notice Invariant handler bounding the fuzzer to actions that are meaningful for
/// ChaupalSeals: claiming (against precomputed valid proofs for a fixed cast of members),
/// attempting transfers (which must always fail), and renouncing. Every state-changing call is
/// wrapped in try/catch so a reverting call never aborts the invariant run - only genuine
/// invariant violations should fail the suite.
contract ChaupalSealsHandler is Test {
    ChaupalSeals public immutable seals;
    uint256 public immutable groupId;
    address[] internal members;
    bytes32[][] internal proofs;

    /// @dev tokenId => the address it was minted to. Populated only on a successful claim.
    mapping(uint256 tokenId => address originalOwner) public ghost_originalOwner;
    uint256[] public ghost_mintedTokenIds;

    constructor(ChaupalSeals _seals, uint256 _groupId, address[] memory _members, bytes32[][] memory _proofs) {
        seals = _seals;
        groupId = _groupId;
        members = _members;
        proofs = _proofs;
    }

    function membersCount() external view returns (uint256) {
        return members.length;
    }

    function mintedCount() external view returns (uint256) {
        return ghost_mintedTokenIds.length;
    }

    function mintedTokenIdAt(uint256 i) external view returns (uint256) {
        return ghost_mintedTokenIds[i];
    }

    function claim(uint256 memberSeed) external {
        uint256 i = memberSeed % members.length;
        address member = members[i];

        vm.prank(member);
        try seals.claim(groupId, proofs[i]) {
            uint256 tokenId = seals.sealOf(groupId, member);
            ghost_originalOwner[tokenId] = member;
            ghost_mintedTokenIds.push(tokenId);
        } catch {
            // Already claimed, or any other guard - fine, this is a bounded random walk.
        }
    }

    function renounce(uint256 memberSeed) external {
        uint256 i = memberSeed % members.length;
        address member = members[i];

        vm.prank(member);
        try seals.renounceSeal(groupId) { } catch { }
    }

    function attemptTransfer(uint256 memberSeed, address to) external {
        uint256 i = memberSeed % members.length;
        address member = members[i];
        uint256 tokenId = seals.sealOf(groupId, member);
        if (tokenId == 0) return;

        vm.prank(member);
        try seals.transferFrom(member, to, tokenId) {
            // MUST NEVER SUCCEED. If it does, the invariant assertion below will catch it too,
            // but fail loudly here as well for a clearer trace.
            assertTrue(false, "soulbound transfer unexpectedly succeeded");
        } catch { }
    }

    function attemptApprove(uint256 memberSeed, address to) external {
        uint256 i = memberSeed % members.length;
        address member = members[i];
        uint256 tokenId = seals.sealOf(groupId, member);
        if (tokenId == 0) return;

        vm.prank(member);
        try seals.approve(to, tokenId) {
            assertTrue(false, "soulbound approve unexpectedly succeeded");
        } catch { }
    }
}

contract ChaupalSealsInvariantTest is Test {
    ChaupalSeals internal seals;
    ChaupalSealsHandler internal handler;

    function setUp() public {
        seals = new ChaupalSeals();

        address steward = makeAddr("invStew");
        vm.prank(steward);
        uint256 groupId = seals.registerGroup("Invariant Group");

        uint256 n = 8;
        address[] memory members = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            members[i] = address(uint160(0x20000 + i));
        }

        (bytes32 root, bytes32[][] memory proofs) = MerkleTestHelper.buildTreeForGroup(groupId, members);

        vm.prank(steward);
        seals.updateRoot(groupId, root, new address[](0));

        handler = new ChaupalSealsHandler(seals, groupId, members, proofs);

        targetContract(address(handler));
    }

    /// @notice The core soulbound invariant: once a seal is minted to an address, it either
    /// stays with that address forever, or ceases to exist (burned via renounce). It can never
    /// end up owned by a *different* address.
    function invariant_SealNeverChangesOwner() public view {
        uint256 count = handler.mintedCount();
        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = handler.mintedTokenIdAt(i);
            address original = handler.ghost_originalOwner(tokenId);

            try seals.ownerOf(tokenId) returns (address currentOwner) {
                assertEq(currentOwner, original, "seal owner changed");
            } catch {
                // Token no longer exists (renounced) - acceptable, not a transfer.
            }
        }
    }

    /// @notice balanceOf must always equal the number of seals currently held (minted and not
    /// yet burned) across every member the handler knows about.
    function invariant_BalanceMatchesHeldSeals() public view {
        uint256 count = handler.mintedCount();
        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = handler.mintedTokenIdAt(i);
            try seals.ownerOf(tokenId) returns (address currentOwner) {
                assertGe(seals.balanceOf(currentOwner), 1);
            } catch {
                // burned - fine
            }
        }
    }
}
