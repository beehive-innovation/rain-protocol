import { concat, hexZeroPad } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  AutoApproveFactory,
  ReserveTokenERC721,
  VerifyFactory,
} from "../../../../typechain";
import { StateConfigStruct } from "../../../../typechain/contracts/verify/auto/AutoApprove";
import { ApproveEvent } from "../../../../typechain/contracts/verify/Verify";
import { basicDeploy } from "../../../../utils/deploy/basicDeploy";
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

describe("AutoApprove ERC721 ownership", async function () {
  let tokenERC721: ReserveTokenERC721;
  let autoApproveFactory: AutoApproveFactory;
  let verifyFactory: VerifyFactory;

  before(async () => {
    autoApproveFactory = await autoApproveFactoryDeploy();
    verifyFactory = await verifyFactoryDeploy();
  });

  beforeEach(async () => {
    tokenERC721 = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
  });

  it("should automatically approve only if account owns the NFT", async () => {
    const signers = await ethers.getSigners();

    const signer0 = signers[0];
    const deployer = signers[1];
    const admin = signers[2];
    const aprAdmin = signers[3];
    const signer1 = signers[4];

    const vTokenAddr = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const cAccount = op(Opcode.CONTEXT, 0x0000);
    const cNftId = op(Opcode.CONTEXT, 0x0001);

    const stateConfig: StateConfigStruct = {
      // prettier-ignore
      sources: [
        concat([
              vTokenAddr,
              cNftId,
            op(Opcode.IERC721_OWNER_OF),
            cAccount,
          op(Opcode.EQUAL_TO),
        ])],
      constants: [tokenERC721.address],
    };

    const autoApprove = await autoApproveDeploy(
      deployer,
      autoApproveFactory,
      stateConfig
    );

    const verify = await verifyDeploy(deployer, verifyFactory, {
      admin: admin.address,
      callback: autoApprove.address,
    });

    await autoApprove.connect(deployer).transferOwnership(verify.address);

    // make AutoApprove an approver
    await verify
      .connect(admin)
      .grantRole(await verify.APPROVER_ADMIN(), aprAdmin.address);
    await verify
      .connect(admin)
      .renounceRole(await verify.APPROVER_ADMIN(), admin.address);
    await verify
      .connect(aprAdmin)
      .grantRole(await verify.APPROVER(), autoApprove.address);

    // signer1 acquires NFT with id 1
    await tokenERC721.mintNewToken();
    await tokenERC721.transferFrom(signer0.address, signer1.address, 1);
    const evidenceAdd0 = hexZeroPad("0x1", 32);
    const addTx0 = await verify.connect(signer1).add(evidenceAdd0);
    (await getEventArgs(addTx0, "Approve", verify)) as ApproveEvent["args"];
  });
});
