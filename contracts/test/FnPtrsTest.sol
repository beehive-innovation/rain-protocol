// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {RainVM} from "../vm/RainVM.sol";
import "../vm/VMStateBuilder.sol";

uint256 constant ENTRYPOINT = 0;
uint256 constant MIN_FINAL_STACK_INDEX = 1;

/// @title FnPtrsTest
/// Test contract that returns bad fnPtrs length.
contract FnPtrsTest is RainVM {
    address private immutable self;
    address private immutable vmStateBuilder;
    address private vmStatePointer;

    constructor(address vmStateBuilder_) {
        self = address(this);
        vmStateBuilder = vmStateBuilder_;
    }

    /// Using initialize rather than constructor because fnPtrs doesn't return
    /// the same thing during construction.
    function initialize(StateConfig calldata stateConfig_) external {
        Bounds memory bounds_;
        bounds_.entrypoint = ENTRYPOINT;
        bounds_.minFinalStackIndex = MIN_FINAL_STACK_INDEX;
        Bounds[] memory boundss_ = new Bounds[](1);
        boundss_[0] = bounds_;
        bytes memory stateBytes_ = VMStateBuilder(vmStateBuilder).buildState(
            self,
            stateConfig_,
            boundss_
        );
        vmStatePointer = SSTORE2.write(stateBytes_);
    }

    function fnPtrs() public pure override returns (bytes memory) {
        uint256 lenBytes_ = 0x10; // not divisible by 0x20 (32 bytes)
        function(uint256, uint256) view returns (uint256) zeroFn_;
        assembly {
            zeroFn_ := 0
        }
        function(uint256, uint256) view returns (uint256)[2] memory fns_ = [
            zeroFn_,
            zeroFn_
        ];
        bytes memory ret_;
        assembly {
            mstore(fns_, lenBytes_)
            ret_ := fns_
        }
        return ret_;
    }
}
