// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";

import {AgentTreasury} from "../src/AgentTreasury.sol";
import {CampaignFactory} from "../src/CampaignFactory.sol";
import {ConversionRegistry} from "../src/ConversionRegistry.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {PerformanceOracle} from "../src/PerformanceOracle.sol";

contract DeployMonadTestnet is Script {
    function run()
        external
        returns (
            MockUSDC token,
            PerformanceOracle oracle,
            ConversionRegistry registry,
            CampaignFactory factory,
            AgentTreasury treasury
        )
    {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address reporter = vm.envAddress("PERFORMANCE_REPORTER_ADDRESS");

        vm.startBroadcast();
        token = new MockUSDC();
        oracle = new PerformanceOracle(deployer);
        oracle.setReporter(reporter, true);
        registry = new ConversionRegistry();
        oracle.setConversionRegistry(registry, true);
        factory = new CampaignFactory();
        treasury = new AgentTreasury(deployer, 2_500);
        vm.stopBroadcast();
    }
}
