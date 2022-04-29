// SPDX-License-Identifier: CAL
pragma solidity 0.8.10;

import {SaturatingMath} from "../math/SaturatingMath.sol";

/// @title SaturatingMathTest
/// Thin wrapper around the `SaturatingMath` library for hardhat unit testing.
contract SaturatingMathTest {
    /// Wraps `SaturatingMath.saturatingAdd`.
    /// Saturating addition.
    /// @param a_ First term.
    /// @param b_ Second term.
    /// @return Minimum of a_ + b_ and max uint256.
    function saturatingAdd(uint256 a_, uint256 b_)
        external
        pure
        returns (uint256)
    {
        unchecked {
            return SaturatingMath.saturatingAdd(a_, b_);
        }
    }

    /// Wraps `SaturatingMath.saturatingSub`.
    /// Saturating subtraction.
    /// @param a_ Minuend.
    /// @param b_ Subtrahend.
    /// @return a_ - b_ if a_ greater than b_, else 0.
    function saturatingSub(uint256 a_, uint256 b_)
        external
        pure
        returns (uint256)
    {
        unchecked {
            return SaturatingMath.saturatingSub(a_, b_);
        }
    }

    /// Wraps `SaturatingMath.saturatingMul`.
    /// Saturating multiplication.
    /// @param a_ First term.
    /// @param b_ Second term.
    /// @return Minimum of a_ * b_ and max uint256.
    function saturatingMul(uint256 a_, uint256 b_)
        external
        pure
        returns (uint256)
    {
        unchecked {
            return SaturatingMath.saturatingMul(a_, b_);
        }
    }
}
