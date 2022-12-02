import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowERC20Factory } from "../../../typechain/contracts/flow/erc20";
import {
  RAIN_FLOW_ERC20_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { flowERC20Deploy } from "../../../utils/deploy/flow/flowERC20/deploy";
import { getEvents } from "../../../utils/events";
import { RainterpreterOps } from "../../../utils/interpreter/ops/allStandardOps";

import { ReserveToken18 } from "../../../typechain";
import { FlowTransferStruct } from "../../../typechain/contracts/flow/erc20/FlowERC20";
import { assertError, basicDeploy, eighteenZeros } from "../../../utils";
import { flowERC20FactoryDeploy } from "../../../utils/deploy/flow/flowERC20/flowERC20Factory/deploy";
import {
  Debug,
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { FlowERC20Config } from "../../../utils/types/flow";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";

const Opcode = RainterpreterOps;

describe("FlowERC20 flowTime tests", async function () {
  let flowERC20Factory: FlowERC20Factory;
  const ME = () => op(Opcode.CALLER);
  const YOU = () => op(Opcode.CONTEXT, 0x0000);

  before(async () => {
    flowERC20Factory = await flowERC20FactoryDeploy();
  });

  it("should support gating flows where a flow time has already been registered for the given id", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const erc20In = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await erc20In.initialize();

    const erc20Out = (await basicDeploy(
      "ReserveToken18",
      {}
    )) as ReserveToken18;
    await erc20Out.initialize();

    const flowTransfer: FlowTransferStruct = {
      native: [],
      erc20: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc20In.address,
          amount: ethers.BigNumber.from(1 + eighteenZeros),
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc20Out.address,
          amount: ethers.BigNumber.from(2 + eighteenZeros),
        },
      ],
      erc721: [],
      erc1155: [],
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowTransfer.erc20[0].token,
      flowTransfer.erc20[0].amount,
      flowTransfer.erc20[1].token,
      flowTransfer.erc20[1].amount,
      RAIN_FLOW_ERC20_SENTINEL,
    ];

    const SENTINEL = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
    const ONE = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5));

    const SENTINEL_ERC20 = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 6));

    const CONTEXT_FLOW_ID = () => op(Opcode.CONTEXT, 0x0001);

    const FLOW_TIME = () => [
      CONTEXT_FLOW_ID(), // k_
      op(Opcode.GET),
    ];

    const sourceFlowIO = concat([
      // CAN FLOW
      ...FLOW_TIME(),
      op(Opcode.ISZERO),
      op(Opcode.ENSURE, 1),

      SENTINEL(), // ERC115 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 END
      FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT(),
      FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT(),
      SENTINEL(), // NATIVE SKIP

      SENTINEL_ERC20(), // BURN SKIP
      SENTINEL_ERC20(), // MINT END

      // Setting Flow Time
      CONTEXT_FLOW_ID(), // k_
      op(Opcode.BLOCK_TIMESTAMP), // v__
      op(Opcode.SET),
    ]);

    const sources = [ONE()]; // can transfer

    const flowConfigStruct: FlowERC20Config = {
      stateConfig: { sources, constants },
      flows: [{ sources: [sourceFlowIO], constants }],
      name: "FlowERC20",
      symbol: "FWIN20",
    };

    const { flow } = await flowERC20Deploy(
      deployer,
      flowERC20Factory,
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const me = flow;

    // id 1234 - 1st flow

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    await flow.connect(you).flow(flowInitialized[0].dispatch, 1234, []);

    // id 5678 - 1st flow

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    await flow.connect(you).flow(flowInitialized[0].dispatch, 5678, []);

    // id 1234 - 2nd flow

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    await assertError(
      async () =>
        await flow.connect(you).flow(flowInitialized[0].dispatch, 1234, []),
      "Transaction reverted without a reason string",
      "did not gate flow where flow time already registered for the given flow & id"
    );
  });
});
