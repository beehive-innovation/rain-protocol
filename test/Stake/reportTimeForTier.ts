import { assert } from "chai";
import { ethers } from "hardhat";
import { ReserveToken18, StakeFactory } from "../../typechain";
import { StakeConfigStruct } from "../../typechain/contracts/stake/Stake";
import { max_uint32, sixZeros } from "../../utils/constants/bigNumber";
import { THRESHOLDS } from "../../utils/constants/stake";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { stakeDeploy } from "../../utils/deploy/stake/deploy";
import { stakeFactoryDeploy } from "../../utils/deploy/stake/stakeFactory/deploy";
import { getBlockTimestamp, timewarp } from "../../utils/hardhat";
import { Tier } from "../../utils/types/tier";

describe("Stake reportTimeForTier", async function () {
  let stakeFactory: StakeFactory;
  let token: ReserveToken18;

  before(async () => {
    stakeFactory = await stakeFactoryDeploy();
  });

  beforeEach(async () => {
    token = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await token.initialize();
  });

  it("should reset earliest time if user briefly fails to exceed all thresholds (e.g. user is not eligible for tier rewards if they had no stake for the period of time in which they were awarded)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[1];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and deposit them
    const depositAmount0 = THRESHOLDS[7].add(1); // exceeds all thresholds
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const timeOne0_ = await stake.reportTimeForTier(
      alice.address,
      Tier.ONE,
      THRESHOLDS
    );
    const timeEight0_ = await stake.reportTimeForTier(
      alice.address,
      Tier.EIGHT,
      THRESHOLDS
    );

    const blockTime0_ = await getBlockTimestamp();
    assert(timeOne0_.eq(blockTime0_));
    assert(timeEight0_.eq(blockTime0_));

    await timewarp(86400);

    // Alice withdraws tokens
    const withdrawAmount = ethers.BigNumber.from(4000 + sixZeros);
    await stake
      .connect(alice)
      .withdraw(withdrawAmount, alice.address, alice.address);

    const timeOne1_ = await stake.reportTimeForTier(
      alice.address,
      Tier.ONE,
      THRESHOLDS
    );
    const timeFour1_ = await stake.reportTimeForTier(
      alice.address,
      Tier.FOUR,
      THRESHOLDS
    );
    const timeEight1_ = await stake.reportTimeForTier(
      alice.address,
      Tier.EIGHT,
      THRESHOLDS
    );

    assert(
      timeEight1_.eq(max_uint32),
      "withdraw did not reset tier EIGHT time"
    );
    assert(
      timeOne1_.eq(blockTime0_),
      "withdraw did wrongly reset tier ONE time"
    );
    assert(
      timeFour1_.eq(blockTime0_),
      "withdraw did wrongly reset tier FOUR time"
    );

    await timewarp(86400);

    // Alice deposits again, exceeding all thresholds again
    await token.connect(alice).approve(stake.address, withdrawAmount);
    await stake.connect(alice).deposit(withdrawAmount, alice.address);

    const timeOne2_ = await stake.reportTimeForTier(
      alice.address,
      Tier.ONE,
      THRESHOLDS
    );
    const timeEight2_ = await stake.reportTimeForTier(
      alice.address,
      Tier.EIGHT,
      THRESHOLDS
    );

    const blockTime2_ = await getBlockTimestamp();
    assert(timeOne2_.eq(blockTime0_));
    assert(timeEight2_.eq(blockTime2_));
  });

  it("should reset earliest time if user briefly fails to exceed 1st threshold (e.g. user is not eligible for tier rewards if they had no stake for the period of time in which they were awarded)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[1];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and deposit them
    const depositAmount0 = THRESHOLDS[0].add(1); // exceeds 1st threshold
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const time0_ = await stake.reportTimeForTier(
      alice.address,
      Tier.ONE,
      THRESHOLDS
    );

    const blockTime0_ = await getBlockTimestamp();
    assert(time0_.eq(blockTime0_));

    await timewarp(86400);

    // Alice withdraws tokens
    const withdrawAmount = 100;
    await stake
      .connect(alice)
      .withdraw(withdrawAmount, alice.address, alice.address);

    const time1_ = await stake.reportTimeForTier(
      alice.address,
      Tier.ONE,
      THRESHOLDS
    );

    assert(
      time1_.eq(max_uint32),
      "withdraw did not reset tier ONE time, and did not cause user to fall to tier ZERO"
    );

    await timewarp(86400);

    // Alice deposits again, exceeding threshold again
    await token.connect(alice).approve(stake.address, withdrawAmount);
    await stake.connect(alice).deposit(withdrawAmount, alice.address);

    const time2_ = await stake.reportTimeForTier(
      alice.address,
      Tier.ONE,
      THRESHOLDS
    );

    const blockTime2_ = await getBlockTimestamp();
    assert(
      !time2_.eq(time0_),
      "wrongly returned earliest time as first time threshold was exceeded"
    );
    assert(
      time2_.eq(blockTime2_),
      "did not return earliest time as the new deposit to exceed threshold"
    );
  });

  it("should return earliest time for tier ONE threshold if multiple deposits made after exceeding threshold", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[1];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and deposit them
    const depositAmount0 = THRESHOLDS[0].add(1); // exceeds 1st threshold
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const time0_ = await stake.reportTimeForTier(
      alice.address,
      Tier.ONE,
      THRESHOLDS
    );

    const blockTime0_ = await getBlockTimestamp();
    assert(time0_.eq(blockTime0_));

    await timewarp(3600);

    // Alice deposits more tokens
    const depositAmount1 = 10; // still exceeds 1st threshold, but less than 2nd threshold
    await token.transfer(alice.address, depositAmount1);
    await token.connect(alice).approve(stake.address, depositAmount1);
    await stake.connect(alice).deposit(depositAmount1, alice.address);

    const time1_ = await stake.reportTimeForTier(
      alice.address,
      Tier.ONE,
      THRESHOLDS
    );

    assert(time1_.eq(time0_), "did not return earliest time above threshold");

    await timewarp(86400);

    // Alice deposits more tokens
    const depositAmount2 = THRESHOLDS[1]
      .sub(depositAmount0)
      .sub(depositAmount1)
      .add(1); // exceeds 2nd threshold
    await token.transfer(alice.address, depositAmount2);
    await token.connect(alice).approve(stake.address, depositAmount2);
    await stake.connect(alice).deposit(depositAmount2, alice.address);

    const timeTWO_ = await stake.reportTimeForTier(
      alice.address,
      Tier.TWO,
      THRESHOLDS
    );

    const time2_ = await stake.reportTimeForTier(
      alice.address,
      Tier.ONE,
      THRESHOLDS
    );

    const blockTime1_ = await getBlockTimestamp();

    assert(timeTWO_.eq(blockTime1_), "did not exceed 2nd threshold");
    assert(time2_.eq(time0_), "did not return earliest time above threshold");
  });

  it("should return time for tier ONE when enough tokens have been staked to exceed the 1st threshold", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[1];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and deposit them
    const depositAmount0 = THRESHOLDS[0].add(1); // exceeds 1st threshold
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const time_ = await stake.reportTimeForTier(
      alice.address,
      Tier.ONE,
      THRESHOLDS
    );

    const blockTime_ = await getBlockTimestamp();
    assert(
      time_.eq(blockTime_),
      "did not exceed 1st threshold, according to reportTimeForTier"
    );
  });

  it("should return ALWAYS time for tier ZERO", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[1];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    const time_ = await stake.reportTimeForTier(alice.address, Tier.ZERO, []);

    assert(time_.isZero());
  });

  it("should return NEVER time if tier greater than context length", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[1];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and deposit them
    const depositAmount0 = THRESHOLDS[0].add(1); // exceeds 1st threshold
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const time0_ = await stake.reportTimeForTier(alice.address, Tier.ONE, []);
    const time1_ = await stake.reportTimeForTier(alice.address, Tier.TWO, [
      THRESHOLDS[0],
    ]);
    const time2_ = await stake.reportTimeForTier(
      alice.address,
      Tier.THREE,
      THRESHOLDS.slice(0, 1)
    );
    const time3_ = await stake.reportTimeForTier(
      alice.address,
      Tier.FOUR,
      THRESHOLDS.slice(0, 2)
    );
    const time4_ = await stake.reportTimeForTier(
      alice.address,
      Tier.FIVE,
      THRESHOLDS.slice(0, 3)
    );
    const time5_ = await stake.reportTimeForTier(
      alice.address,
      Tier.SIX,
      THRESHOLDS.slice(0, 4)
    );
    const time6_ = await stake.reportTimeForTier(
      alice.address,
      Tier.SEVEN,
      THRESHOLDS.slice(0, 5)
    );
    const time7_ = await stake.reportTimeForTier(
      alice.address,
      Tier.EIGHT,
      THRESHOLDS.slice(0, 6)
    );

    assert(time0_.eq(max_uint32));
    assert(time1_.eq(max_uint32));
    assert(time2_.eq(max_uint32));
    assert(time3_.eq(max_uint32));
    assert(time4_.eq(max_uint32));
    assert(time5_.eq(max_uint32));
    assert(time6_.eq(max_uint32));
    assert(time7_.eq(max_uint32));
  });
});
