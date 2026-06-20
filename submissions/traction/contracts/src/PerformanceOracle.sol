// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IConversionRegistry} from "./ConversionRegistry.sol";

interface IPerformanceOracle {
    function finalPerformance(address campaign)
        external
        view
        returns (uint256 score, bytes32 evidenceHash, bool finalized);
}

contract PerformanceOracle is Ownable, IPerformanceOracle {
    struct Performance {
        uint256 score;
        bytes32 evidenceHash;
        uint64 updatedAt;
        bool finalized;
    }

    mapping(address reporter => bool authorized) public isReporter;
    mapping(address registry => bool authorized) public isConversionRegistry;
    mapping(address campaign => Performance data) private performance;

    event ReporterAuthorizationChanged(address indexed reporter, bool authorized);
    event ConversionRegistryAuthorizationChanged(address indexed registry, bool authorized);
    event PerformanceCommitted(address indexed campaign, uint256 score, bytes32 indexed evidenceHash, bool finalized);

    error UnauthorizedReporter();
    error PerformanceAlreadyFinalized();
    error ScoreMustBeMonotonic();
    error InvalidCampaign();
    error UnauthorizedConversionRegistry();
    error RegistryPerformanceNotFinalized();

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setReporter(address reporter, bool authorized) external onlyOwner {
        isReporter[reporter] = authorized;
        emit ReporterAuthorizationChanged(reporter, authorized);
    }

    function setConversionRegistry(IConversionRegistry registry, bool authorized) external onlyOwner {
        isConversionRegistry[address(registry)] = authorized;
        emit ConversionRegistryAuthorizationChanged(address(registry), authorized);
    }

    function commitPerformance(address campaign, uint256 score, bytes32 evidenceHash, bool finalize) external {
        if (!isReporter[msg.sender]) revert UnauthorizedReporter();
        _commit(campaign, score, evidenceHash, finalize);
    }

    function commitFinalizedConversions(IConversionRegistry registry, address campaign) external {
        if (!isReporter[msg.sender]) revert UnauthorizedReporter();
        if (!isConversionRegistry[address(registry)]) revert UnauthorizedConversionRegistry();
        (uint256 conversions, bytes32 evidenceHash, bool finalized) = registry.finalizedPerformance(campaign);
        if (!finalized) revert RegistryPerformanceNotFinalized();
        _commit(campaign, conversions, evidenceHash, true);
    }

    function _commit(address campaign, uint256 score, bytes32 evidenceHash, bool finalize) private {
        if (campaign == address(0)) revert InvalidCampaign();
        Performance storage current = performance[campaign];
        if (current.finalized) revert PerformanceAlreadyFinalized();
        if (score < current.score) revert ScoreMustBeMonotonic();
        current.score = score;
        current.evidenceHash = evidenceHash;
        current.updatedAt = uint64(block.timestamp);
        current.finalized = finalize;
        emit PerformanceCommitted(campaign, score, evidenceHash, finalize);
    }

    function finalPerformance(address campaign)
        external
        view
        returns (uint256 score, bytes32 evidenceHash, bool finalized)
    {
        Performance memory current = performance[campaign];
        return (current.score, current.evidenceHash, current.finalized);
    }
}
