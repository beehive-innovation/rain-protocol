import { assert } from "chai";
import { ethers } from "hardhat";
import { AutoApproveFactory, VerifyFactory } from "../../../../typechain";
import {
  InitializeEvent,
  StateConfigStruct,
} from "../../../../typechain/contracts/verify/auto/AutoApprove";
import {
  autoApproveDeploy,
  autoApproveFactoryDeploy,
} from "../../../../utils/deploy/verify/auto/autoApprove/deploy";
import {
  verifyDeploy,
  verifyFactoryDeploy,
} from "../../../../utils/deploy/verify/deploy";
import { getEventArgs } from "../../../../utils/events";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { Opcode } from "../../../../utils/interpreter/ops/allStandardOps";
import { compareStructs } from "../../../../utils/test/compareStructs";

describe("AutoApprove construction", async function () {
  let autoApproveFactory: AutoApproveFactory;
  let verifyFactory: VerifyFactory;

  before(async () => {
    autoApproveFactory = await autoApproveFactoryDeploy();
    verifyFactory = await verifyFactoryDeploy();
  });

  it("should construct and initialize correctly", async () => {
    const signers = await ethers.getSigners();

    const deployer = signers[1];

    const stateConfig: StateConfigStruct = {
      sources: [op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0))],
      constants: [1],
    };

    const autoApprove = await autoApproveDeploy(
      deployer,
      autoApproveFactory,
      stateConfig
    );

    const { sender, config } = (await getEventArgs(
      autoApprove.deployTransaction,
      "Initialize",
      autoApprove
    )) as InitializeEvent["args"];
    assert(sender === autoApproveFactory.address, "wrong sender");
    compareStructs(config, stateConfig);
  });

  it("can be configured as verify callback contract", async () => {
    const signers = await ethers.getSigners();

    const deployer = signers[1];
    const admin = signers[2];

    const stateConfig: StateConfigStruct = {
      sources: [op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0))],
      constants: [1],
    };

    const autoApprove = await autoApproveDeploy(
      deployer,
      autoApproveFactory,
      stateConfig
    );

    await verifyDeploy(deployer, verifyFactory, {
      admin: admin.address,
      callback: autoApprove.address,
    });
  });
});
