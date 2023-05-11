// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import "sol.lib.memory/LibStackPointer.sol";
import "rain.lib.interpreter/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";

/// @title OpMax
/// @notice Opcode to stack the maximum of N numbers.
library OpMax {
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(uint256 a_, uint256 b_) internal pure returns (uint256) {
        return a_ > b_ ? a_ : b_;
    }

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand operand_,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        return
            integrityCheckState_.applyFnN(
                stackTop_,
                f,
                Operand.unwrap(operand_)
            );
    }

    function run(
        InterpreterState memory,
        Operand operand_,
        Pointer stackTop_
    ) internal view returns (Pointer stackTopAfter_) {
        return stackTop_.applyFnN(f, Operand.unwrap(operand_));
    }
}
