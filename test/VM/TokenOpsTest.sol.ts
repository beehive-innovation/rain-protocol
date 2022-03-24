import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import { concat } from "ethers/lib/utils";
import { op } from "../Util";
import type { Contract, ContractFactory } from "ethers";

import type { TokenOpsTest } from "../../typechain/TokenOpsTest";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ReserveToken } from "../../typechain/ReserveToken";
import { ReserveTokenERC721 } from "../../typechain/ReserveTokenERC721";
import { ReserveTokenERC1155 } from "../../typechain/ReserveTokenERC1155";

const { assert } = chai;

const enum Opcode {
  SKIP,
  VAL,
  DUP,
  ZIPMAP,
  DEBUG,
  ERC20_BALANCE_OF,
  ERC20_TOTAL_SUPPLY,
  ERC721_BALANCE_OF,
  ERC721_OWNER_OF,
  ERC1155_BALANCE_OF,
  ERC1155_BALANCE_OF_BATCH,
}

let signers: SignerWithAddress[];
let signer0: SignerWithAddress;
let signer1: SignerWithAddress;
let signer2: SignerWithAddress;

let tokenERC20: ReserveToken;
let tokenERC721: ReserveTokenERC721;
let tokenERC1155: ReserveTokenERC1155;

let tokenOpsTestFactory: ContractFactory;

describe("TokenOpsTest", async function () {
  before(async () => {
    tokenOpsTestFactory = await ethers.getContractFactory("TokenOpsTest");
  });

  beforeEach(async () => {
    signers = await ethers.getSigners();
    signer0 = signers[0];
    signer1 = signers[1];
    signer2 = signers[2];

    tokenERC20 = (await Util.basicDeploy("ReserveToken", {})) as ReserveToken &
      Contract;
    tokenERC721 = (await Util.basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721 & Contract;
    tokenERC1155 = (await Util.basicDeploy(
      "ReserveTokenERC1155",
      {}
    )) as ReserveTokenERC1155 & Contract;
  });

  it("should return ERC1155 batch balance result for multiple signers", async () => {
    this.timeout(0);

    const tokenId = 0;
    const length = 2;

    const constants = [
      signer1.address,
      signer2.address,
      tokenERC1155.address,
      tokenId,
    ];
    const vSigner1 = op(Opcode.VAL, 0);
    const vSigner2 = op(Opcode.VAL, 1);
    const vTokenAddr = op(Opcode.VAL, 2);
    const vTokenId = op(Opcode.VAL, 3);

    // prettier-ignore
    const sources = [
      concat([
          vTokenAddr,
          vSigner1,
          vSigner2,
          vTokenId,
          vTokenId,
        op(Opcode.ERC1155_BALANCE_OF_BATCH, length - 1)
      ]),
    ];

    const tokenOpsTest = (await tokenOpsTestFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 5,
    })) as TokenOpsTest & Contract;

    const transferAmount = 100;

    await tokenERC1155.safeTransferFrom(
      signer0.address,
      signer1.address,
      tokenId,
      transferAmount,
      []
    );
    await tokenERC1155.safeTransferFrom(
      signer0.address,
      signer2.address,
      tokenId,
      transferAmount * 2,
      []
    );

    const nativeBatchAmounts = await tokenERC1155.balanceOfBatch(
      [signer1.address, signer2.address],
      [tokenId, tokenId]
    );

    const opBatchAmounts = await tokenOpsTest.runLength(length);

    assert(
      nativeBatchAmounts.every((nativeAmount, i) =>
        nativeAmount.eq(opBatchAmounts[i])
      ),
      "balanceOfBatch op result does not match result from native call"
    );
  });

  it("should return ERC1155 balance of signer", async () => {
    this.timeout(0);

    const tokenId = 0;

    const constants = [signer1.address, tokenERC1155.address, tokenId];
    const vSigner1 = op(Opcode.VAL, 0);
    const vTokenAddr = op(Opcode.VAL, 1);
    const vTokenId = op(Opcode.VAL, 2);

    // prettier-ignore
    const sources = [
      concat([
          vTokenAddr,
          vSigner1,
          vTokenId,
        op(Opcode.ERC1155_BALANCE_OF)
      ]),
    ];

    const tokenOpsTest = (await tokenOpsTestFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as TokenOpsTest & Contract;

    const result0 = await tokenOpsTest.run();
    assert(result0.isZero(), `expected 0 of id ${tokenId}, got ${result0}`);

    const transferAmount = 100;

    await tokenERC1155.safeTransferFrom(
      signer0.address,
      signer1.address,
      tokenId,
      transferAmount,
      []
    );

    const signer1Balance = await tokenERC1155.balanceOf(
      signer1.address,
      tokenId
    );

    // just checking erc1155 logic
    assert(
      signer1Balance.eq(transferAmount),
      `wrong signer1Balance
      expected  ${transferAmount}
      got       ${signer1Balance}`
    );

    const result1 = await tokenOpsTest.run();
    assert(
      result1.eq(transferAmount),
      `expected ${transferAmount} of id ${tokenId}, got ${result1}`
    );
  });

  it("should return owner of specific ERC721 token", async () => {
    this.timeout(0);

    const nftId = 0;

    const constants = [nftId, tokenERC721.address];
    const vNftId = op(Opcode.VAL, 0);
    const vTokenAddr = op(Opcode.VAL, 1);

    // prettier-ignore
    const sources = [
      concat([
          vTokenAddr,
          vNftId,
        op(Opcode.ERC721_OWNER_OF)
      ]),
    ];

    const tokenOpsTest = (await tokenOpsTestFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as TokenOpsTest & Contract;

    const result0 = await tokenOpsTest.run();
    assert(result0.eq(signer0.address));

    await tokenERC721.transferFrom(signer0.address, signer1.address, nftId);

    const result1 = await tokenOpsTest.run();
    assert(result1.eq(signer1.address));
  });

  it("should return ERC721 balance of signer", async () => {
    this.timeout(0);

    const constants = [signer1.address, tokenERC721.address];
    const vSigner1 = op(Opcode.VAL, 0);
    const vTokenAddr = op(Opcode.VAL, 1);

    // prettier-ignore
    const sources = [
      concat([
          vTokenAddr,
          vSigner1,
        op(Opcode.ERC721_BALANCE_OF)
      ]),
    ];

    const tokenOpsTest = (await tokenOpsTestFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as TokenOpsTest & Contract;

    const result0 = await tokenOpsTest.run();
    assert(result0.isZero(), `expected 0, got ${result0}`);

    await tokenERC721.transferFrom(signer0.address, signer1.address, 0);

    const result1 = await tokenOpsTest.run();
    assert(result1.eq(1), `expected 1, got ${result1}`);

    await tokenERC721.mintNewToken();
    await tokenERC721.transferFrom(signer0.address, signer1.address, 1);

    const result2 = await tokenOpsTest.run();
    assert(result2.eq(2), `expected 2, got ${result2}`);
  });

  it("should return ERC20 total supply", async () => {
    this.timeout(0);

    const constants = [tokenERC20.address];
    const vTokenAddr = op(Opcode.VAL, 0);

    // prettier-ignore
    const sources = [
      concat([
          vTokenAddr,
        op(Opcode.ERC20_TOTAL_SUPPLY)
      ]),
    ];

    const tokenOpsTest = (await tokenOpsTestFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as TokenOpsTest & Contract;

    const result0 = await tokenOpsTest.run();
    const totalTokenSupply = await tokenERC20.totalSupply();
    assert(
      result0.eq(totalTokenSupply),
      `expected ${totalTokenSupply}, got ${result0}`
    );
  });

  it("should return ERC20 balance", async () => {
    this.timeout(0);

    const constants = [signer1.address, tokenERC20.address];
    const vSigner1 = op(Opcode.VAL, 0);
    const vTokenAddr = op(Opcode.VAL, 1);

    // prettier-ignore
    const sources = [
      concat([
          vTokenAddr,
          vSigner1,
        op(Opcode.ERC20_BALANCE_OF)
      ]),
    ];

    const tokenOpsTest = (await tokenOpsTestFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as TokenOpsTest & Contract;

    const result0 = await tokenOpsTest.run();
    assert(result0.isZero(), `expected 0, got ${result0}`);

    await tokenERC20.transfer(signer1.address, 100);

    const result1 = await tokenOpsTest.run();
    assert(result1.eq(100), `expected 100, got ${result1}`);
  });
});
