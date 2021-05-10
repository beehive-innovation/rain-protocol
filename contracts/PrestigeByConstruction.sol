// SPDX-License-Identifier: MIT

pragma solidity ^0.7.3;

import { PrestigeUtil } from "./PrestigeUtil.sol";
import { IPrestige } from "./IPrestige.sol";

import { console } from "hardhat/console.sol";

contract PrestigeByConstruction {
    IPrestige public prestige;
    uint256 public constructionBlock;

    constructor(IPrestige _prestige) {
        prestige = _prestige;
        constructionBlock = block.number;
    }

    modifier onlyStatus(address account, IPrestige.Status status) {
        uint256 _statusReport = prestige.statusReport(account);
        uint256 _statusBlock = PrestigeUtil.statusBlock(_statusReport, status);
        console.log("PrestigeByConstruction: onlyStatus: %s %s %s", _statusReport, _statusBlock, constructionBlock);
        require(
            _statusBlock <= constructionBlock,
            "ERR_MIN_STATUS"
        );
        _;
    }
}