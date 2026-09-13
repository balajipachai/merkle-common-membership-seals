// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC5192 - Minimal Soulbound NFT interface
/// @notice OpenZeppelin Contracts 5.6.1 ships no IERC5192, so it is declared locally here.
/// @dev interfaceId = 0xb45a3c0e (computed as the XOR of the two selectors below).
interface IERC5192 {
    /// @notice Emitted when a token is locked (made non-transferable).
    event Locked(uint256 tokenId);

    /// @notice Emitted when a token is unlocked (made transferable again). Never emitted by
    /// a permanently soulbound implementation, but part of the interface contract.
    event Unlocked(uint256 tokenId);

    /// @notice Returns whether `tokenId` is locked (non-transferable).
    /// @dev Must revert for a token that does not exist, matching ERC721's `ownerOf` behavior.
    function locked(uint256 tokenId) external view returns (bool);
}
