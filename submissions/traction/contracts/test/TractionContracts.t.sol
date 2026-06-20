// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {AgentTreasury} from "../src/AgentTreasury.sol";
import {CampaignFactory} from "../src/CampaignFactory.sol";
import {ConversionRegistry} from "../src/ConversionRegistry.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {PerformanceEscrow} from "../src/PerformanceEscrow.sol";
import {PerformanceOracle} from "../src/PerformanceOracle.sol";

contract TractionContractsTest is Test {
    uint256 internal constant UNIT = 1e6;
    address internal constant REPORTER = address(0xBEEF);
    address internal constant BENEFICIARY = address(0xA11CE);
    address internal constant CONVERTER = address(0xC0FFEE);

    MockUSDC internal token;
    PerformanceOracle internal oracle;
    CampaignFactory internal factory;
    ConversionRegistry internal registry;

    function setUp() public {
        token = new MockUSDC();
        oracle = new PerformanceOracle(address(this));
        factory = new CampaignFactory();
        registry = new ConversionRegistry();
        oracle.setReporter(REPORTER, true);
        oracle.setConversionRegistry(registry, true);
        token.mint(address(this), 10_000 * UNIT);
        token.approve(address(factory), type(uint256).max);
    }

    function createCampaign() internal returns (PerformanceEscrow escrow) {
        uint128[] memory thresholds = new uint128[](3);
        thresholds[0] = 10;
        thresholds[1] = 50;
        thresholds[2] = 100;
        uint128[] memory bonuses = new uint128[](3);
        bonuses[0] = uint128(20 * UNIT);
        bonuses[1] = uint128(30 * UNIT);
        bonuses[2] = uint128(40 * UNIT);

        (, escrow) = factory.createCampaign(
            BENEFICIARY,
            token,
            oracle,
            100 * UNIT,
            10 * UNIT,
            uint64(block.timestamp + 7 days),
            thresholds,
            bonuses,
            keccak256("terms-v1")
        );
    }

    function testCreateCampaignFundsEscrow() public {
        PerformanceEscrow escrow = createCampaign();
        assertEq(token.balanceOf(address(escrow)), 100 * UNIT);
        assertEq(uint256(escrow.state()), uint256(PerformanceEscrow.State.Funded));
        assertTrue(factory.isCampaign(address(escrow)));
    }

    function testSettlementPaysBaseAndReachedTiersThenRefundsRemainder() public {
        PerformanceEscrow escrow = createCampaign();
        uint256 creatorBefore = token.balanceOf(address(this));

        vm.prank(REPORTER);
        oracle.commitPerformance(address(escrow), 50, keccak256("evidence"), true);
        escrow.settle();

        assertEq(token.balanceOf(BENEFICIARY), 60 * UNIT);
        assertEq(token.balanceOf(address(this)), creatorBefore + 40 * UNIT);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(uint256(escrow.state()), uint256(PerformanceEscrow.State.Settled));
    }

    function testCannotSettleWithoutFinalizedPerformance() public {
        PerformanceEscrow escrow = createCampaign();
        vm.expectRevert(PerformanceEscrow.PerformanceNotFinalized.selector);
        escrow.settle();
    }

    function testCannotSettleTwice() public {
        PerformanceEscrow escrow = createCampaign();
        vm.prank(REPORTER);
        oracle.commitPerformance(address(escrow), 100, keccak256("evidence"), true);
        escrow.settle();

        vm.expectRevert(PerformanceEscrow.InvalidState.selector);
        escrow.settle();
    }

    function testOnlyAuthorizedReporterCanCommit() public {
        PerformanceEscrow escrow = createCampaign();
        vm.expectRevert(PerformanceOracle.UnauthorizedReporter.selector);
        oracle.commitPerformance(address(escrow), 1, bytes32("evidence"), false);
    }

    function testOracleRejectsReplayAndDecreasingScore() public {
        PerformanceEscrow escrow = createCampaign();
        vm.startPrank(REPORTER);
        oracle.commitPerformance(address(escrow), 50, bytes32("first"), false);
        vm.expectRevert(PerformanceOracle.ScoreMustBeMonotonic.selector);
        oracle.commitPerformance(address(escrow), 49, bytes32("lower"), false);
        oracle.commitPerformance(address(escrow), 50, bytes32("final"), true);
        vm.expectRevert(PerformanceOracle.PerformanceAlreadyFinalized.selector);
        oracle.commitPerformance(address(escrow), 51, bytes32("replay"), true);
        vm.stopPrank();
    }

    function testCreatorCanRefundAfterExpiry() public {
        PerformanceEscrow escrow = createCampaign();
        uint256 creatorBefore = token.balanceOf(address(this));
        vm.warp(escrow.expiry() + 1);
        escrow.refundExpired();

        assertEq(token.balanceOf(address(this)), creatorBefore + 100 * UNIT);
        assertEq(uint256(escrow.state()), uint256(PerformanceEscrow.State.Refunded));
    }

    function testCannotRefundBeforeExpiry() public {
        PerformanceEscrow escrow = createCampaign();
        vm.expectRevert(PerformanceEscrow.NotExpired.selector);
        escrow.refundExpired();
    }

    function testInsufficientAllowancePreventsCampaignCreation() public {
        token.approve(address(factory), 0);
        vm.expectRevert();
        createCampaign();
        assertEq(factory.campaignCount(), 0);
    }

    function testFuzzTierBoundaries(uint256 score) public {
        score = bound(score, 0, 1_000);
        PerformanceEscrow escrow = createCampaign();
        uint256 expected = 10 * UNIT;
        if (score >= 10) expected += 20 * UNIT;
        if (score >= 50) expected += 30 * UNIT;
        if (score >= 100) expected += 40 * UNIT;
        assertEq(escrow.quotePayout(score), expected);
    }

    function testTreasuryReinvestmentIsCapped() public {
        AgentTreasury treasury = new AgentTreasury(address(this), 2_500);
        token.mint(address(treasury), 100 * UNIT);
        treasury.reinvest(token, BENEFICIARY, 25 * UNIT);
        assertEq(token.balanceOf(BENEFICIARY), 25 * UNIT);

        vm.expectRevert(AgentTreasury.ReinvestmentCapExceeded.selector);
        treasury.reinvest(token, BENEFICIARY, 19 * UNIT);
    }

    function testWalletConversionIsUniqueAndValueIsForwarded() public {
        PerformanceEscrow escrow = createCampaign();
        registry.configureCampaign(
            address(escrow),
            keccak256("creative-v1"),
            payable(BENEFICIARY),
            uint96(0.01 ether),
            uint64(block.timestamp + 1 days)
        );
        vm.deal(CONVERTER, 1 ether);
        uint256 recipientBefore = BENEFICIARY.balance;
        vm.prank(CONVERTER);
        registry.convert{value: 0.01 ether}(address(escrow));

        assertTrue(registry.hasConverted(address(escrow), CONVERTER));
        assertEq(BENEFICIARY.balance, recipientBefore + 0.01 ether);
        ConversionRegistry.CampaignConversions memory data = registry.campaignConfig(address(escrow));
        assertEq(data.count, 1);

        vm.expectRevert(ConversionRegistry.AlreadyConverted.selector);
        vm.prank(CONVERTER);
        registry.convert{value: 0.01 ether}(address(escrow));
    }

    function testConversionRequiresConfiguredEconomicMinimum() public {
        PerformanceEscrow escrow = createCampaign();
        registry.configureCampaign(
            address(escrow),
            keccak256("creative-v1"),
            payable(BENEFICIARY),
            uint96(0.01 ether),
            uint64(block.timestamp + 1 days)
        );
        vm.deal(CONVERTER, 1 ether);
        vm.expectRevert(ConversionRegistry.InsufficientConversionValue.selector);
        vm.prank(CONVERTER);
        registry.convert{value: 0.001 ether}(address(escrow));
    }

    function testFinalizedRegistryCountFeedsSettlementOracle() public {
        PerformanceEscrow escrow = createCampaign();
        registry.configureCampaign(
            address(escrow), keccak256("creative-v1"), payable(BENEFICIARY), 0, uint64(block.timestamp + 1 days)
        );
        vm.prank(CONVERTER);
        registry.convert(address(escrow));
        bytes32 evidenceHash = registry.finalize(address(escrow));

        vm.prank(REPORTER);
        oracle.commitFinalizedConversions(registry, address(escrow));
        (uint256 score, bytes32 storedEvidence, bool finalized) = oracle.finalPerformance(address(escrow));
        assertEq(score, 1);
        assertEq(storedEvidence, evidenceHash);
        assertTrue(finalized);
    }

    function testOracleRejectsUnapprovedConversionRegistry() public {
        PerformanceEscrow escrow = createCampaign();
        ConversionRegistry unapproved = new ConversionRegistry();
        vm.expectRevert(PerformanceOracle.UnauthorizedConversionRegistry.selector);
        vm.prank(REPORTER);
        oracle.commitFinalizedConversions(unapproved, address(escrow));
    }
}
