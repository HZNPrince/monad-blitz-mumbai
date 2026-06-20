// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract AgentTreasury is Ownable {
    using SafeERC20 for IERC20;

    uint16 public immutable maxReinvestmentBps;

    event Withdrawal(address indexed token, address indexed to, uint256 amount);
    event Reinvestment(address indexed token, address indexed target, uint256 amount);

    error ReinvestmentCapExceeded();
    error InvalidCap();

    constructor(address initialOwner, uint16 maxReinvestmentBps_) Ownable(initialOwner) {
        if (maxReinvestmentBps_ > 10_000) revert InvalidCap();
        maxReinvestmentBps = maxReinvestmentBps_;
    }

    function withdraw(IERC20 token, address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
        emit Withdrawal(address(token), to, amount);
    }

    function reinvest(IERC20 token, address target, uint256 amount) external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        if (amount > (balance * maxReinvestmentBps) / 10_000) {
            revert ReinvestmentCapExceeded();
        }
        token.safeTransfer(target, amount);
        emit Reinvestment(address(token), target, amount);
    }
}
