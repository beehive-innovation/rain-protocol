// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import { ERC20Config } from "../erc20/ERC20Config.sol";
import { ERC20, ERC20Initializable } from "../erc20/ERC20Initializable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// solhint-disable-next-line max-line-length
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { Phase, Phased } from "../phased/Phased.sol";
import { Cooldown } from "../cooldown/Cooldown.sol";

import { ERC20Pull, ERC20PullConfig } from "../erc20/ERC20Pull.sol";

/// Everything required to construct a `SeedERC20` contract.
struct SeedERC20Config {
    // Reserve erc20 token contract used to purchase seed tokens.
    IERC20 reserve;
    // Recipient address for all reserve funds raised when seeding is complete.
    address recipient;
    // Price per seed unit denominated in reserve token.
    uint seedPrice;
    // Total seed units to be mint and sold.
    // 100% of all seed units must be sold for seeding to complete.
    // Recommended to keep seed units to a small value (single-triple digits).
    // The ability for users to buy/sell or not buy/sell dust seed quantities
    // is likely NOT desired.
    uint seedUnits;
    // Cooldown duration in blocks for seed/unseed cycles.
    // Seeding requires locking funds for at least the cooldown period.
    // Ideally `unseed` is never called and `seed` leaves funds in the contract
    // until all seed tokens are sold out.
    // A failed raise cannot make funds unrecoverable, so `unseed` does exist,
    // but it should be called rarely.
    uint cooldownDuration;
    // ERC20 config.
    ERC20Config erc20Config;
}

/// @title SeedERC20
/// @notice Facilitates raising seed reserve from an open set of seeders.
///
/// When a single seeder address cannot be specified at the time the
/// `Trust` is constructed a `SeedERC20` will be deployed.
///
/// The `SeedERC20` has two phases:
///
/// - `Phase.ZERO`: Can swap seed tokens for reserve assets with `seed` and
///   `unseed`
/// - `Phase.ONE`: Can redeem seed tokens pro-rata for reserve assets
///
/// When the last seed token is distributed the `SeedERC20` immediately moves
/// to `Phase.ONE` atomically within that transaction and forwards all reserve
/// to the configured recipient.
///
/// For our use-case the recipient is a `Trust` contract but `SeedERC20`
/// could be used as a mini-fundraise contract for many purposes. In the case
/// that a recipient is not a `Trust` the recipient will need to be careful not
/// to fall afoul of KYC and securities law.
///
/// @dev Facilitates a pool of reserve funds to forward to a named recipient
/// contract.
/// The funds to raise and the recipient is fixed at construction.
/// The total is calculated as `( seedPrice * seedUnits )` and so is a fixed
/// amount. It is recommended to keep `seedUnits` relatively small so that each
/// unit represents a meaningful contribution to keep dust out of the system.
///
/// The contract lifecycle is split into two phases:
///
/// - `Phase.ZERO`: the `seed` and `unseed` functions are callable by anyone.
/// - `Phase.ONE`: holders of the seed erc20 token can redeem any reserve funds
///   in the contract pro-rata.
///
/// When `seed` is called the `SeedERC20` contract takes ownership of reserve
/// funds in exchange for seed tokens.
/// When `unseed` is called the `SeedERC20` contract takes ownership of seed
/// tokens in exchange for reserve funds.
///
/// When the last `seed` token is transferred to an external address the
/// `SeedERC20` contract immediately:
///
/// - Moves to `Phase.ONE`, disabling both `seed` and `unseed`
/// - Transfers the full balance of reserve from itself to the recipient
///   address.
///
/// Seed tokens are standard ERC20 so can be freely transferred etc.
///
/// The recipient (or anyone else) MAY transfer reserve back to the `SeedERC20`
/// at a later date.
/// Seed token holders can call `redeem` in `Phase.ONE` to burn their tokens in
/// exchange for pro-rata reserve assets.
contract SeedERC20 is
    ERC20Initializable,
    Phased,
    Cooldown,
    ERC20Pull,
    Initializable
{

    using Math for uint256;
    using SafeERC20 for IERC20;

    /// Seed token burn for reserve.
    /// Number of reserve redeemed for burned seed tokens.
    /// `[seedAmount, reserveAmount]`
    event Redeem(
        /// Anon `msg.sender`. burning and receiving reserve for self.
        address sender,
        /// Number of seed tokens burned.
        uint[2] redeemAmounts
    );

    /// Reserve was paid in exchange for seed tokens.
    event Seed(
        /// Anon `msg.sender` seeding.
        address sender,
        /// Seed amounts.
        /// `[ Amount of tokens seeded, Amount of reserve sent ]`
        uint[2] seedAmounts
    );

    /// Reserve was refunded for seed tokens.
    event Unseed(
        /// Anon `msg.sender` unseeding.
        address sender,
        /// Unseed amounts.
        /// `[ Amount of tokens unseeded, Amount of reserve tokens returned ]`
        uint[2] unseedAmounts
    );

    /// Reserve erc20 token contract used to purchase seed tokens.
    IERC20 public reserve;
    /// Recipient address for all reserve funds raised when seeding is
    /// complete.
    address public recipient;
    /// Price in reserve for a unit of seed token.
    uint public seedPrice;

    /// Sanity checks on configuration.
    /// Store relevant config as contract state.
    /// Mint all seed tokens.
    /// @param config_ All config required to initialize the contract.
    function initialize (SeedERC20Config memory config_) initializer external {
        require(config_.seedPrice > 0, "PRICE_0");
        require(config_.seedUnits > 0, "UNITS_0");
        require(config_.recipient != address(0), "RECIPIENT_0");
        initializeERC20Pull(ERC20PullConfig(
            config_.recipient,
            address(config_.reserve)
        ));
        initializePhased();
        initializeCooldown(config_.cooldownDuration);
        initializeERC20(config_.erc20Config);
        seedPrice = config_.seedPrice;
        reserve = config_.reserve;
        recipient = config_.recipient;
        _mint(address(this), config_.seedUnits);
    }

    /// @inheritdoc ERC20
    function decimals() public pure override returns(uint8) { return 0; }

    /// Take reserve from seeder as `units * seedPrice`.
    ///
    /// When the final unit is sold the contract immediately:
    ///
    /// - enters `Phase.ONE`
    /// - transfers its entire reserve balance to the recipient
    ///
    /// The desired units may not be available by the time this transaction
    /// executes. This could be due to high demand, griefing and/or
    /// front-running on the contract.
    /// The caller can set a range between `minimumUnits_` and `desiredUnits_`
    /// to mitigate errors due to the contract running out of stock.
    /// The maximum available units up to `desiredUnits_` will always be
    /// processed by the contract. Only the stock of this contract is checked
    /// against the seed unit range, the caller is responsible for ensuring
    /// their reserve balance.
    /// Seeding enforces the cooldown configured in the constructor.
    /// @param minimumUnits_ The minimum units the caller will accept for a
    /// successful `seed` call.
    /// @param desiredUnits_ The maximum units the caller is willing to fund.
    function seed(uint minimumUnits_, uint desiredUnits_)
        external
        onlyPhase(Phase.ZERO)
        onlyAfterCooldown
    {
        require(desiredUnits_ > 0, "DESIRED_0");
        require(minimumUnits_ <= desiredUnits_, "MINIMUM_OVER_DESIRED");
        uint remainingStock_ = balanceOf(address(this));
        require(minimumUnits_ <= remainingStock_, "INSUFFICIENT_STOCK");

        uint units_ = desiredUnits_.min(remainingStock_);
        uint reserveAmount_ = seedPrice * units_;

        // Sold out. Move to the next phase.
        if (remainingStock_ == units_) {
            scheduleNextPhase(block.number);
        }
        _transfer(address(this), msg.sender, units_);

        emit Seed(
            msg.sender,
            [units_, reserveAmount_]
        );

        reserve.safeTransferFrom(
            msg.sender,
            address(this),
            reserveAmount_
        );
        // Immediately transfer to the recipient.
        // The transfer is immediate rather than only approving for the
        // recipient.
        // This avoids the situation where a seeder immediately redeems their
        // units before the recipient can withdraw.
        // It also introduces a failure case where the reserve errors on
        // transfer. If this fails then everyone can call `unseed` after their
        // individual cooldowns to exit.
        if (currentPhase() == Phase.ONE) {
            reserve.safeTransfer(recipient, reserve.balanceOf(address(this)));
        }
    }

    /// Send reserve back to seeder as `( units * seedPrice )`.
    ///
    /// Allows addresses to back out until `Phase.ONE`.
    /// Unlike `redeem` the seed tokens are NOT burned so become newly
    /// available for another account to `seed`.
    ///
    /// In `Phase.ONE` the only way to recover reserve assets is:
    /// - Wait for the recipient or someone else to deposit reserve assets into
    ///   this contract.
    /// - Call redeem and burn the seed tokens
    ///
    /// @param units_ Units to unseed.
    function unseed(uint units_)
        external
        onlyPhase(Phase.ZERO)
        onlyAfterCooldown
    {
        uint reserveAmount_ = seedPrice * units_;
        _transfer(msg.sender, address(this), units_);

        emit Unseed(
            msg.sender,
            [units_, reserveAmount_]
        );

        reserve.safeTransfer(msg.sender, reserveAmount_);
    }

    /// Burn seed tokens for pro-rata reserve assets.
    ///
    /// ```
    /// (units * reserve held by seed contract) / total seed token supply
    /// = reserve transfer to `msg.sender`
    /// ```
    ///
    /// The recipient or someone else must first transfer reserve assets to the
    /// `SeedERC20` contract.
    /// The recipient MUST be a TRUSTED contract or third party.
    /// This contract has no control over the reserve assets once they are
    /// transferred away at the start of `Phase.ONE`.
    /// It is the caller's responsibility to monitor the reserve balance of the
    /// `SeedERC20` contract.
    ///
    /// For example, if `SeedERC20` is used as a seeder for a `Trust` contract
    /// (in this repo) it will receive a refund or refund + fee.
    /// @param units_ Amount of seed units to burn and redeem for reserve
    /// assets.
    function redeem(uint units_) external onlyPhase(Phase.ONE) {
        uint currentReserveBalance_ = reserve.balanceOf(address(this));
        // Guard against someone accidentally calling redeem before any reserve
        // has been returned.
        require(currentReserveBalance_ > 0, "RESERVE_BALANCE");
        uint reserveAmount_
            = ( units_ * currentReserveBalance_ )
            / totalSupply();

        _burn(msg.sender, units_);
        emit Redeem(msg.sender, [units_, reserveAmount_]);
        reserve.safeTransfer(
            msg.sender,
            reserveAmount_
        );
    }

    /// Sanity check the last phase is `Phase.ONE`.
    /// @inheritdoc Phased
    function _beforeScheduleNextPhase(uint nextPhaseBlock_)
        internal
        override
        virtual
    {
        super._beforeScheduleNextPhase(nextPhaseBlock_);
        // Phase.ONE is the last phase.
        assert(currentPhase() < Phase.ONE);
    }
}