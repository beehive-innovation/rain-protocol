// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "sol.lib.memory/LibStackPointer.sol";
import "rain.lib.interpreter/LibInterpreterState.sol";
import "../../../deploy/LibIntegrityCheck.sol";

/// @title OpGreaterThan
/// @notice Opcode to compare the top two stack values.
library OpGreaterThan {
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(uint256 a_, uint256 b_) internal pure returns (uint256 c_) {
        assembly ("memory-safe") {
            c_ := gt(a_, b_)
        }
    }

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        return integrityCheckState_.applyFn(stackTop_, f);
    }

    function run(
        InterpreterState memory,
        Operand,
        Pointer stackTop_
    ) internal view returns (Pointer) {
        return stackTop_.applyFn(f);
    }
}
