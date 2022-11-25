import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  AllStandardOpsTest,
  ReserveToken18,
  StakeFactory,
} from "../../typechain";
import { StakeConfigStruct } from "../../typechain/contracts/stake/Stake";
import { max_uint32, sixZeros } from "../../utils/constants/bigNumber";
import { THRESHOLDS } from "../../utils/constants/stake";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { stakeDeploy } from "../../utils/deploy/stake/deploy";
import { stakeFactoryDeploy } from "../../utils/deploy/stake/stakeFactory/deploy";
import { allStandardOpsDeploy } from "../../utils/deploy/test/allStandardOps/deploy";
import { getBlockTimestamp, timewarp } from "../../utils/hardhat";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { Opcode } from "../../utils/interpreter/ops/allStandardOps";
import { Tier } from "../../utils/types/tier";

describe("Stake ITIERV2_REPORT_TIME_FOR_TIER Op", async function () {
  let stakeFactory: StakeFactory;
  let token: ReserveToken18;
  let logic: AllStandardOpsTest;

  before(async () => {
    stakeFactory = await stakeFactoryDeploy();
    logic = await allStandardOpsDeploy();
  });

  beforeEach(async () => {
    token = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await token.initialize();
  });

  it("should return NEVER time using ITIERV2_REPORT_TIME_FOR_TIER if tier greater than context length", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[1];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and desposit them
    const depositAmount0 = THRESHOLDS[0].add(1); // exceeds 1st threshold
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    // prettier-ignore
    // time0
    const source0 = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.CALLER), // Address
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // TIER
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER)
    ]);

    await logic.initialize(
      {
        sources: [source0],
        constants: [stake.address, Tier.ONE],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const time0_ = await logic.stackTop();

    // prettier-ignore
    // time1
    const source1 = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.CALLER), // Address
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // context - TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, 1),
    ]);

    await logic.initialize(
      {
        sources: [source1],
        constants: [stake.address, Tier.TWO, THRESHOLDS[0]],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const time1_ = await logic.stackTop();

    // prettier-ignore
    // time2
    const source2 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
      op(Opcode.CALLER), // Address
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // TIER
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // TIER
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.slice(0, 1).length),
    ]);

    await logic.initialize(
      {
        sources: [source2],
        constants: [stake.address, Tier.THREE, ...THRESHOLDS.slice(0, 1)],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const time2_ = await logic.stackTop();

    // prettier-ignore
    // time3
    const source3 = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.CALLER), // Address
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)), // TIER
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.slice(0, 2).length),
    ]);

    await logic.initialize(
      {
        sources: [source3],
        constants: [stake.address, Tier.FOUR, ...THRESHOLDS.slice(0, 2)],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const time3_ = await logic.stackTop();

    // prettier-ignore
    // time4
    const source4 = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.CALLER), // Address
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4)), // TIER
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.slice(0, 3).length),
    ]);

    await logic.initialize(
      {
        sources: [source4],
        constants: [stake.address, Tier.FIVE, ...THRESHOLDS.slice(0, 3)],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const time4_ = await logic.stackTop();

    // prettier-ignore
    // time5
    const source5 = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.CALLER), // Address
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5)), // TIER
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.slice(0, 4).length),
    ]);

    await logic.initialize(
      {
        sources: [source5],
        constants: [stake.address, Tier.SIX, ...THRESHOLDS.slice(0, 4)],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const time5_ = await logic.stackTop();

    // prettier-ignore
    // time6
    const source6 = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.CALLER), // Address
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 6)), // TIER
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.slice(0, 5).length),
    ]);

    await logic.initialize(
      {
        sources: [source6],
        constants: [stake.address, Tier.SEVEN, ...THRESHOLDS.slice(0, 5)],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const time6_ = await logic.stackTop();

    // prettier-ignore
    // time7
    const source7 = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.CALLER), // Address
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 6)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 7)), // TIER
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.slice(0, 6).length),
    ]);

    await logic.initialize(
      {
        sources: [source7],
        constants: [stake.address, Tier.EIGHT, ...THRESHOLDS.slice(0, 6)],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const time7_ = await logic.stackTop();

    assert(time0_.eq(max_uint32));
    assert(time1_.eq(max_uint32));
    assert(time2_.eq(max_uint32));
    assert(time3_.eq(max_uint32));
    assert(time4_.eq(max_uint32));
    assert(time5_.eq(max_uint32));
    assert(time6_.eq(max_uint32));
    assert(time7_.eq(max_uint32));
  });

  it("should return ALWAYS time using ITIERV2_REPORT_TIME_FOR_TIER for tier ZERO", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[1];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // prettier-ignore
    const source0 = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.CALLER), // Address
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // TIER
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER),
    ]);

    await logic.initialize(
      {
        sources: [source0],
        constants: [stake.address, Tier.ZERO],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const time_ = await logic.stackTop();

    assert(time_.isZero());
  });

  it("should return time using ITIERV2_REPORT_TIME_FOR_TIER for tier ONE when enough tokens have been staked to exceed the 1st threshold", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[1];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and desposit them
    const depositAmount0 = THRESHOLDS[0].add(1); // exceeds 1st threshold
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const blockTime_ = await getBlockTimestamp(); // Expected blockTimeStamp after the deposit

    // prettier-ignore
    // Passing context data in constants
    const source = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.CALLER), // address
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // THRESHOLD
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 6)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 7)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 8)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 9)),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length),
    ]);

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, Tier.ONE, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const time_ = await logic.stackTop();

    assert(
      time_.eq(blockTime_),
      "did not exceed 1st threshold, according to reportTimeForTier"
    );
  });

  it("should return earliest time using ITIERV2_REPORT_TIME_FOR_TIER for tier ONE threshold if multiple deposits made after exceeding threshold", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[1];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and desposit them
    const depositAmount0 = THRESHOLDS[0].add(1); // exceeds 1st threshold
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const blockTime0_ = await getBlockTimestamp();

    // prettier-ignore
    // Passing context data in constants
    const source = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.CALLER), // address
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // THRESHOLD
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 6)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 7)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 8)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 9)),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length),
    ]);

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, Tier.ONE, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const time0_ = await logic.stackTop();

    assert(time0_.eq(blockTime0_));

    await timewarp(3600);

    // Alice deposits more tokens
    const depositAmount1 = 10; // still exceeds 1st threshold, but less than 2nd threshold
    await token.transfer(alice.address, depositAmount1);
    await token.connect(alice).approve(stake.address, depositAmount1);
    await stake.connect(alice).deposit(depositAmount1, alice.address);

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, Tier.ONE, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const time1_ = await logic.stackTop();

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

    const blockTime1_ = await getBlockTimestamp();

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, Tier.TWO, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const timeTWO_ = await logic.stackTop();

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, Tier.ONE, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const time2_ = await logic.stackTop();

    assert(timeTWO_.eq(blockTime1_), "did not exceed 2nd threshold");
    assert(time2_.eq(time0_), "did not return earliest time above threshold");
  });

  it("should reset earliest time using ITIERV2_REPORT_TIME_FOR_TIER if user briefly fails to exceed 1st threshold (e.g. user is not eligible for tier rewards if they had no stake for the period of time in which they were awarded)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[1];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and desposit them
    const depositAmount0 = THRESHOLDS[0].add(1); // exceeds 1st threshold
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const blockTime0_ = await getBlockTimestamp();

    // prettier-ignore
    const source = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.CALLER), // address
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // THRESHOLD
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 6)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 7)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 8)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 9)),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length),
    ]);

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, Tier.ONE, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const time0_ = await logic.stackTop();

    assert(time0_.eq(blockTime0_));

    await timewarp(86400);

    // Alice withdraws tokens
    const withdrawAmount = 100;
    await stake
      .connect(alice)
      .withdraw(withdrawAmount, alice.address, alice.address);

    await logic.connect(alice)["run()"]();

    const time1_ = await logic.stackTop();

    assert(
      time1_.eq(max_uint32),
      "withdraw did not reset tier ONE time, and did not cause user to fall to tier ZERO"
    );

    await timewarp(86400);

    // Alice deposits again, exceeding threshold again
    await token.connect(alice).approve(stake.address, withdrawAmount);
    await stake.connect(alice).deposit(withdrawAmount, alice.address);

    const blockTime2_ = await getBlockTimestamp();

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, Tier.ONE, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const time2_ = await logic.stackTop();

    assert(
      !time2_.eq(time0_),
      "wrongly returned earliest time as first time threshold was exceeded"
    );
    assert(
      time2_.eq(blockTime2_),
      "did not return earliest time as the new deposit to exceed threshold"
    );
  });

  it("should reset earliest time using ITIERV2_REPORT_TIME_FOR_TIER if user briefly fails to exceed all thresholds (e.g. user is not eligible for tier rewards if they had no stake for the period of time in which they were awarded)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[1];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and desposit them
    const depositAmount0 = THRESHOLDS[7].add(1); // exceeds all thresholds
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);
    const blockTime0_ = await getBlockTimestamp();

    // prettier-ignore
    const source = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.CALLER), // address
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // TIER
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // THRESHOLD
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 6)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 7)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 8)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 9)),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length),
    ]);

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, Tier.ONE, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const timeOne0_ = await logic.stackTop();

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, Tier.EIGHT, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const timeEight0_ = await logic.stackTop();

    assert(timeOne0_.eq(blockTime0_));
    assert(timeEight0_.eq(blockTime0_));

    await timewarp(86400);

    // Alice withdraws tokens
    const withdrawAmount = ethers.BigNumber.from(4000 + sixZeros);
    await stake
      .connect(alice)
      .withdraw(withdrawAmount, alice.address, alice.address);

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, Tier.ONE, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const timeOne1_ = await logic.stackTop();

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, Tier.FOUR, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const timeFour1_ = await logic.stackTop();

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, Tier.EIGHT, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const timeEight1_ = await logic.stackTop();

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
    const blockTime2_ = await getBlockTimestamp();

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, Tier.ONE, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const timeOne2_ = await logic.stackTop();

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, Tier.EIGHT, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const timeEight2_ = await logic.stackTop();

    assert(timeOne2_.eq(blockTime0_));
    assert(timeEight2_.eq(blockTime2_));
  });
});
