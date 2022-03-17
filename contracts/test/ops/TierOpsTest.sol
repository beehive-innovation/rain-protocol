// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../../vm/RainVM.sol";
import {TierOps} from "../../vm/ops/TierOps.sol";
import {VMState, StateConfig} from "../../vm/libraries/VMState.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";


contract TierOpsTest is RainVM, VMState {
    uint256 private immutable tierOpsStart;
    address private immutable vmStatePointer;

    constructor(StateConfig memory config_) {
        tierOpsStart = RainVM.OPS_LENGTH;

        vmStatePointer = _snapshot(_newState(config_));
    }

    /// Wraps `runState` and returns top of stack.
    /// @return top of `runState` stack.
    function run() external view returns (uint256) {
        State memory state_ = runState();
        return state_.stack[state_.stackIndex - 1];
    }

    /// Wraps `runState` and returns top `length_` values on the stack.
    /// @return top `length_` values on `runState` stack.
    function runLength(
        uint256 length_
    ) external view returns (uint256[] memory) {
        State memory state_ = runState();

        uint256[] memory stackArray = new uint256[](length_);

        for (uint256 i = 0; i < length_; ++i) {
            stackArray[i] = state_.stack[state_.stackIndex - length_ + i];
        }

        return stackArray;
    }

    /// Runs `eval` and returns full state.
    /// @return `State` after running own immutable source.
    function runState() public view returns (State memory) {
        State memory state_ = _restore(vmStatePointer);
        eval("", state_, 0);
        return state_;
    }

    /// @inheritdoc RainVM
    function applyOp(
        bytes memory context_,
        State memory state_,
        uint256 opcode_,
        uint256 operand_
    ) internal view override {
        unchecked {
            TierOps.applyOp(
                context_,
                state_,
                opcode_ - tierOpsStart,
                operand_
            );
        }
    }
}
