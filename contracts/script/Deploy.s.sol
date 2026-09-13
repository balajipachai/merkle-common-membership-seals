// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { ChaupalSeals } from "../src/ChaupalSeals.sol";

/// @notice Deploys ChaupalSeals. No group is registered here - registration is permissionless
/// and happens per-steward through the /steward app after deployment.
///
/// Local / CI usage (anvil, unlocked account - no private key ever touches a file):
///   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8547 \
///     --unlocked --sender <anvil account> --broadcast
///
/// Base Sepolia usage (see NOTES-FOR-REVIEW.md for the full runbook - the orchestrator runs
/// this with the user, never with a key read from a file or env var):
///   cast wallet import chaupal-deployer --interactive
///   forge script script/Deploy.s.sol --account chaupal-deployer \
///     --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
contract Deploy is Script {
    function run() external returns (ChaupalSeals seals) {
        vm.startBroadcast();
        seals = new ChaupalSeals();
        vm.stopBroadcast();

        console2.log("ChaupalSeals deployed at:", address(seals));
    }
}
