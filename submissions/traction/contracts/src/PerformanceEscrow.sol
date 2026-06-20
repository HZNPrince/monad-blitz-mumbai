// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPerformanceOracle} from "./PerformanceOracle.sol";

contract PerformanceEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State {
        AwaitingFunding,
        Funded,
        Settled,
        Refunded
    }

    struct Tier {
        uint128 threshold;
        uint128 bonus;
    }

    address public immutable factory;
    address public immutable creator;
    address public immutable beneficiary;
    IERC20 public immutable token;
    IPerformanceOracle public immutable oracle;
    uint256 public immutable maxPayout;
    uint256 public immutable baseFee;
    uint64 public immutable expiry;
    bytes32 public immutable termsHash;

    State public state;
    Tier[] private tiers;

    event CampaignFunded(uint256 amount);
    event CampaignSettled(uint256 performanceScore, bytes32 indexed evidenceHash, uint256 payout, uint256 refund);
    event CampaignRefunded(uint256 amount);

    error Unauthorized();
    error InvalidTerms();
    error InvalidState();
    error NotExpired();
    error PerformanceNotFinalized();
    error FundingMismatch();

    constructor(
        address factory_,
        address creator_,
        address beneficiary_,
        IERC20 token_,
        IPerformanceOracle oracle_,
        uint256 maxPayout_,
        uint256 baseFee_,
        uint64 expiry_,
        uint128[] memory thresholds_,
        uint128[] memory bonuses_,
        bytes32 termsHash_
    ) {
        if (
            factory_ == address(0) || creator_ == address(0) || beneficiary_ == address(0)
                || address(token_) == address(0) || address(oracle_) == address(0) || maxPayout_ == 0
                || baseFee_ > maxPayout_ || expiry_ <= block.timestamp || thresholds_.length != bonuses_.length
                || thresholds_.length > 8
        ) revert InvalidTerms();

        uint256 totalPotential = baseFee_;
        uint128 previousThreshold;
        for (uint256 index; index < thresholds_.length; ++index) {
            if (index > 0 && thresholds_[index] <= previousThreshold) {
                revert InvalidTerms();
            }
            previousThreshold = thresholds_[index];
            totalPotential += bonuses_[index];
            tiers.push(Tier(thresholds_[index], bonuses_[index]));
        }
        if (totalPotential > maxPayout_) revert InvalidTerms();

        factory = factory_;
        creator = creator_;
        beneficiary = beneficiary_;
        token = token_;
        oracle = oracle_;
        maxPayout = maxPayout_;
        baseFee = baseFee_;
        expiry = expiry_;
        termsHash = termsHash_;
    }

    function activate() external {
        if (msg.sender != factory) revert Unauthorized();
        if (state != State.AwaitingFunding) revert InvalidState();
        if (token.balanceOf(address(this)) != maxPayout) revert FundingMismatch();
        state = State.Funded;
        emit CampaignFunded(maxPayout);
    }

    function tierCount() external view returns (uint256) {
        return tiers.length;
    }

    function tier(uint256 index) external view returns (Tier memory) {
        return tiers[index];
    }

    function quotePayout(uint256 performanceScore) public view returns (uint256 payout) {
        payout = baseFee;
        for (uint256 index; index < tiers.length; ++index) {
            if (performanceScore < tiers[index].threshold) break;
            payout += tiers[index].bonus;
        }
        if (payout > maxPayout) return maxPayout;
    }

    function settle() external nonReentrant {
        if (state != State.Funded) revert InvalidState();
        (uint256 score, bytes32 evidenceHash, bool finalized) = oracle.finalPerformance(address(this));
        if (!finalized) revert PerformanceNotFinalized();

        uint256 payout = quotePayout(score);
        uint256 refund = maxPayout - payout;
        state = State.Settled;

        if (payout != 0) token.safeTransfer(beneficiary, payout);
        if (refund != 0) token.safeTransfer(creator, refund);

        emit CampaignSettled(score, evidenceHash, payout, refund);
    }

    function refundExpired() external nonReentrant {
        if (msg.sender != creator) revert Unauthorized();
        if (state != State.Funded) revert InvalidState();
        if (block.timestamp <= expiry) revert NotExpired();

        state = State.Refunded;
        token.safeTransfer(creator, maxPayout);
        emit CampaignRefunded(maxPayout);
    }
}
