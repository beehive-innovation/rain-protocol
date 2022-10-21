import { assert } from "chai";
import { ethers } from "hardhat";
import { ReserveToken18, StakeFactory } from "../../typechain";
import { StakeConfigStruct } from "../../typechain/contracts/stake/Stake";
import { getBlockTimestamp, timewarp, zeroAddress } from "../../utils";
import { eighteenZeros, sixZeros } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { stakeDeploy } from "../../utils/deploy/stake/deploy";
import { stakeFactoryDeploy } from "../../utils/deploy/stake/stakeFactory/deploy";
import { getDeposits } from "../../utils/stake/deposits";
import { assertError } from "../../utils/test/assertError";

describe("Stake deposit", async function () {
  let stakeFactory: StakeFactory;
  let token: ReserveToken18;

  before(async () => {
    stakeFactory = await stakeFactoryDeploy();
  });

  beforeEach(async () => {
    token = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await token.initialize();
  });

  it("should not process an invalid deposit", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    await token.connect(alice).approve(stake.address, 1);

    await assertError(
      async () => await stake.connect(alice).deposit(1, zeroAddress),
      "0_DEPOSIT_RECEIVER",
      "wrongly processed deposit to zeroAddress"
    );

    const depositsAlice0_ = await getDeposits(stake, alice.address);
    assert(depositsAlice0_.length === 0);
  });

  it("should calculate correct mint amounts based on current supply", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[1];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    const amount = ethers.BigNumber.from("1" + eighteenZeros);
    const tokenPoolSize0_ = await token.balanceOf(stake.address);
    const totalSupply0_ = await stake.totalSupply();
    assert(tokenPoolSize0_.eq(totalSupply0_));
    assert(tokenPoolSize0_.isZero());

    // Alice deposits reserve tokens
    await token.transfer(alice.address, amount);
    await token.connect(alice).approve(stake.address, amount);
    await stake.connect(alice).deposit(amount, alice.address);

    const expectedMint0 = amount;
    const actualMint0 = await stake.totalSupply();

    assert(
      expectedMint0.eq(actualMint0),
      `wrong amount minted when supply == 0
      expected  ${expectedMint0}
      got       ${actualMint0}`
    );

    const tokenPoolSize1_ = await token.balanceOf(stake.address);
    const totalSupply1_ = await stake.totalSupply();
    assert(tokenPoolSize1_.eq(totalSupply1_));

    // Alice deposits more reserve tokens
    await token.transfer(alice.address, amount);
    await token.connect(alice).approve(stake.address, amount);
    await stake.connect(alice).deposit(amount, alice.address);

    const expectedMint1 = actualMint0.mul(amount).div(tokenPoolSize1_);
    const actualMint1 = (await stake.totalSupply()).sub(actualMint0);

    assert(
      expectedMint1.eq(actualMint1),
      `wrong amount minted when supply > 0
      expected  ${expectedMint1}
      got       ${actualMint1}`
    );
  });

  it("should revert deposit if mint amount is calculated to be 0", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];
    const bob = signers[3];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Alice deposits 3 reserve tokens
    await token.transfer(alice.address, 3);
    await token.connect(alice).approve(stake.address, 3);
    await stake.connect(alice).deposit(3, alice.address);

    // Malicious actor sends token directly to contract to cause mintAmount_ to round down to 0
    await token.transfer(stake.address, 10);

    // Bob deposits 3 reserve tokens
    await token.transfer(bob.address, 3);
    await token.connect(bob).approve(stake.address, 3);
    await assertError(
      async () => await stake.connect(bob).deposit(3, bob.address),
      "0_DEPOSIT_SHARES",
      "did not protect bob from a deposit which would give him back 0 stTokens"
    );
  });

  it("should not process a deposit of 0 amount", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    await token.connect(alice).approve(stake.address, 0);
    await assertError(
      async () => await stake.connect(alice).deposit(0, alice.address),
      "0_DEPOSIT_ASSETS",
      "wrongly processed deposit of 0 tokens"
    );

    const depositsAlice0_ = await getDeposits(stake, alice.address);
    assert(depositsAlice0_.length === 0);
  });

  it("should process minimum deposit of 1 token", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice some reserve tokens and deposit them
    await token.transfer(alice.address, 2);
    await token.connect(alice).approve(stake.address, 1);
    await stake.connect(alice).deposit(1, alice.address);

    const depositsAlice0_ = await getDeposits(stake, alice.address);
    const time0_ = await getBlockTimestamp();
    assert(depositsAlice0_.length === 1);
    assert(depositsAlice0_[0].timestamp === time0_);
    assert(depositsAlice0_[0].amount.eq(1));

    await timewarp(86400);

    await token.connect(alice).approve(stake.address, 1);
    await stake.connect(alice).deposit(1, alice.address);

    const depositsAlice1_ = await getDeposits(stake, alice.address);
    const time1_ = await getBlockTimestamp();
    assert(depositsAlice1_.length === 2);
    assert(depositsAlice1_[0].timestamp === time0_);
    assert(depositsAlice1_[0].amount.eq(1));
    assert(depositsAlice1_[1].timestamp !== time0_);
    assert(depositsAlice1_[1].timestamp === time1_);
    assert(depositsAlice1_[1].amount.eq(2));
  });

  it("should process deposit of 2 tokens", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice some reserve tokens and deposit them
    await token.transfer(alice.address, 4);
    await token.connect(alice).approve(stake.address, 2);
    await stake.connect(alice).deposit(2, alice.address);

    const depositsAlice0_ = await getDeposits(stake, alice.address);
    const time0_ = await getBlockTimestamp();
    assert(depositsAlice0_.length === 1);
    assert(depositsAlice0_[0].timestamp === time0_);
    assert(depositsAlice0_[0].amount.eq(2));

    await timewarp(86400);

    await token.connect(alice).approve(stake.address, 2);
    await stake.connect(alice).deposit(2, alice.address);

    const depositsAlice1_ = await getDeposits(stake, alice.address);
    const time1_ = await getBlockTimestamp();
    assert(depositsAlice1_.length === 2);
    assert(depositsAlice1_[0].timestamp === time0_);
    assert(depositsAlice1_[0].amount.eq(2));
    assert(depositsAlice1_[1].timestamp !== time0_);
    assert(depositsAlice1_[1].timestamp === time1_);
    assert(depositsAlice1_[1].amount.eq(4));
  });

  it("should process deposits", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    const depositsAlice0_ = await getDeposits(stake, alice.address);
    assert(depositsAlice0_.length === 0);

    // Give Alice some reserve tokens
    await token.transfer(
      alice.address,
      ethers.BigNumber.from("1000" + sixZeros)
    );

    const tokenBalanceAlice0 = await token.balanceOf(alice.address);
    const stTokenSupply0 = await stake.totalSupply();

    assert(stTokenSupply0.isZero(), "initial stToken supply was not 0");

    const amount0 = tokenBalanceAlice0.div(10);

    // deposit some of Alice's tokens
    await token.connect(alice).approve(stake.address, amount0);
    await stake.connect(alice).deposit(amount0, alice.address);

    const tokenBalanceAlice1 = await token.balanceOf(alice.address);
    const stTokenBalanceAlice1 = await stake.balanceOf(alice.address);
    const stTokenSupply1 = await stake.totalSupply();

    assert(
      tokenBalanceAlice1.eq(tokenBalanceAlice0.sub(amount0)),
      "deposit did not transfer correct token amount to Stake contract"
    );
    assert(
      !stTokenSupply1.isZero(),
      "no stToken was minted after first deposit"
    );
    assert(
      !stTokenBalanceAlice1.isZero(),
      "alice did not receive stToken upon depositing token"
    );
    assert(
      stTokenBalanceAlice1.eq(stTokenSupply1),
      "alice balance was not equal to total stToken supply"
    );

    const depositsAlice1_ = await getDeposits(stake, alice.address);
    const time1_ = await getBlockTimestamp();
    assert(depositsAlice1_.length === 1);
    assert(depositsAlice1_[0].timestamp === time1_);
    assert(depositsAlice1_[0].amount.eq(amount0));

    await timewarp(86400);

    const amount1 = tokenBalanceAlice0.div(10);

    // deposit more of Alice's tokens
    await token.connect(alice).approve(stake.address, amount1);
    await stake.connect(alice).deposit(amount1, alice.address);

    const tokenBalanceAlice2 = await token.balanceOf(alice.address);
    const stTokenBalanceAlice2 = await stake.balanceOf(alice.address);
    const stTokenSupply2 = await stake.totalSupply();

    assert(
      tokenBalanceAlice2.eq(tokenBalanceAlice1.sub(amount1)),
      "deposit did not transfer correct token amount to Stake contract"
    );
    assert(
      !stTokenSupply2.isZero(),
      "no stToken was minted after first deposit"
    );
    assert(
      !stTokenBalanceAlice2.isZero(),
      "alice did not receive stToken upon depositing token"
    );
    assert(
      stTokenBalanceAlice2.eq(stTokenSupply2),
      "alice balance was not equal to total stToken supply"
    );

    const depositsAlice2_ = await getDeposits(stake, alice.address);
    const time2_ = await getBlockTimestamp();
    assert(depositsAlice2_.length === 2);
    assert(depositsAlice2_[0].timestamp === time1_);
    assert(depositsAlice2_[0].amount.eq(amount0));
    assert(depositsAlice2_[1].timestamp !== time1_);
    assert(depositsAlice2_[1].timestamp === time2_);
    assert(depositsAlice2_[1].amount.eq(amount0.add(amount1)));
  });

  it("should process deposit and withdraw with a non 1:1 ratio", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    // Transfer tokens from the deployer to the alice with the instances
    const amountToTransfer = ethers.BigNumber.from("50000000");
    await token.connect(deployer).approve(deployer.address, amountToTransfer);

    //await token.connect(alice);
    await token.transferFrom(deployer.address, alice.address, amountToTransfer);

    const tokenBalanceAlice = await token.balanceOf(alice.address);

    assert(
      tokenBalanceAlice.eq(amountToTransfer),
      "Alice did not received the tokens"
    );

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };
    const stake = await stakeDeploy(alice, stakeFactory, stakeConfigStruct);

    const stTokenTotalSupply0 = await stake.totalSupply();
    const tokenBalanceStake0 = await token.balanceOf(stake.address);

    assert(
      stTokenTotalSupply0.isZero(),
      "stToken supply is not zero before any deposits"
    );
    assert(
      tokenBalanceStake0.isZero(),
      "stake contract token balance is not zero before any deposits"
    );

    await token
      .connect(alice)
      .approve(stake.address, ethers.constants.MaxUint256);
    const depositUnits = ethers.BigNumber.from("20000000");
    // alice depositing
    await stake.deposit(depositUnits, alice.address);

    const stTokenTotalSupply1 = await stake.totalSupply();
    const tokenBalanceStake1 = await token.balanceOf(stake.address);
    const stTokenBalanceAlice0 = await stake.balanceOf(alice.address);
    const tokenBalanceAlice0 = await token.balanceOf(alice.address);

    assert(
      stTokenTotalSupply1.eq(depositUnits),
      "stToken has not minted correct units"
    );
    assert(
      tokenBalanceStake1.eq(depositUnits),
      "stake contract token balance is not equal to deposited amount"
    );
    assert(
      stTokenBalanceAlice0.eq(depositUnits),
      "Alice has not received correct share units"
    );
    assert(
      tokenBalanceAlice0.eq(amountToTransfer.sub(depositUnits)),
      "alice doesn't have correct token balance after deposit"
    );

    // alice withdrawing half of her shares
    const shares = await stake.balanceOf(alice.address);
    await stake.withdraw(shares.div(2), alice.address, alice.address);

    const stTokenTotalSupply2 = await stake.totalSupply();
    const tokenBalanceStake2 = await token.balanceOf(stake.address);
    const stTokenBalanceAlice1 = await stake.balanceOf(alice.address);
    const tokenBalanceAlice1 = await token.balanceOf(alice.address);

    assert(
      stTokenTotalSupply2.eq(stTokenTotalSupply1.div(2)),
      "stToken has not burned correct units"
    );
    assert(
      tokenBalanceStake2.eq(tokenBalanceStake1.div(2)),
      "stake contract token balance has not transfered correct units to alice"
    );
    assert(
      stTokenBalanceAlice1.eq(stTokenBalanceAlice0.div(2)),
      "alice doesn't have correct share units after withdrawing"
    );
    assert(
      tokenBalanceAlice1.eq(tokenBalanceAlice0.add(depositUnits.div(2))),
      "alice has not received correct token units after withdrawing"
    );
  });
});
