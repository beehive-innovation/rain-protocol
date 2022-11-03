import { assert } from "chai";
import type { LibCastTest } from "../../../typechain";
import { randomUint256 } from "../../../utils/bytes";
import { libCastDeploy } from "../../../utils/deploy/type/libCast/deploy";

describe("LibCast asOpFunctionPointer tests", async function () {
  let libCast: LibCastTest;

  before(async () => {
    libCast = await libCastDeploy();
  });

  it("retypes an integer to an opcode function pointer without corrupting memory", async function () {
    const tx_ = await libCast.asOpFunctionPointer(randomUint256());

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");
  });

  it("retypes an array of integers to opcode function pointers without corrupting memory", async function () {
    const randomNums = [randomUint256(), randomUint256(), randomUint256()];

    const tx_ = await libCast.asOpFunctionPointers([...randomNums]);

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");
  });
});
