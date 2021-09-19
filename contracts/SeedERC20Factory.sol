// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { Factory } from "./Factory.sol";
import { SeedERC20, SeedERC20Config } from "./SeedERC20.sol";

/// @title SeedERC20Factory
/// @notice Factory for creating and registering new SeedERC20 contracts.
contract SeedERC20Factory is Factory {

    /// Decodes the arbitrary data_ parameter for SeedERC20 constructor,
    /// which expects a SeedERC20Config type.
    ///
    /// @param data_ Encoded data to pass down to child SeedERC20
    /// contract constructor.
    /// @return New SeedERC20 child contract address.
    function _createChild(
        bytes calldata data_
    ) internal virtual override returns(address) {
        (SeedERC20Config memory config_) = abi.decode(data_, (SeedERC20Config));
        return address(new SeedERC20(config_));
    }

    /// Allows calling `createChild` with SeedERC20Config struct.
    /// Can use original Factory `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ SeedERC20 constructor configuration.
    /// @return New SeedERC20 child contract address.
    function createChild(SeedERC20Config calldata config_) external returns(address) {
        return this.createChild(abi.encode(config_));
    }
}