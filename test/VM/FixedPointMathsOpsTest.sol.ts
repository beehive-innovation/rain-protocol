import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import { concat } from "ethers/lib/utils";
import { op } from "../Util";
import type { Contract, ContractFactory } from "ethers";

import type { FixedPointMathOpsTest } from "../../typechain/FixedPointMathOpsTest";

const { assert } = chai;

const enum Opcode {
  SKIP,
  VAL,
  DUP,
  ZIPMAP,
  DEBUG,
  SCALE18_MUL,
  SCALE18_DIV,
  SCALE18,
  SCALEN,
  SCALE_BY,
  ONE,
  DECIMALS,
}

let tokenOpsTestFactory: ContractFactory;

describe("FixedPointMathOpsTest", async function () {
  before(async () => {
    tokenOpsTestFactory = await ethers.getContractFactory(
      "FixedPointMathOpsTest"
    );
  });

  it("should return DECIMALS", async () => {
    this.timeout(0);

    const constants = [];

    // prettier-ignore
    const sources = [
      concat([
        op(Opcode.DECIMALS)
      ]),
    ];

    const tokenOpsTest = (await tokenOpsTestFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as FixedPointMathOpsTest & Contract;

    const result0 = await tokenOpsTest.run();
    const expected0 = 18;

    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should return ONE", async () => {
    this.timeout(0);

    const constants = [];

    // prettier-ignore
    const sources = [
      concat([
        op(Opcode.ONE)
      ]),
    ];

    const tokenOpsTest = (await tokenOpsTestFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as FixedPointMathOpsTest & Contract;

    const result0 = await tokenOpsTest.run();
    const expected0 = ethers.BigNumber.from(1 + Util.eighteenZeros);

    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale an arbitrary fixed point number DOWN by scale N", async () => {
    this.timeout(0);

    const value1 = ethers.BigNumber.from(1 + Util.sixZeros);
    const n = 0xfc; // -4

    const constants = [value1];
    const v1 = op(Opcode.VAL, 0);

    // prettier-ignore
    const sources = [
      concat([
          v1,
        op(Opcode.SCALE_BY, n)
      ]),
    ];

    const tokenOpsTest = (await tokenOpsTestFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as FixedPointMathOpsTest & Contract;

    const result0 = await tokenOpsTest.run();
    const expected0 = ethers.BigNumber.from(100);

    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale an arbitrary fixed point number UP by scale N", async () => {
    this.timeout(0);

    const value1 = ethers.BigNumber.from(1 + Util.sixZeros);
    const n = 0x04; // 4

    const constants = [value1];
    const v1 = op(Opcode.VAL, 0);

    // prettier-ignore
    const sources = [
      concat([
          v1,
        op(Opcode.SCALE_BY, n)
      ]),
    ];

    const tokenOpsTest = (await tokenOpsTestFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as FixedPointMathOpsTest & Contract;

    const result0 = await tokenOpsTest.run();
    const expected0 = ethers.BigNumber.from(1 + Util.sixZeros + "0000");

    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale an 18 OOMs number UP to scale N", async () => {
    this.timeout(0);

    const value1 = ethers.BigNumber.from(1 + Util.eighteenZeros);
    const n = 20;

    const constants = [value1];
    const v1 = op(Opcode.VAL, 0);

    // prettier-ignore
    const sources = [
      concat([
          v1,
        op(Opcode.SCALEN, n)
      ]),
    ];

    const tokenOpsTest = (await tokenOpsTestFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as FixedPointMathOpsTest & Contract;

    const result0 = await tokenOpsTest.run();
    const expected0 = ethers.BigNumber.from(1 + Util.eighteenZeros + "00");

    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale an 18 OOMs number DOWN to scale N", async () => {
    this.timeout(0);

    const value1 = ethers.BigNumber.from(1 + Util.eighteenZeros);
    const n = 6;

    const constants = [value1];
    const v1 = op(Opcode.VAL, 0);

    // prettier-ignore
    const sources = [
      concat([
          v1,
        op(Opcode.SCALEN, n)
      ]),
    ];

    const tokenOpsTest = (await tokenOpsTestFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as FixedPointMathOpsTest & Contract;

    const result0 = await tokenOpsTest.run();
    const expected0 = ethers.BigNumber.from(1 + Util.sixZeros);

    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale a number by 18 OOM while dividing", async () => {
    this.timeout(0);

    const value1 = 50;
    const value2 = 3;

    const constants = [value1, value2];
    const v1 = op(Opcode.VAL, 0);
    const v2 = op(Opcode.VAL, 1);

    // prettier-ignore
    const sources = [
      concat([
          v1,
          v2,
        op(Opcode.SCALE18_DIV)
      ]),
    ];

    const tokenOpsTest = (await tokenOpsTestFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as FixedPointMathOpsTest & Contract;

    const result0 = await tokenOpsTest.run();
    const expected0 = ethers.BigNumber.from(value1 + Util.eighteenZeros).div(
      value2
    );
    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale a number by 18 OOM while multiplying", async () => {
    this.timeout(0);

    const value1 = 1;
    const value2 = 2;

    const constants = [value1, value2];
    const v1 = op(Opcode.VAL, 0);
    const v2 = op(Opcode.VAL, 1);

    // prettier-ignore
    const sources = [
      concat([
          v1,
          v2,
        op(Opcode.SCALE18_MUL)
      ]),
    ];

    const tokenOpsTest = (await tokenOpsTestFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as FixedPointMathOpsTest & Contract;

    const result0 = await tokenOpsTest.run();
    const expected0 = ethers.BigNumber.from(value1 + Util.eighteenZeros).mul(
      value2
    );
    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale a number by 18 OOM in situ", async () => {
    this.timeout(0);

    const value = 1;

    const constants = [value];
    const v1 = op(Opcode.VAL, 0);

    // prettier-ignore
    const sources = [
      concat([
          v1,
        op(Opcode.SCALE18)
      ]),
    ];

    const tokenOpsTest = (await tokenOpsTestFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as FixedPointMathOpsTest & Contract;

    const result0 = await tokenOpsTest.run();
    const expected0 = ethers.BigNumber.from(value + Util.eighteenZeros);
    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });
});
