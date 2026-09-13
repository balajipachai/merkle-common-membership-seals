// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MerkleTestHelper
/// @notice Builds a perfectly-balanced Merkle tree (leaf count must be a power of two) using the
/// same sorted-pair keccak256 hashing OpenZeppelin's `MerkleProof.verify` expects, so Foundry
/// tests can construct roots and proofs without depending on the JS tree-building tooling.
/// @dev This is a *test-only* helper. The real off-chain source of truth for tree construction is
/// `lib/membership` (TypeScript), which wraps the `StandardMerkleTree` builder from
/// OpenZeppelin's merkle-tree npm package and supports arbitrary (non-power-of-two) leaf counts.
/// `test/unit` checks its leaves against `StandardMerkleTree`, and `test/e2e` asserts leaf parity
/// against the deployed contract's `leafFor`; this helper only needs to agree with the
/// contract's pair-hashing, which for a balanced tree it does exactly.
library MerkleTestHelper {
    function leafFor(uint256 groupId, address member) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(groupId, member))));
    }

    function hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    /// @notice Builds a tree over `leaves` (length must be a power of two, >= 1) and returns the
    /// root plus a proof array per leaf index.
    function buildTree(bytes32[] memory leaves) internal pure returns (bytes32 root, bytes32[][] memory proofs) {
        uint256 n = leaves.length;
        require(n > 0 && (n & (n - 1)) == 0, "MerkleTestHelper: leaf count must be a power of two");

        uint256 depth = 0;
        {
            uint256 t = n;
            while (t > 1) {
                t >>= 1;
                depth++;
            }
        }

        // levels[0] = leaves, levels[depth] = [root]
        bytes32[][] memory levels = new bytes32[][](depth + 1);
        levels[0] = leaves;
        for (uint256 d = 0; d < depth; d++) {
            uint256 len = levels[d].length;
            bytes32[] memory next = new bytes32[](len / 2);
            for (uint256 i = 0; i < len / 2; i++) {
                next[i] = hashPair(levels[d][2 * i], levels[d][2 * i + 1]);
            }
            levels[d + 1] = next;
        }
        root = levels[depth][0];

        proofs = new bytes32[][](n);
        for (uint256 i = 0; i < n; i++) {
            proofs[i] = new bytes32[](depth);
            uint256 idx = i;
            for (uint256 d = 0; d < depth; d++) {
                uint256 sibling = idx ^ 1;
                proofs[i][d] = levels[d][sibling];
                idx >>= 1;
            }
        }
    }

    /// @notice Convenience: builds leaves for `(groupId, members[i])` and returns the tree.
    function buildTreeForGroup(uint256 groupId, address[] memory members)
        internal
        pure
        returns (bytes32 root, bytes32[][] memory proofs)
    {
        bytes32[] memory leaves = new bytes32[](members.length);
        for (uint256 i = 0; i < members.length; i++) {
            leaves[i] = leafFor(groupId, members[i]);
        }
        return buildTree(leaves);
    }
}
