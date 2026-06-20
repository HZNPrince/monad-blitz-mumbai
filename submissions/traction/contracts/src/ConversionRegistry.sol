// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ICampaignOwner {
    function creator() external view returns (address);
}

interface IConversionRegistry {
    function finalizedPerformance(address campaign)
        external
        view
        returns (uint256 conversions, bytes32 evidenceHash, bool finalized);
}

contract ConversionRegistry is ReentrancyGuard, IConversionRegistry {
    struct CampaignConversions {
        bytes32 contentHash;
        address payable recipient;
        uint96 minimumValue;
        uint64 expiry;
        uint64 count;
        bool finalized;
    }

    mapping(address campaign => CampaignConversions data) private campaigns;
    mapping(address campaign => mapping(address wallet => bool converted)) public hasConverted;

    event ConversionCampaignConfigured(
        address indexed campaign,
        bytes32 indexed contentHash,
        address indexed recipient,
        uint96 minimumValue,
        uint64 expiry
    );
    event ConversionRegistered(
        address indexed campaign,
        bytes32 indexed contentHash,
        address indexed wallet,
        uint256 value,
        uint256 cumulativeConversions
    );
    event ConversionCampaignFinalized(address indexed campaign, uint256 conversions, bytes32 indexed evidenceHash);

    error Unauthorized();
    error InvalidConfiguration();
    error CampaignExpired();
    error CampaignFinalized();
    error AlreadyConverted();
    error InsufficientConversionValue();
    error ValueTransferFailed();

    function configureCampaign(
        address campaign,
        bytes32 contentHash,
        address payable recipient,
        uint96 minimumValue,
        uint64 expiry
    ) external {
        if (
            campaign == address(0) || contentHash == bytes32(0) || recipient == address(0) || expiry <= block.timestamp
                || campaigns[campaign].expiry != 0
        ) revert InvalidConfiguration();
        if (ICampaignOwner(campaign).creator() != msg.sender) revert Unauthorized();
        campaigns[campaign] = CampaignConversions(contentHash, recipient, minimumValue, expiry, 0, false);
        emit ConversionCampaignConfigured(campaign, contentHash, recipient, minimumValue, expiry);
    }

    function convert(address campaign) external payable nonReentrant {
        CampaignConversions storage data = campaigns[campaign];
        if (data.expiry == 0) revert InvalidConfiguration();
        if (data.finalized) revert CampaignFinalized();
        if (block.timestamp > data.expiry) revert CampaignExpired();
        if (hasConverted[campaign][msg.sender]) revert AlreadyConverted();
        if (msg.value < data.minimumValue) revert InsufficientConversionValue();

        hasConverted[campaign][msg.sender] = true;
        data.count += 1;
        if (msg.value != 0) {
            (bool sent,) = data.recipient.call{value: msg.value}("");
            if (!sent) revert ValueTransferFailed();
        }
        emit ConversionRegistered(campaign, data.contentHash, msg.sender, msg.value, data.count);
    }

    function finalize(address campaign) external returns (bytes32 evidenceHash) {
        CampaignConversions storage data = campaigns[campaign];
        if (data.expiry == 0) revert InvalidConfiguration();
        if (ICampaignOwner(campaign).creator() != msg.sender) revert Unauthorized();
        if (data.finalized) revert CampaignFinalized();
        data.finalized = true;
        evidenceHash = _evidenceHash(campaign, data);
        emit ConversionCampaignFinalized(campaign, data.count, evidenceHash);
    }

    function campaignConfig(address campaign_) external view returns (CampaignConversions memory) {
        return campaigns[campaign_];
    }

    function finalizedPerformance(address campaign_)
        external
        view
        returns (uint256 conversions, bytes32 evidenceHash, bool finalized)
    {
        CampaignConversions memory data = campaigns[campaign_];
        return (data.count, _evidenceHash(campaign_, data), data.finalized);
    }

    function _evidenceHash(address campaign_, CampaignConversions memory data) private view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), campaign_, data.contentHash, data.count));
    }
}
