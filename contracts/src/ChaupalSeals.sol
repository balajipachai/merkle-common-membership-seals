// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { Base64 } from "@openzeppelin/contracts/utils/Base64.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { IERC5192 } from "./interfaces/IERC5192.sol";

/// @title ChaupalSeals
/// @notice Soulbound (ERC721 + ERC5192) membership seals for Chaupal's twelve independent
///         community groups. Each group publishes only a Merkle root of its own member list;
///         a member proves inclusion against that root and receives a non-transferable seal.
///
/// @dev Deliberately has NO global owner, admin, or role of any kind. Every group is
///      permissionlessly registered and is governed solely by its own steward (a per-group,
///      2-step-transferable address). No function in this contract can affect more than one
///      group's `root`, `steward`, or seals in a single call except `updateRoot`'s bounded
///      leaver-burn, which only ever touches seals of the group whose root is being updated.
///
///      Leaf design: `keccak256(bytes.concat(keccak256(abi.encode(groupId, member))))`. This
///      matches the `StandardMerkleTree.of(values, ["uint256","address"])` double-hash
///      construction from OpenZeppelin's merkle-tree npm package exactly. Including `groupId`
///      in the leaf preimage is load
///      bearing: without it, a steward who copies another group's root verbatim would let every
///      member of that other group claim a seal in theirs (a "root-copy attack"). With groupId
///      folded into the leaf, a copied root verifies against leaves that were never computed for
///      the copying group, so no proof exists for them there.
contract ChaupalSeals is ERC721, IERC5192 {
    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error InvalidName();
    error NotSteward();
    error NotPendingSteward();
    error ZeroAddress();
    error RootNotSet();
    error AlreadyClaimed();
    error InvalidProof();
    error NotSealHolder();
    error Soulbound();
    error TooManyLeavers();

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct Group {
        string name;
        address steward;
        address pendingSteward;
        bytes32 root;
        uint64 rootVersion;
    }

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @notice Upper bound on `leavers.length` per `updateRoot` call, to keep the burn loop's
    /// gas cost bounded and predictable regardless of how large a group's membership grows.
    uint256 public constant MAX_LEAVERS_PER_UPDATE = 200;

    /// @notice Maximum byte length of a group name (JSON- and gas-friendly bound).
    uint256 public constant MAX_NAME_LENGTH = 64;

    /// @dev EIP-5192 interface id: 0xb45a3c0e.
    bytes4 private constant _ERC5192_INTERFACE_ID = 0xb45a3c0e;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice groupId => Group. groupId 0 is never assigned (nextGroupId starts at 1), so
    /// `groups[0].steward == address(0)` doubles as a "group does not exist" sentinel.
    mapping(uint256 groupId => Group) public groups;

    /// @notice groupId => member => tokenId (0 means the member does not currently hold a seal
    /// in this group; token ids start at 1).
    mapping(uint256 groupId => mapping(address member => uint256 tokenId)) public sealOf;

    /// @notice tokenId => groupId the seal belongs to.
    mapping(uint256 tokenId => uint256 groupId) public groupOfSeal;

    uint256 public nextGroupId = 1;
    uint256 public nextTokenId = 1;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event GroupRegistered(uint256 indexed groupId, address indexed steward, string name);
    event RootUpdated(uint256 indexed groupId, bytes32 newRoot, uint64 rootVersion);
    event SealClaimed(uint256 indexed groupId, address indexed member, uint256 indexed tokenId);
    event SealRevoked(uint256 indexed groupId, address indexed member, uint256 indexed tokenId);
    event SealRenounced(uint256 indexed groupId, address indexed member, uint256 indexed tokenId);
    event StewardshipTransferStarted(
        uint256 indexed groupId, address indexed currentSteward, address indexed pendingSteward
    );
    event StewardshipTransferred(uint256 indexed groupId, address indexed previousSteward, address indexed newSteward);

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlySteward(uint256 groupId) {
        if (msg.sender != groups[groupId].steward) revert NotSteward();
        _;
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor() ERC721("Chaupal Seal", "SEAL") { }

    // ---------------------------------------------------------------------
    // Group lifecycle (permissionless; no admin anywhere)
    // ---------------------------------------------------------------------

    /// @notice Registers a new group. The caller becomes its steward. Permissionless: anyone
    /// may register any number of groups, which is why the app curates a display allowlist
    /// off-chain (`NEXT_PUBLIC_CHAUPAL_GROUP_IDS`) rather than trusting on-chain registration
    /// order or count.
    function registerGroup(string calldata name) external returns (uint256 groupId) {
        if (!_isValidName(name)) revert InvalidName();

        groupId = nextGroupId++;
        Group storage g = groups[groupId];
        g.name = name;
        g.steward = msg.sender;

        emit GroupRegistered(groupId, msg.sender, name);
    }

    /// @notice Publishes a new Merkle root for `groupId` and, in the same transaction, burns
    /// the seals of every address in `leavers` that currently holds one in this group. Only
    /// callable by that group's own steward — never a global admin, never another group's
    /// steward.
    /// @param leavers Addresses to revoke in this same tx. Addresses that do not currently hold
    /// a seal in this group are silently skipped (the caller may over-list defensively).
    function updateRoot(uint256 groupId, bytes32 newRoot, address[] calldata leavers) external onlySteward(groupId) {
        if (leavers.length > MAX_LEAVERS_PER_UPDATE) revert TooManyLeavers();

        Group storage g = groups[groupId];
        g.root = newRoot;
        uint64 version = ++g.rootVersion;
        emit RootUpdated(groupId, newRoot, version);

        for (uint256 i = 0; i < leavers.length; i++) {
            address leaver = leavers[i];
            uint256 tokenId = sealOf[groupId][leaver];
            if (tokenId == 0) continue;

            delete sealOf[groupId][leaver];
            delete groupOfSeal[tokenId];
            _burn(tokenId);

            emit SealRevoked(groupId, leaver, tokenId);
        }
    }

    /// @notice Step 1 of a 2-step stewardship handoff for `groupId`. Only the current steward
    /// may call this.
    function transferStewardship(uint256 groupId, address newSteward) external onlySteward(groupId) {
        if (newSteward == address(0)) revert ZeroAddress();
        groups[groupId].pendingSteward = newSteward;
        emit StewardshipTransferStarted(groupId, msg.sender, newSteward);
    }

    /// @notice Step 2: the pending steward accepts, completing the handoff. Using a 2-step
    /// handoff (rather than a single `transferStewardship` that takes effect immediately)
    /// prevents a group's stewardship from being stranded at a typo'd or otherwise unreachable
    /// address — the same reasoning that motivates `Ownable2Step` over plain `Ownable`.
    function acceptStewardship(uint256 groupId) external {
        Group storage g = groups[groupId];
        if (msg.sender != g.pendingSteward) revert NotPendingSteward();

        address previous = g.steward;
        g.steward = msg.sender;
        g.pendingSteward = address(0);

        emit StewardshipTransferred(groupId, previous, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Claiming
    // ---------------------------------------------------------------------

    /// @notice Claims a seal in `groupId` for `msg.sender`, proving membership against the
    /// group's currently stored root.
    /// @dev Order of checks matches the spec exactly:
    ///  1. The stored root must be non-zero (read from storage; there is no root parameter, so
    ///     a caller cannot supply their own root).
    ///  2. The caller must not already hold a seal in this group.
    ///  3. The leaf is derived HERE, from `msg.sender` and `groupId` — never taken from a
    ///     parameter — so a proof can only ever be used by the address it was issued for.
    ///  4. The Merkle proof is verified against the stored root.
    /// Effects (state writes) happen before the `_mint` interaction (CEI).
    function claim(uint256 groupId, bytes32[] calldata proof) external {
        Group storage g = groups[groupId];
        bytes32 root = g.root;
        if (root == bytes32(0)) revert RootNotSet();

        if (sealOf[groupId][msg.sender] != 0) revert AlreadyClaimed();

        bytes32 leaf = _leafFor(groupId, msg.sender);
        if (!MerkleProof.verifyCalldata(proof, root, leaf)) revert InvalidProof();

        uint256 tokenId = nextTokenId++;
        sealOf[groupId][msg.sender] = tokenId;
        groupOfSeal[tokenId] = groupId;

        _mint(msg.sender, tokenId);

        emit SealClaimed(groupId, msg.sender, tokenId);
        emit Locked(tokenId);
    }

    /// @notice Lets a member voluntarily burn their own seal (e.g. leaving a group of their own
    /// accord, independent of a steward-driven `updateRoot` revocation).
    function renounceSeal(uint256 groupId) external {
        uint256 tokenId = sealOf[groupId][msg.sender];
        if (tokenId == 0) revert NotSealHolder();

        delete sealOf[groupId][msg.sender];
        delete groupOfSeal[tokenId];
        _burn(tokenId);

        emit SealRenounced(groupId, msg.sender, tokenId);
    }

    // ---------------------------------------------------------------------
    // Views / tooling parity
    // ---------------------------------------------------------------------

    /// @notice Public pure helper exposing the exact leaf formula, so off-chain tooling
    /// (`lib/membership`, tests) can assert byte-for-byte parity with the tree it builds.
    /// `claim` itself never calls this — it derives the leaf directly from `msg.sender` inline,
    /// so there is no way to pass an arbitrary member address into the verified leaf.
    function leafFor(uint256 groupId, address member) external pure returns (bytes32) {
        return _leafFor(groupId, member);
    }

    function _leafFor(uint256 groupId, address member) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(groupId, member))));
    }

    function _isValidName(string calldata name) internal pure returns (bool) {
        bytes calldata b = bytes(name);
        uint256 length = b.length;
        if (length == 0 || length > MAX_NAME_LENGTH) return false;

        for (uint256 i = 0; i < length; i++) {
            bytes1 c = b[i];
            // Reject ASCII control characters (incl. DEL) and JSON-unsafe quote/backslash.
            // UTF-8 continuation/lead bytes (>= 0x80) are allowed, so e.g. Devanagari passes.
            if (c < 0x20 || c == 0x7F) return false;
            if (c == 0x22 || c == 0x5C) return false;
        }
        return true;
    }

    // ---------------------------------------------------------------------
    // Soulbound enforcement (ERC5192)
    // ---------------------------------------------------------------------

    /// @notice A seal is locked from the moment it is minted until it is burned.
    /// @dev Reverts for a token that doesn't (or no longer) exists, matching `ownerOf` semantics.
    function locked(uint256 tokenId) external view override returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    /// @dev The single hook ERC721 routes every transfer, mint and burn through. Mint
    /// (`from == 0`) and burn (`to == 0`) are both allowed; only address-to-address transfers
    /// (`from != 0 && to != 0`) are rejected. This is what makes the seal soulbound at the root,
    /// rather than merely hiding transfer entry points.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    /// @notice Always reverts: a soulbound seal has nothing to approve, since it can never be
    /// moved by anyone, including its own holder.
    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    /// @notice Always reverts, for the same reason as `approve`.
    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == _ERC5192_INTERFACE_ID || super.supportsInterface(interfaceId);
    }

    // ---------------------------------------------------------------------
    // Metadata
    // ---------------------------------------------------------------------

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        uint256 groupId = groupOfSeal[tokenId];
        string memory name = groups[groupId].name;

        // Group names are validated at registration to exclude `"` and `\`, so they are safe
        // to interpolate directly into this JSON literal without separate escaping.
        bytes memory json = abi.encodePacked(
            '{"name":"Chaupal Seal - ',
            name,
            '","description":"Soulbound membership seal for a Chaupal community group.",',
            '"attributes":[{"trait_type":"groupId","value":"',
            Strings.toString(groupId),
            '"},{"trait_type":"transferable","value":"false"}]}'
        );

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(json)));
    }
}
