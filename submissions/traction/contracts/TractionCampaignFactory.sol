// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TractionCampaignFactory
 * @notice Factory contract for creating and managing marketing campaigns on Monad
 * @dev Tracks campaign performance and distributes rewards based on verified traction
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract TractionCampaignFactory is ERC721, Ownable, ReentrancyGuard {
    // Token for payments
    IERC20 public stablecoin;

    // Campaign structure
    struct Campaign {
        address creator;
        string productName;
        string contentHash;
        uint256 createdAt;
        uint256 fundsLocked;
        uint256 performance;
        bool settled;
        address paymentToken;
    }

    // Performance metrics
    struct PerformanceMetrics {
        uint256 impressions;
        uint256 clicks;
        uint256 conversions;
        uint256 lastUpdated;
    }

    // Mappings
    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => PerformanceMetrics) public metrics;
    mapping(address => uint256[]) public creatorCampaigns;

    // State
    uint256 public campaignCounter;
    uint256 public totalFundsLocked;
    address public oracleAddress;
    uint256 public performanceFeePercentage = 10; // 10% fee

    // Events
    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        string productName,
        uint256 fundsLocked
    );

    event PerformanceUpdated(
        uint256 indexed campaignId,
        uint256 impressions,
        uint256 clicks,
        uint256 conversions
    );

    event CampaignSettled(
        uint256 indexed campaignId,
        address indexed creator,
        uint256 reward
    );

    event OracleUpdated(address indexed newOracle);

    // Modifiers
    modifier onlyOracle() {
        require(msg.sender == oracleAddress, "Only oracle can update metrics");
        _;
    }

    constructor(address _stablecoin, address _oracle) ERC721("TractionCampaign", "TRACTION") {
        stablecoin = IERC20(_stablecoin);
        oracleAddress = _oracle;
    }

    /**
     * @notice Create a new marketing campaign
     * @param productName Name of the product being marketed
     * @param contentHash IPFS hash of the generated content
     * @param fundAmount Amount of stablecoin to lock for this campaign
     */
    function createCampaign(
        string memory productName,
        string memory contentHash,
        uint256 fundAmount
    ) external nonReentrant returns (uint256) {
        require(fundAmount > 0, "Fund amount must be greater than 0");
        require(
            stablecoin.transferFrom(msg.sender, address(this), fundAmount),
            "Transfer failed"
        );

        uint256 campaignId = campaignCounter++;

        campaigns[campaignId] = Campaign({
            creator: msg.sender,
            productName: productName,
            contentHash: contentHash,
            createdAt: block.timestamp,
            fundsLocked: fundAmount,
            performance: 0,
            settled: false,
            paymentToken: address(stablecoin)
        });

        creatorCampaigns[msg.sender].push(campaignId);
        totalFundsLocked += fundAmount;

        // Mint NFT for campaign
        _safeMint(msg.sender, campaignId);

        emit CampaignCreated(campaignId, msg.sender, productName, fundAmount);

        return campaignId;
    }

    /**
     * @notice Update performance metrics for a campaign (only oracle)
     * @param campaignId ID of the campaign
     * @param impressions Number of impressions
     * @param clicks Number of clicks
     * @param conversions Number of conversions
     */
    function updatePerformance(
        uint256 campaignId,
        uint256 impressions,
        uint256 clicks,
        uint256 conversions
    ) external onlyOracle {
        require(campaignId < campaignCounter, "Campaign does not exist");
        require(!campaigns[campaignId].settled, "Campaign already settled");

        metrics[campaignId] = PerformanceMetrics({
            impressions: impressions,
            clicks: clicks,
            conversions: conversions,
            lastUpdated: block.timestamp
        });

        // Calculate performance score (0-100)
        uint256 ctr = impressions > 0 ? (clicks * 100) / impressions : 0;
        uint256 convRate = clicks > 0 ? (conversions * 100) / clicks : 0;
        campaigns[campaignId].performance = (ctr + convRate) / 2;

        emit PerformanceUpdated(campaignId, impressions, clicks, conversions);
    }

    /**
     * @notice Settle a campaign and distribute rewards based on performance
     * @param campaignId ID of the campaign
     */
    function settleCampaign(uint256 campaignId) external nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        require(campaign.creator != address(0), "Campaign does not exist");
        require(!campaign.settled, "Campaign already settled");
        require(msg.sender == campaign.creator || msg.sender == owner(), "Only creator or owner can settle");

        // Calculate reward based on performance
        uint256 performanceScore = campaign.performance;
        uint256 reward = (campaign.fundsLocked * performanceScore) / 100;

        // Apply protocol fee
        uint256 fee = (reward * performanceFeePercentage) / 100;
        uint256 creatorReward = reward - fee;

        // Mark as settled
        campaign.settled = true;
        totalFundsLocked -= campaign.fundsLocked;

        // Transfer reward to creator
        require(
            stablecoin.transfer(campaign.creator, creatorReward),
            "Reward transfer failed"
        );

        // Transfer fee to protocol
        require(
            stablecoin.transfer(owner(), fee),
            "Fee transfer failed"
        );

        emit CampaignSettled(campaignId, campaign.creator, creatorReward);
    }

    /**
     * @notice Get campaign details
     * @param campaignId ID of the campaign
     */
    function getCampaign(uint256 campaignId)
        external
        view
        returns (Campaign memory)
    {
        return campaigns[campaignId];
    }

    /**
     * @notice Get performance metrics for a campaign
     * @param campaignId ID of the campaign
     */
    function getMetrics(uint256 campaignId)
        external
        view
        returns (PerformanceMetrics memory)
    {
        return metrics[campaignId];
    }

    /**
     * @notice Get all campaigns for a creator
     * @param creator Address of the creator
     */
    function getCreatorCampaigns(address creator)
        external
        view
        returns (uint256[] memory)
    {
        return creatorCampaigns[creator];
    }

    /**
     * @notice Calculate estimated reward for a campaign
     * @param campaignId ID of the campaign
     */
    function estimateReward(uint256 campaignId)
        external
        view
        returns (uint256)
    {
        Campaign memory campaign = campaigns[campaignId];
        require(!campaign.settled, "Campaign already settled");

        uint256 performanceScore = campaign.performance;
        uint256 reward = (campaign.fundsLocked * performanceScore) / 100;
        uint256 fee = (reward * performanceFeePercentage) / 100;

        return reward - fee;
    }

    /**
     * @notice Update oracle address (owner only)
     * @param newOracle Address of the new oracle
     */
    function setOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Invalid oracle address");
        oracleAddress = newOracle;
        emit OracleUpdated(newOracle);
    }

    /**
     * @notice Update performance fee (owner only)
     * @param newFeePercentage New fee percentage
     */
    function setPerformanceFee(uint256 newFeePercentage) external onlyOwner {
        require(newFeePercentage <= 50, "Fee too high");
        performanceFeePercentage = newFeePercentage;
    }

    /**
     * @notice Withdraw accumulated fees (owner only)
     */
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 balance = stablecoin.balanceOf(address(this)) - totalFundsLocked;
        require(balance > 0, "No fees to withdraw");
        require(stablecoin.transfer(owner(), balance), "Withdrawal failed");
    }
}
