import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { StandardIntegrity } from "../../../typechain/StandardIntegrity";
import { AllStandardOpsTest } from "../../../typechain/AllStandardOpsTest";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import {
  op,
  zipmapSize,
  memoryOperand,
  MemoryType,
} from "../../../utils/rainvm/vm";
import { assertError } from "../../../utils/test/assertError";

const Opcode = AllStandardOps;
describe("RainVM stack bounds", async function () {
  let integrity: StandardIntegrity;
  let logic: AllStandardOpsTest;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory(
      "StandardIntegrity"
    );
    integrity = (await integrityFactory.deploy()) as StandardIntegrity;
    await integrity.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      integrity.address
    )) as AllStandardOpsTest;
  });

  it("should error when script references out-of-bounds opcode", async () => {
    const constants = [];

    const sources = [concat([op(99)])];

    await assertError(
      async () => await logic.initialize({ sources, constants }),
      "Array accessed at an out-of-bounds or negative index",
      "did not error when script references out-of-bounds opcode"
    );
  });

  // it("should error when trying to read an out-of-bounds argument", async () => {
  //   const constants = [1, 2, 3];
  //   const v1 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
  //   const v2 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
  //   const v3 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

  //   const a0 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
  //   const a1 = op(Opcode.CONSTANT, 4);
  //   const aOOB = op(Opcode.CONSTANT, 6);

  //   // zero-based counting
  //   const sourceIndex = 1; // 1
  //   const loopSize = 0; // 1
  //   const valSize = 2; // 3

  //   // prettier-ignore
  //   const sources = [
  //     concat([
  //         v1,
  //         v2,
  //         v3,
  //       op(Opcode.ZIPMAP, zipmapSize(sourceIndex, loopSize, valSize)),
  //     ]),
  //     concat([
  //       // (arg0 arg1 arg2 add)
  //         a0,
  //         a1,
  //         aOOB,
  //       op(Opcode.ADD, 3),
  //     ]),
  //   ];

  //   await assertError(
  //     async () => await logic.initialize({ sources, constants }),
  //     "", // there is at least an error
  //     "did not error when trying to read an out-of-bounds argument"
  //   );
  // });

  it("should error when trying to read an out-of-bounds constant", async () => {
    const constants = [1];
    const vOOB = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    const sources = [concat([vOOB])];

    await assertError(
      async () => await logic.initialize({ sources, constants }),
      "", // there is at least an error
      "did not error when trying to read an out-of-bounds constant"
    );
  });

  it("should prevent bad RainVM script attempting to access stack index out of bounds (underflow)", async () => {
    const constants = [0, 1];
    const v0 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const v1 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const sources = [
      concat([
          v0,
          v1,
        op(Opcode.EAGER_IF),
      ]),
    ];

    await assertError(
      async () => await logic.initialize({ sources, constants }),
      "STACK_UNDERFLOW",
      "did not prevent bad RainVM script accessing stack index out of bounds"
    );
  });

  it("should prevent bad RainVM script attempting to access stack index out of bounds (overflow)", async () => {
    const constants = [3, 2, 1];
    const v3 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const v2 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const v1 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const sources = [
      concat([
        // (1 2 3 +)
          v1,
          v2,
          v3,
        op(Opcode.ADD, 4),
      ]),
    ];

    await assertError(
      async () => await logic.initialize({ sources, constants }),
      "STACK_UNDERFLOW",
      "did not prevent bad RainVM script accessing stack index out of bounds"
    );
  });
});
