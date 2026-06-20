// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IPerformanceOracle} from "./PerformanceOracle.sol";
import {PerformanceEscrow} from "./PerformanceEscrow.sol";

contract CampaignFactory {
    using SafeERC20 for IERC20;

    uint256 public campaignCount;
    mapping(uint256 campaignId => address escrow) public campaignAt;
    mapping(address escrow => bool created) public isCampaign;

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed escrow,
        address indexed creator,
        address beneficiary,
        address token,
        uint256 maxPayout,
        bytes32 termsHash
    );

    function createCampaign(
        address beneficiary,
        IERC20 token,
        IPerformanceOracle oracle,
        uint256 maxPayout,
        uint256 baseFee,
        uint64 expiry,
        uint128[] calldata thresholds,
        uint128[] calldata bonuses,
        bytes32 termsHash
    ) external returns (uint256 campaignId, PerformanceEscrow escrow) {
        escrow = new PerformanceEscrow(
            address(this),
            msg.sender,
            beneficiary,
            token,
            oracle,
            maxPayout,
            baseFee,
            expiry,
            thresholds,
            bonuses,
            termsHash
        );
        token.safeTransferFrom(msg.sender, address(escrow), maxPayout);
        escrow.activate();

        campaignId = ++campaignCount;
        campaignAt[campaignId] = address(escrow);
        isCampaign[address(escrow)] = true;

        emit CampaignCreated(campaignId, address(escrow), msg.sender, beneficiary, address(token), maxPayout, termsHash);
    }
}
