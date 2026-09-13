// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC721Errors } from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import { ChaupalSeals } from "../src/ChaupalSeals.sol";
import { MerkleTestHelper } from "./utils/MerkleTestHelper.sol";

/// @notice Unit + fuzz tests for ChaupalSeals, mapped to Implementations.md's TC1-TC6 plus the
/// additional coverage called for in the plan (root-copy attack, fuzz, name validation, gas-sane
/// leaver bounds). The invariant suite ("a seal never changes owner") lives in
/// `ChaupalSeals.invariant.t.sol`.
contract ChaupalSealsTest is Test {
    ChaupalSeals internal seals;

    address internal stewardA = makeAddr("stewardA");
    address internal stewardB = makeAddr("stewardB");

    address internal alice = makeAddr("alice");
    address internal dave = makeAddr("dave");
    address internal eve = makeAddr("eve");
    address internal frank = makeAddr("frank");

    address internal bob = makeAddr("bob");
    address internal george = makeAddr("george");
    address internal harry = makeAddr("harry");
    address internal iris = makeAddr("iris");

    uint256 internal groupA;
    uint256 internal groupB;

    bytes32 internal rootA;
    bytes32[][] internal proofsA; // indexed [alice, dave, eve, frank]

    bytes32 internal rootB;
    bytes32[][] internal proofsB; // indexed [bob, george, harry, iris]

    function setUp() public {
        seals = new ChaupalSeals();

        vm.prank(stewardA);
        groupA = seals.registerGroup(unicode"Punjabi Sangat");

        vm.prank(stewardB);
        groupB = seals.registerGroup(unicode"Weavers' Collective");

        address[] memory membersA = new address[](4);
        membersA[0] = alice;
        membersA[1] = dave;
        membersA[2] = eve;
        membersA[3] = frank;
        (rootA, proofsA) = MerkleTestHelper.buildTreeForGroup(groupA, membersA);

        address[] memory membersB = new address[](4);
        membersB[0] = bob;
        membersB[1] = george;
        membersB[2] = harry;
        membersB[3] = iris;
        (rootB, proofsB) = MerkleTestHelper.buildTreeForGroup(groupB, membersB);

        vm.prank(stewardA);
        seals.updateRoot(groupA, rootA, new address[](0));

        vm.prank(stewardB);
        seals.updateRoot(groupB, rootB, new address[](0));
    }

    // -----------------------------------------------------------------
    // TC1: leaf derived from msg.sender inside claim
    // -----------------------------------------------------------------

    function test_TC1_ClaimSucceedsForTheProvenMember() public {
        vm.prank(alice);
        seals.claim(groupA, proofsA[0]);

        assertEq(seals.ownerOf(seals.sealOf(groupA, alice)), alice);
    }

    /// @dev `claim` takes no member/address parameter at all - the only way the leaf can be
    /// wrong for the caller is if it derives from msg.sender, which this proves: dave's proof is
    /// only valid for dave's leaf, so calling as a *different* address (even a real group member)
    /// with someone else's proof reverts InvalidProof.
    function test_TC1_ProofIsBoundToCallerNotAParameter() public {
        vm.prank(dave);
        vm.expectRevert(ChaupalSeals.InvalidProof.selector);
        seals.claim(groupA, proofsA[0]); // alice's proof, called by dave
    }

    function test_TC1_UnrelatedAddressCannotClaimWithSomeoneElsesProof() public {
        address mallory = makeAddr("mallory");
        vm.prank(mallory);
        vm.expectRevert(ChaupalSeals.InvalidProof.selector);
        seals.claim(groupA, proofsA[0]);
    }

    // -----------------------------------------------------------------
    // TC2: groupId included in leaf preimage / root-copy attack
    // -----------------------------------------------------------------

    function test_TC2_RootCopyAttackFails() public {
        // Steward B copies group A's root verbatim into group B.
        vm.prank(stewardB);
        seals.updateRoot(groupB, rootA, new address[](0));

        // Alice is a genuine member of group A with a valid proof there...
        vm.prank(alice);
        seals.claim(groupA, proofsA[0]);

        // ...but the same proof must not let her claim a seal in group B, even though group B's
        // root is now bit-for-bit identical to group A's. This only holds because groupId is
        // folded into the leaf preimage.
        vm.prank(alice);
        vm.expectRevert(ChaupalSeals.InvalidProof.selector);
        seals.claim(groupB, proofsA[0]);
    }

    function test_TC2_LeafForDiffersAcrossGroupsForSameMember() public view {
        bytes32 leafInA = seals.leafFor(groupA, alice);
        bytes32 leafInB = seals.leafFor(groupB, alice);
        assertTrue(leafInA != leafInB);
    }

    // -----------------------------------------------------------------
    // TC3: only a group's own steward can write its root; 2-step handoff
    // -----------------------------------------------------------------

    function test_TC3_NonStewardCannotSetRoot() public {
        vm.prank(bob);
        vm.expectRevert(ChaupalSeals.NotSteward.selector);
        seals.updateRoot(groupA, bytes32(uint256(1)), new address[](0));
    }

    function test_TC3_OtherGroupsStewardCannotSetThisGroupsRoot() public {
        vm.prank(stewardB);
        vm.expectRevert(ChaupalSeals.NotSteward.selector);
        seals.updateRoot(groupA, bytes32(uint256(1)), new address[](0));
    }

    function test_TC3_StewardshipHandoffIsTwoStep() public {
        address newSteward = makeAddr("newStewardA");

        vm.prank(stewardA);
        seals.transferStewardship(groupA, newSteward);

        // Old steward can still act until the handoff is accepted.
        vm.prank(stewardA);
        seals.updateRoot(groupA, rootA, new address[](0));

        // The pending steward cannot act before accepting.
        vm.prank(newSteward);
        vm.expectRevert(ChaupalSeals.NotSteward.selector);
        seals.updateRoot(groupA, rootA, new address[](0));

        vm.prank(newSteward);
        seals.acceptStewardship(groupA);

        // Old steward has now lost the role.
        vm.prank(stewardA);
        vm.expectRevert(ChaupalSeals.NotSteward.selector);
        seals.updateRoot(groupA, rootA, new address[](0));

        // New steward can act.
        vm.prank(newSteward);
        seals.updateRoot(groupA, rootA, new address[](0));
    }

    function test_TC3_OnlyPendingStewardCanAccept() public {
        address newSteward = makeAddr("newStewardA");
        vm.prank(stewardA);
        seals.transferStewardship(groupA, newSteward);

        vm.prank(bob);
        vm.expectRevert(ChaupalSeals.NotPendingSteward.selector);
        seals.acceptStewardship(groupA);
    }

    // -----------------------------------------------------------------
    // TC4: proof verified against the stored root, not a parameter
    // -----------------------------------------------------------------

    function test_TC4_RootUpdateInvalidatesOldProofs() public {
        // Rebuild group A's tree without frank (frank "left").
        address[] memory remaining = new address[](3);
        remaining[0] = alice;
        remaining[1] = dave;
        remaining[2] = eve;
        // pad to a power of two with a filler address so the helper's precondition holds
        address filler = makeAddr("fillerA");
        address[] memory membersV2 = new address[](4);
        membersV2[0] = alice;
        membersV2[1] = dave;
        membersV2[2] = eve;
        membersV2[3] = filler;
        (bytes32 rootV2,) = MerkleTestHelper.buildTreeForGroup(groupA, membersV2);

        vm.prank(stewardA);
        seals.updateRoot(groupA, rootV2, new address[](0));

        // Frank's old proof (valid against rootA) must fail against the new stored root.
        vm.prank(frank);
        vm.expectRevert(ChaupalSeals.InvalidProof.selector);
        seals.claim(groupA, proofsA[3]);
    }

    function test_TC4_ClaimHasNoRootParameter() public view {
        // Static assertion that the ABI has no way to pass a root at all: claim(groupId, proof).
        // If this ever grows a root/member parameter, this selector changes and the test fails
        // to compile/hash-match, flagging a design regression.
        bytes4 expected = bytes4(keccak256("claim(uint256,bytes32[])"));
        assertEq(ChaupalSeals.claim.selector, expected);
    }

    function test_TC4_RootNotSetReverts() public {
        vm.prank(stewardA);
        uint256 freshGroup = seals.registerGroup("Fresh Group");

        vm.prank(alice);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.expectRevert(ChaupalSeals.RootNotSet.selector);
        seals.claim(freshGroup, emptyProof);
    }

    // -----------------------------------------------------------------
    // TC5: second claim by the same member reverts; revoke-with-root
    // -----------------------------------------------------------------

    function test_TC5_SecondClaimReverts() public {
        vm.prank(alice);
        seals.claim(groupA, proofsA[0]);

        vm.prank(alice);
        vm.expectRevert(ChaupalSeals.AlreadyClaimed.selector);
        seals.claim(groupA, proofsA[0]);
    }

    function test_TC5_RenounceThenReclaimWorks() public {
        vm.prank(alice);
        seals.claim(groupA, proofsA[0]);
        uint256 tokenId = seals.sealOf(groupA, alice);

        vm.prank(alice);
        seals.renounceSeal(groupA);

        assertEq(seals.sealOf(groupA, alice), 0);
        vm.expectPartialRevert(IERC721Errors.ERC721NonexistentToken.selector);
        seals.ownerOf(tokenId);

        // Root is unchanged and alice's leaf is still valid, so she can reclaim (gets a new
        // token id; the old one stays burned forever).
        vm.prank(alice);
        seals.claim(groupA, proofsA[0]);
        uint256 newTokenId = seals.sealOf(groupA, alice);
        assertTrue(newTokenId != tokenId);
        assertEq(seals.ownerOf(newTokenId), alice);
    }

    function test_TC5_RevokeWithRootBurnsSealAndBlocksOldProof() public {
        vm.prank(alice);
        seals.claim(groupA, proofsA[0]);
        uint256 tokenId = seals.sealOf(groupA, alice);

        // Frank also claims, so the revoke-with-root only affects alice.
        vm.prank(frank);
        seals.claim(groupA, proofsA[3]);

        // Steward publishes a new root (alice removed) and lists her as a leaver in the same tx.
        address filler = makeAddr("fillerA2");
        address[] memory membersV2 = new address[](4);
        membersV2[0] = dave;
        membersV2[1] = eve;
        membersV2[2] = frank;
        membersV2[3] = filler;
        (bytes32 rootV2,) = MerkleTestHelper.buildTreeForGroup(groupA, membersV2);

        address[] memory leavers = new address[](1);
        leavers[0] = alice;

        vm.prank(stewardA);
        vm.expectEmit(true, true, true, true);
        emit ChaupalSeals.SealRevoked(groupA, alice, tokenId);
        seals.updateRoot(groupA, rootV2, leavers);

        // The seal is burned and the mapping is cleared.
        assertEq(seals.sealOf(groupA, alice), 0);
        vm.expectPartialRevert(IERC721Errors.ERC721NonexistentToken.selector);
        seals.ownerOf(tokenId);

        // Her old proof (against the old root) is now doubly invalid: wrong root AND she'd need
        // a fresh AlreadyClaimed check to even pass — but the root check fails first.
        vm.prank(alice);
        vm.expectRevert(ChaupalSeals.InvalidProof.selector);
        seals.claim(groupA, proofsA[0]);

        // Frank's still-current seal is untouched by the revoke of alice.
        assertEq(seals.ownerOf(seals.sealOf(groupA, frank)), frank);
    }

    function test_TC5_RejoinUnderNewRootWorks() public {
        vm.prank(alice);
        seals.claim(groupA, proofsA[0]);

        address[] memory leavers = new address[](1);
        leavers[0] = alice;
        address filler = makeAddr("fillerA3");
        address[] memory membersV2 = new address[](4);
        membersV2[0] = dave;
        membersV2[1] = eve;
        membersV2[2] = frank;
        membersV2[3] = filler;
        (bytes32 rootV2,) = MerkleTestHelper.buildTreeForGroup(groupA, membersV2);

        vm.prank(stewardA);
        seals.updateRoot(groupA, rootV2, leavers);

        // Alice rejoins: a third tree that includes her again.
        address[] memory membersV3 = new address[](4);
        membersV3[0] = alice;
        membersV3[1] = dave;
        membersV3[2] = eve;
        membersV3[3] = frank;
        (bytes32 rootV3, bytes32[][] memory proofsV3) = MerkleTestHelper.buildTreeForGroup(groupA, membersV3);

        vm.prank(stewardA);
        seals.updateRoot(groupA, rootV3, new address[](0));

        vm.prank(alice);
        seals.claim(groupA, proofsV3[0]);
        assertEq(seals.ownerOf(seals.sealOf(groupA, alice)), alice);
    }

    function test_RenounceByNonHolderReverts() public {
        vm.prank(alice);
        vm.expectRevert(ChaupalSeals.NotSealHolder.selector);
        seals.renounceSeal(groupA);
    }

    // -----------------------------------------------------------------
    // TC6: seal cannot be transferred (soulbound)
    // -----------------------------------------------------------------

    function test_TC6_TransferFromReverts() public {
        vm.prank(alice);
        seals.claim(groupA, proofsA[0]);
        uint256 tokenId = seals.sealOf(groupA, alice);

        vm.prank(alice);
        vm.expectRevert(ChaupalSeals.Soulbound.selector);
        seals.transferFrom(alice, dave, tokenId);
    }

    function test_TC6_SafeTransferFromReverts() public {
        vm.prank(alice);
        seals.claim(groupA, proofsA[0]);
        uint256 tokenId = seals.sealOf(groupA, alice);

        vm.prank(alice);
        vm.expectRevert(ChaupalSeals.Soulbound.selector);
        seals.safeTransferFrom(alice, dave, tokenId);
    }

    function test_TC6_ApproveReverts() public {
        vm.prank(alice);
        seals.claim(groupA, proofsA[0]);
        uint256 tokenId = seals.sealOf(groupA, alice);

        vm.prank(alice);
        vm.expectRevert(ChaupalSeals.Soulbound.selector);
        seals.approve(dave, tokenId);
    }

    function test_TC6_SetApprovalForAllReverts() public {
        vm.prank(alice);
        vm.expectRevert(ChaupalSeals.Soulbound.selector);
        seals.setApprovalForAll(dave, true);
    }

    function test_TC6_LockedReturnsTrueForHeldSeal() public {
        vm.prank(alice);
        seals.claim(groupA, proofsA[0]);
        uint256 tokenId = seals.sealOf(groupA, alice);

        assertTrue(seals.locked(tokenId));
    }

    function test_TC6_LockedRevertsForNonexistentToken() public {
        vm.expectPartialRevert(IERC721Errors.ERC721NonexistentToken.selector);
        seals.locked(999);
    }

    function test_TC6_SupportsERC5192Interface() public view {
        assertTrue(seals.supportsInterface(0xb45a3c0e));
        assertTrue(seals.supportsInterface(0x80ac58cd)); // ERC721
        assertFalse(seals.supportsInterface(0xffffffff));
    }

    // -----------------------------------------------------------------
    // Group registration / name validation (permissionless, no admin)
    // -----------------------------------------------------------------

    function test_RegisterGroupIsPermissionless() public {
        vm.prank(bob);
        uint256 gid = seals.registerGroup("Anyone Can Register");
        (, address steward,,,) = seals.groups(gid);
        assertEq(steward, bob);
    }

    function test_NameValidation_EmptyReverts() public {
        vm.expectRevert(ChaupalSeals.InvalidName.selector);
        seals.registerGroup("");
    }

    function test_NameValidation_TooLongReverts() public {
        bytes memory longName = new bytes(65);
        for (uint256 i = 0; i < 65; i++) {
            longName[i] = "a";
        }
        vm.expectRevert(ChaupalSeals.InvalidName.selector);
        seals.registerGroup(string(longName));
    }

    function test_NameValidation_ExactlyMaxLengthSucceeds() public {
        bytes memory maxName = new bytes(64);
        for (uint256 i = 0; i < 64; i++) {
            maxName[i] = "a";
        }
        seals.registerGroup(string(maxName));
    }

    function test_NameValidation_QuoteReverts() public {
        vm.expectRevert(ChaupalSeals.InvalidName.selector);
        seals.registerGroup('Bad "Name"');
    }

    function test_NameValidation_BackslashReverts() public {
        vm.expectRevert(ChaupalSeals.InvalidName.selector);
        seals.registerGroup("Bad\\Name");
    }

    function test_NameValidation_ControlCharReverts() public {
        vm.expectRevert(ChaupalSeals.InvalidName.selector);
        seals.registerGroup("Bad\nName");
    }

    function test_NameValidation_UnicodeNameSucceeds() public {
        // Devanagari and other non-ASCII UTF-8 must be allowed.
        uint256 gid = seals.registerGroup(unicode"नागरिक समूह");
        (string memory name,,,,) = seals.groups(gid);
        assertEq(name, unicode"नागरिक समूह");
    }

    function testFuzz_NameValidation_ControlBytesRejected(uint8 rawByte) public {
        vm.assume(rawByte < 0x20 || rawByte == 0x7F || rawByte == 0x22 || rawByte == 0x5C);
        bytes memory name = new bytes(1);
        name[0] = bytes1(rawByte);
        vm.expectRevert(ChaupalSeals.InvalidName.selector);
        seals.registerGroup(string(name));
    }

    function testFuzz_RegisterGroupStewardIsCaller(address caller) public {
        vm.assume(caller != address(0));
        vm.prank(caller);
        uint256 gid = seals.registerGroup("Fuzzed Group");
        (, address steward,,,) = seals.groups(gid);
        assertEq(steward, caller);
    }

    // -----------------------------------------------------------------
    // Fuzz: claiming without a genuinely valid proof always reverts
    // -----------------------------------------------------------------

    function testFuzz_ClaimWithGarbageProofReverts(address member, bytes32 garbage) public {
        vm.assume(member != alice && member != dave && member != eve && member != frank);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = garbage;

        vm.prank(member);
        vm.expectRevert(ChaupalSeals.InvalidProof.selector);
        seals.claim(groupA, proof);
    }

    function testFuzz_DoubleClaimAlwaysReverts(uint8 memberSeed) public {
        address[4] memory members = [alice, dave, eve, frank];
        uint256 i = memberSeed % 4;
        address member = members[i];

        vm.prank(member);
        seals.claim(groupA, proofsA[i]);

        vm.prank(member);
        vm.expectRevert(ChaupalSeals.AlreadyClaimed.selector);
        seals.claim(groupA, proofsA[i]);
    }

    // -----------------------------------------------------------------
    // Gas-sane bounds on leavers
    // -----------------------------------------------------------------

    function test_TooManyLeaversReverts() public {
        address[] memory leavers = new address[](seals.MAX_LEAVERS_PER_UPDATE() + 1);
        for (uint256 i = 0; i < leavers.length; i++) {
            leavers[i] = address(uint160(i + 1));
        }

        vm.prank(stewardA);
        vm.expectRevert(ChaupalSeals.TooManyLeavers.selector);
        seals.updateRoot(groupA, rootA, leavers);
    }

    function test_MaxLeaversUpdateIsGasSane() public {
        // Build a 256-member group, claim MAX_LEAVERS_PER_UPDATE (200) of them, then revoke all
        // 200 in a single updateRoot call and assert the gas used stays within a sane bound.
        uint256 n = 256;
        address[] memory members = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            members[i] = address(uint160(0x10000 + i));
        }

        vm.prank(stewardA);
        uint256 bigGroup = seals.registerGroup("Big Group");

        (bytes32 root, bytes32[][] memory proofs) = MerkleTestHelper.buildTreeForGroup(bigGroup, members);

        vm.prank(stewardA);
        seals.updateRoot(bigGroup, root, new address[](0));

        uint256 claimCount = seals.MAX_LEAVERS_PER_UPDATE();
        for (uint256 i = 0; i < claimCount; i++) {
            vm.prank(members[i]);
            seals.claim(bigGroup, proofs[i]);
        }

        address[] memory leavers = new address[](claimCount);
        for (uint256 i = 0; i < claimCount; i++) {
            leavers[i] = members[i];
        }

        uint256 gasBefore = gasleft();
        vm.prank(stewardA);
        seals.updateRoot(bigGroup, bytes32(uint256(0xdead)), leavers);
        uint256 gasUsed = gasBefore - gasleft();

        // Sane upper bound: well under a single Base Sepolia block's gas limit, with generous
        // headroom over the ~200 SSTORE-heavy burns this performs.
        assertLt(gasUsed, 10_000_000);

        for (uint256 i = 0; i < claimCount; i++) {
            assertEq(seals.sealOf(bigGroup, members[i]), 0);
        }
    }
}
