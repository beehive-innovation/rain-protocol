// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State} from "../RainVM.sol";

/// @title ThisOps
/// @notice RainVM opcode pack to access the current contract address.
library ThisOps {
    /// Opcode for this contract address.
    uint256 private constant THIS_ADDRESS = 0;
    /// Number of provided opcodes for `ThisOps`.
    uint256 internal constant OPS_LENGTH = 1;

    function applyOp(
        bytes memory,
        State memory state_,
        uint256 opcode_,
        uint256
    ) internal view {
        unchecked {
            require(opcode_ < OPS_LENGTH, "MAX_OPCODE");
            // There's only one opcode.
            // Put the current contract address on the stack.
            state_.stack[state_.stackIndex] = uint256(
                uint160(address(this))
            );
            state_.stackIndex++;
        }
    }
}
