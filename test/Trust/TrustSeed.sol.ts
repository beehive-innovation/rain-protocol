import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { ReserveToken } from "../../typechain/ReserveToken";
import type { SeedERC20 } from "../../typechain/SeedERC20";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { RedeemableERC20Pool } from "../../typechain/RedeemableERC20Pool";
import type { RedeemableERC20 } from "../../typechain/RedeemableERC20";
import type { Trust } from "../../typechain/Trust";
import { factoriesDeploy } from "../Util";

chai.use(solidity);
const { expect, assert } = chai;

enum Tier {
  NIL,
  COPPER,
  BRONZE,
  SILVER,
  GOLD,
  PLATINUM,
  DIAMOND,
  CHAD,
  JAWAD,
}

enum Phase {
  ZERO,
  ONE,
  TWO,
  THREE,
  FOUR,
  FIVE,
  SIX,
  SEVEN,
  EIGHT,
}

const trustJson = require("../../artifacts/contracts/Trust.sol/Trust.json");
const poolJson = require("../../artifacts/contracts/RedeemableERC20Pool.sol/RedeemableERC20Pool.json");
const seedERC20Json = require("../../artifacts/contracts/SeedERC20.sol/SeedERC20.json");
const bPoolJson = require("../../artifacts/contracts/configurable-rights-pool/contracts/test/BPool.sol/BPool.json");
const reserveJson = require("../../artifacts/contracts/test/ReserveToken.sol/ReserveToken.json");
const redeemableTokenJson = require("../../artifacts/contracts/RedeemableERC20.sol/RedeemableERC20.json");
const crpJson = require("../../artifacts/contracts/configurable-rights-pool/contracts/ConfigurableRightsPool.sol/ConfigurableRightsPool.json");

describe("TrustSeed", async function () {
  it("should allow unseeding only after unseed delay period", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const creator = signers[0];
    const deployer = signers[1]; // deployer is not creator
    const seeder1 = signers[2];
    const seeder2 = signers[3];

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 10;
    const seederCooldownDuration = 5;
    const seedPrice = reserveInit.div(10);

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactoryDeployer = trustFactory.connect(deployer);

    const trust = await Util.trustDeploy(
      trustFactoryDeployer,
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seeder: Util.zeroAddress,
        seederFee,
        seederUnits,
        seederCooldownDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
        minimumStatus,
        totalSupply: totalTokenSupply,
      },
      {
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
        minimumTradingDuration,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const seeder = await trust.seeder();
    const seederContract = new ethers.Contract(
      seeder,
      seedERC20Json.abi,
      signers[0]
    ) as SeedERC20;

    const seeder1Units = 4;

    // seeders needs some cash, give enough each for seeding
    await reserve.transfer(seeder1.address, seedPrice.mul(seeder1Units));
    await reserve.transfer(seeder2.address, seedPrice.mul(1));

    const seederContract1 = seederContract.connect(seeder1);
    const seederContract2 = seederContract.connect(seeder2);
    const reserve1 = reserve.connect(seeder1);
    const reserve2 = reserve.connect(seeder2);

    await reserve1.approve(seederContract.address, seedPrice.mul(seeder1Units));
    await reserve2.approve(seederContract.address, seedPrice.mul(1));

    // seeder1 sends reserve to seeder contract
    await seederContract1.seed(0, seeder1Units);
    const seed1Block = await ethers.provider.getBlockNumber();
    const delay1UnlockBlock = seed1Block + seederCooldownDuration;

    let seed2Block;
    let delay2UnlockBlock;

    // make blocks until delay period over
    for (
      let i = 0;
      delay1UnlockBlock > (await ethers.provider.getBlockNumber()) + 1;
      i++
    ) {
      await Util.assertError(
        async () => await seederContract1.unseed(1),
        "revert COOLDOWN",
        `seeder1 unseeded before their cooldown
        lastBlock   ${await ethers.provider.getBlockNumber()}
        unlockBlock ${delay1UnlockBlock}`
      );

      if (i === 1) {
        // seeder2 sends 1 unit to seeder contract
        await seederContract2.seed(0, 1);
        console.log("seeder2 seeded contract");

        seed2Block = await ethers.provider.getBlockNumber();
        delay2UnlockBlock = seed2Block + seederCooldownDuration;
      } else {
        // create a block
        await reserve.transfer(signers[9].address, 0);
      }
    }

    // now seeder1 can unseed
    await seederContract1.unseed(seeder1Units);

    // unseed delay should be on a per-seeder basis
    for (
      let i = 0;
      delay2UnlockBlock > (await ethers.provider.getBlockNumber()) + 1;
      i++
    ) {
      await Util.assertError(
        async () => await seederContract2.unseed(1),
        "revert COOLDOWN",
        `seeder2 unseeded before their cooldown
        lastBlock   ${await ethers.provider.getBlockNumber()}
        unlockBlock ${delay2UnlockBlock}`
      );
      await reserve.transfer(signers[9].address, 0);
    }

    // now seeder2 can unseed
    await seederContract2.unseed(1);
  });

  it("should mint correct number of seed units on construction", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const seedFactory = await ethers.getContractFactory("SeedERC20");

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);

    const seeder1 = signers[2];

    const seedUnits = 10;
    const cooldownDuration = 1;
    const seedPrice = reserveInit.div(10);

    // seeder1 creates seeder contract
    const seederFactory = new ethers.ContractFactory(
      seedFactory.interface,
      seedFactory.bytecode,
      seeder1
    );

    const seederContract = (await seederFactory.deploy({
      reserve: reserve.address,
      recipient: signers[0].address,
      seedPrice,
      seedUnits,
      cooldownDuration,
      name: "seed",
      symbol: "SD",
    })) as SeedERC20;

    await seederContract.deployed();

    assert(
      (await seederContract.totalSupply()).eq(seedUnits),
      "incorrect number of seed units minted on construction"
    );
  });

  describe("should revert if parameters set to 0", async function () {
    it("seederUnits set to 0", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const reserve = (await Util.basicDeploy(
        "ReserveToken",
        {}
      )) as ReserveToken;

      const seedFactory = await ethers.getContractFactory("SeedERC20");

      const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);

      const seeder1 = signers[2];

      const seedUnits = 0;
      const cooldownDuration = 1;
      const seedPrice = reserveInit.div(10);

      // seeder1 creates seeder contract
      const seederFactory = new ethers.ContractFactory(
        seedFactory.interface,
        seedFactory.bytecode,
        seeder1
      );

      await Util.assertError(
        async () =>
          (await seederFactory.deploy({
            reserve: reserve.address,
            recipient: signers[0].address,
            seedPrice,
            seedUnits,
            cooldownDuration,
            name: "seed",
            symbol: "SD",
          })) as SeedERC20,
        "revert UNITS_0",
        "seeder contract was wrongly constructed with seedUnits set to 0"
      );
    });

    it("seedPrice set to 0", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const reserve = (await Util.basicDeploy(
        "ReserveToken",
        {}
      )) as ReserveToken;

      const seedFactory = await ethers.getContractFactory("SeedERC20");

      const seeder1 = signers[2];

      const seedUnits = 10;
      const cooldownDuration = 1;
      const seedPrice = 0;

      // seeder1 creates seeder contract
      const seederFactory = new ethers.ContractFactory(
        seedFactory.interface,
        seedFactory.bytecode,
        seeder1
      );

      await Util.assertError(
        async () =>
          (await seederFactory.deploy({
            reserve: reserve.address,
            recipient: signers[0].address,
            seedPrice,
            seedUnits,
            cooldownDuration,
            name: "seed",
            symbol: "SD",
          })) as SeedERC20,
        "revert PRICE_0",
        "seeder contract was wrongly constructed with seedPrice set to 0"
      );
    });
  });

  it("should set phase ONE when fully seeded", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const creator = signers[0];
    const deployer = signers[1]; // deployer is not creator
    const seeder1 = signers[2];
    const seeder2 = signers[3];

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 10;
    const seederCooldownDuration = 1;
    const seedPrice = reserveInit.div(10);

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactoryDeployer = trustFactory.connect(deployer);

    const trust = await Util.trustDeploy(
      trustFactoryDeployer,
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seeder: Util.zeroAddress,
        seederFee,
        seederUnits,
        seederCooldownDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
        minimumStatus,
        totalSupply: totalTokenSupply,
      },
      {
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
        minimumTradingDuration,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const seeder = await trust.seeder();
    const seederContract = new ethers.Contract(
      seeder,
      seedERC20Json.abi,
      signers[0]
    ) as SeedERC20;

    const seeder1Units = 4;
    const seeder2Units = 6;

    // seeders needs some cash, give enough each for seeding
    await reserve.transfer(seeder1.address, seedPrice.mul(seeder1Units));
    await reserve.transfer(seeder2.address, seedPrice.mul(seeder2Units));

    const seederContract1 = seederContract.connect(seeder1);
    const seederContract2 = seederContract.connect(seeder2);
    const reserve1 = reserve.connect(seeder1);
    const reserve2 = reserve.connect(seeder2);

    await reserve1.approve(seederContract.address, seedPrice.mul(seeder1Units));
    await reserve2.approve(seederContract.address, seedPrice.mul(seeder2Units));

    // seeders send reserve to seeder contract
    await seederContract1.seed(0, seeder1Units);

    assert(
      (await seederContract.currentPhase()) === Phase.ZERO,
      `should be phase ZERO before fully seeded, got ${await seederContract.currentPhase()}`
    );

    await seederContract2.seed(0, seeder2Units);

    assert(
      (await seederContract.phaseBlocks(0)) ===
        (await ethers.provider.getBlockNumber()),
      `phase ONE block wasn't set when fully seeded`
    );

    assert(
      (await seederContract.currentPhase()) === Phase.ONE,
      `should be phase ONE when fully seeded, got ${await seederContract.currentPhase()}`
    );
  });

  it("should allow trust to build SeedERC20 on construction and begin raise with sufficient funds", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const creator = signers[0];
    const deployer = signers[1]; // deployer is not creator
    const seeder1 = signers[2];
    const seeder2 = signers[3];

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 10;
    const seederCooldownDuration = 1;
    const seedPrice = reserveInit.div(10);

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactoryDeployer = trustFactory.connect(deployer);

    const trust = await Util.trustDeploy(
      trustFactoryDeployer,
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seeder: Util.zeroAddress,
        seederFee,
        seederUnits,
        seederCooldownDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
        minimumStatus,
        totalSupply: totalTokenSupply,
      },
      {
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
        minimumTradingDuration,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const seederContract = new ethers.Contract(
      await trust.seeder(),
      seedERC20Json.abi,
      signers[0]
    ) as SeedERC20;

    const seeder1Units = 4;
    const seeder2Units = 6;

    // seeders needs some cash, give enough each for seeding
    await reserve.transfer(seeder1.address, seedPrice.mul(seeder1Units));
    await reserve.transfer(seeder2.address, seedPrice.mul(seeder2Units));

    const seederContract1 = seederContract.connect(seeder1);
    const seederContract2 = seederContract.connect(seeder2);
    const reserve1 = reserve.connect(seeder1);
    const reserve2 = reserve.connect(seeder2);

    await reserve1.approve(seederContract.address, seedPrice.mul(seeder1Units));
    await reserve2.approve(seederContract.address, seedPrice.mul(seeder2Units));

    // seeders send reserve to seeder contract
    await seederContract1.seed(0, seeder1Units);

    const pool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool;

    await Util.assertError(
      async () => await pool.startDutchAuction({ gasLimit: 100000000 }),
      "revert ERC20: transfer amount exceeds balance",
      "raise begun with insufficient seed reserve"
    );

    await seederContract2.seed(0, seeder2Units);

    await pool.startDutchAuction({ gasLimit: 100000000 });
  });

  describe("should allow many seeders to seed trust", async function () {
    it("successful raise", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

      const reserve = (await Util.basicDeploy(
        "ReserveToken",
        {}
      )) as ReserveToken;

      const tierFactory = await ethers.getContractFactory("ReadWriteTier");
      const tier = (await tierFactory.deploy()) as ReadWriteTier;
      const minimumStatus = Tier.NIL;

      const { trustFactory } = await factoriesDeploy(
        rightsManager,
        crpFactory,
        bFactory
      );

      const seedFactory = await ethers.getContractFactory("SeedERC20");

      const tokenName = "Token";
      const tokenSymbol = "TKN";

      const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const totalTokenSupply = ethers.BigNumber.from(
        "2000" + Util.eighteenZeros
      );
      const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
      const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

      const creator = signers[0];
      const deployer = signers[1]; // deployer is not creator
      const seeder1 = signers[2];
      const seeder2 = signers[3];
      const signer1 = signers[4];

      const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
      const seederUnits = 10;
      const seederCooldownDuration = 1;
      const seedPrice = reserveInit.div(10);

      const successLevel = redeemInit
        .add(minimumCreatorRaise)
        .add(seederFee)
        .add(reserveInit);
      const finalValuation = successLevel;

      const minimumTradingDuration = 50;

      const trustFactoryDeployer = trustFactory.connect(deployer);

      const trust = await Util.trustDeploy(
        trustFactoryDeployer,
        creator,
        {
          creator: creator.address,
          minimumCreatorRaise,
          seeder: Util.zeroAddress,
          seederFee,
          seederUnits,
          seederCooldownDuration,
          redeemInit,
        },
        {
          name: tokenName,
          symbol: tokenSymbol,
          tier: tier.address,
          minimumStatus,
          totalSupply: totalTokenSupply,
        },
        {
          reserve: reserve.address,
          reserveInit,
          initialValuation,
          finalValuation,
          minimumTradingDuration,
        },
        { gasLimit: 100000000 }
      );

      await trust.deployed();

      const seeder = await trust.seeder();
      const seederContract = new ethers.Contract(
        seeder,
        seedERC20Json.abi,
        signers[0]
      ) as SeedERC20;

      const token = new ethers.Contract(
        await trust.token(),
        redeemableTokenJson.abi,
        creator
      ) as RedeemableERC20;
      const pool = new ethers.Contract(
        await trust.pool(),
        poolJson.abi,
        creator
      ) as RedeemableERC20Pool;

      const recipient = await trust.pool();

      const seeder1Units = 4;
      const seeder2Units = 6;

      // seeders needs some cash, give enough each for seeding
      await reserve.transfer(seeder1.address, seedPrice.mul(seeder1Units));
      await reserve.transfer(seeder2.address, seedPrice.mul(seeder2Units));

      const seederContract1 = seederContract.connect(seeder1);
      const seederContract2 = seederContract.connect(seeder2);
      const reserve1 = reserve.connect(seeder1);
      const reserve2 = reserve.connect(seeder2);

      await reserve1.approve(
        seederContract.address,
        seedPrice.mul(seeder1Units)
      );
      await reserve2.approve(
        seederContract.address,
        seedPrice.mul(seeder2Units)
      );

      // seeders send reserve to seeder contract
      await seederContract1.seed(0, seeder1Units);

      await Util.assertError(
        async () => await pool.startDutchAuction({ gasLimit: 100000000 }),
        "revert ERC20: transfer amount exceeds balance",
        "raise begun with insufficient seed reserve"
      );

      await seederContract2.seed(0, seeder2Units);

      // seeder cannot unseed after all units seeded
      await Util.assertError(
        async () => await seederContract1.unseed(seeder1Units),
        "revert BAD_PHASE",
        "seeder1 unseeded despite all units being seeded"
      );

      // Recipient gains infinite approval on reserve token withdrawals from seed contract
      const recipientAllowance = await reserve.allowance(
        seederContract.address,
        recipient
      );

      const max_uint256 = ethers.BigNumber.from(
        "115792089237316195423570985008687907853269984665640564039457584007913129639935"
      );

      assert(
        (await reserve.balanceOf(seederContract.address)).isZero(),
        `seeder contract should have transferred all funds to recipient
        expected  0
        actual    ${await reserve.balanceOf(seederContract.address)}
      `
      );

      assert(
        (await reserve.balanceOf(pool.address)).eq(reserveInit),
        `pool should have received all funds from seeder contract
        expected  ${reserveInit}
        actual    ${await reserve.balanceOf(pool.address)}
      `
      );

      await pool.startDutchAuction({ gasLimit: 100000000 });

      let [crp, bPool] = await Util.poolContracts(signers, pool);

      const startBlock = await ethers.provider.getBlockNumber();

      assert(
        (await reserve.balanceOf(seederContract.address)).isZero(),
        `seeder contract wrongly holding reserve after raise started`
      );

      const reserveSpend = finalValuation.div(10);

      // holder1 fully funds raise
      const swapReserveForTokens = async (signer, spend) => {
        // give signer some reserve
        await reserve.transfer(signer.address, spend);

        const reserveSigner = reserve.connect(signer);
        const crpSigner = crp.connect(signer);
        const bPoolSigner = bPool.connect(signer);

        await reserveSigner.approve(bPool.address, spend);
        await crpSigner.pokeWeights();
        await bPoolSigner.swapExactAmountIn(
          reserve.address,
          spend,
          token.address,
          ethers.BigNumber.from("1"),
          ethers.BigNumber.from("1000000" + Util.sixZeros)
        );
      };

      while ((await reserve.balanceOf(bPool.address)).lte(successLevel)) {
        await swapReserveForTokens(signer1, reserveSpend);
      }

      // add blocks until raise can end
      while (
        (await ethers.provider.getBlockNumber()) <=
        startBlock + minimumTradingDuration
      ) {
        await reserve.transfer(signers[9].address, 0);
      }

      // seeder redeeming fails if no reserve balance (raise hasn't ended)
      await Util.assertError(
        async () => await seederContract1.redeem(seeder1Units),
        "revert RESERVE_BALANCE",
        "seeder1 redeemed when seeder contract had zero reserve balance"
      );

      // seeder1 ends raise
      await trust.connect(seeder1).anonEndDistribution();

      const poolDust = await reserve.balanceOf(bPool.address);

      // on successful raise, seeder gets reserveInit + seederFee - dust
      const expectedSeederPay = reserveInit.add(seederFee).sub(poolDust);

      // seederContract should now hold reserve equal to final balance
      assert(
        (await reserve.balanceOf(seederContract.address)).eq(expectedSeederPay),
        `seeder contract has wrong reserve amount after failed raise ended
      expected  ${expectedSeederPay}
      actual    ${await reserve.balanceOf(seederContract.address)}`
      );

      // seeders redeem funds
      await seederContract1.redeem(seeder1Units);

      // correct amount of units should have been redeemed
      assert(
        (await seederContract.totalSupply()).eq(seeder2Units),
        "wrong total seeder units supply"
      );

      const expectedReturn1 = expectedSeederPay
        .mul(seeder1Units)
        .div(seederUnits);

      // correct amount of reserve should have been returned
      assert(
        (await reserve.balanceOf(seeder1.address)).eq(expectedReturn1),
        `wrong reserve returned to seeder1 after redeeming
      expected  ${expectedReturn1}
      actual    ${await reserve.balanceOf(seeder1.address)}
      `
      );

      await seederContract2.redeem(seeder2Units);

      // correct amount of units should have been redeemed
      assert(
        (await seederContract.totalSupply()).isZero(),
        "wrong total seeder units supply"
      );

      // add 1 to offset rounding error
      const expectedReturn2 = expectedSeederPay
        .mul(seeder2Units)
        .div(seederUnits)
        .add(1);
      const return2 = await reserve.balanceOf(seeder2.address);

      // correct amount of reserve should have been returned
      assert(
        return2.eq(expectedReturn2),
        `wrong reserve returned to seeder2 after redeeming
      expected  ${expectedReturn2}
      actual    ${return2}
      `
      );

      // fails if they don't have seed units
      await Util.assertError(
        async () => await seederContract1.redeem(seeder1Units),
        "revert ERC20: burn amount exceeds balance",
        "seeder1 redeemed when they had no seed units to redeem"
      );
    });

    it("failed raise", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

      const reserve = (await Util.basicDeploy(
        "ReserveToken",
        {}
      )) as ReserveToken;

      const tierFactory = await ethers.getContractFactory("ReadWriteTier");
      const tier = (await tierFactory.deploy()) as ReadWriteTier;
      const minimumStatus = Tier.NIL;

      const { trustFactory } = await factoriesDeploy(
        rightsManager,
        crpFactory,
        bFactory
      );

      const seedFactory = await ethers.getContractFactory("SeedERC20");

      const tokenName = "Token";
      const tokenSymbol = "TKN";

      const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const totalTokenSupply = ethers.BigNumber.from(
        "2000" + Util.eighteenZeros
      );
      const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
      const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

      const creator = signers[0];
      const deployer = signers[1]; // deployer is not creator
      const seeder1 = signers[2];
      const seeder2 = signers[3];

      const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
      const seederUnits = 10;
      const seederCooldownDuration = 1;
      const seedPrice = reserveInit.div(seederUnits);

      const successLevel = redeemInit
        .add(minimumCreatorRaise)
        .add(seederFee)
        .add(reserveInit);

      const minimumTradingDuration = 50;

      const trustFactoryDeployer = trustFactory.connect(deployer);

      const trust = await Util.trustDeploy(
        trustFactoryDeployer,
        creator,
        {
          creator: creator.address,
          minimumCreatorRaise,
          seeder: Util.zeroAddress,
          seederFee,
          seederUnits,
          seederCooldownDuration,
          redeemInit,
        },
        {
          name: tokenName,
          symbol: tokenSymbol,
          tier: tier.address,
          minimumStatus,
          totalSupply: totalTokenSupply,
        },
        {
          reserve: reserve.address,
          reserveInit,
          initialValuation,
          finalValuation: successLevel,
          minimumTradingDuration,
        },
        { gasLimit: 100000000 }
      );

      await trust.deployed();

      const seeder = await trust.seeder();
      const seederContract = new ethers.Contract(
        seeder,
        seedERC20Json.abi,
        signers[0]
      ) as SeedERC20;

      const pool = new ethers.Contract(
        await trust.pool(),
        poolJson.abi,
        creator
      ) as RedeemableERC20Pool;

      const seeder1Units = 4;
      const seeder2Units = 6;

      // seeders needs some cash, give enough each for seeding
      await reserve.transfer(seeder1.address, seedPrice.mul(seeder1Units));
      await reserve.transfer(seeder2.address, seedPrice.mul(seeder2Units));

      const seederContract1 = seederContract.connect(seeder1);
      const seederContract2 = seederContract.connect(seeder2);
      const reserve1 = reserve.connect(seeder1);
      const reserve2 = reserve.connect(seeder2);

      await reserve1.approve(
        seederContract.address,
        seedPrice.mul(seeder1Units)
      );
      await reserve2.approve(
        seederContract.address,
        seedPrice.mul(seeder2Units)
      );

      // seeders send reserve to seeder contract
      await seederContract1.seed(0, seeder1Units);

      await Util.assertError(
        async () => await pool.startDutchAuction({ gasLimit: 100000000 }),
        "revert ERC20: transfer amount exceeds balance",
        "raise begun with insufficient seed reserve"
      );

      // redeem fails before seeding is complete
      await Util.assertError(
        async () => await seederContract1.redeem(seeder1Units),
        "revert BAD_PHASE",
        "redeemed before seeding is complete"
      );

      await seederContract2.seed(0, seeder2Units);

      assert(
        (await reserve.balanceOf(seederContract.address)).isZero(),
        `seeder contract should have transferred all funds to recipient
        expected  0
        actual    ${await reserve.balanceOf(seederContract.address)}
      `
      );

      assert(
        (await reserve.balanceOf(pool.address)).eq(reserveInit),
        `pool should have received all funds from seeder contract
        expected  ${reserveInit}
        actual    ${await reserve.balanceOf(pool.address)}
      `
      );

      await pool.startDutchAuction({ gasLimit: 100000000 });

      let [crp, bPool] = await Util.poolContracts(signers, pool);

      const startBlock = await ethers.provider.getBlockNumber();

      assert(
        (await reserve.balanceOf(seederContract.address)).isZero(),
        `seeder contract wrongly holding reserve after raise started`
      );

      // add blocks until failed raise
      while (
        (await ethers.provider.getBlockNumber()) <=
        startBlock + minimumTradingDuration
      ) {
        await reserve.transfer(signers[9].address, 0);
      }

      const bPoolFinalBalance = await reserve.balanceOf(bPool.address);
      const bPoolReserveDust =
        Util.estimateReserveDust(bPoolFinalBalance).add(1);

      const trustFinalBalance = bPoolFinalBalance.sub(bPoolReserveDust);

      const expectedSeederPay = reserveInit.lte(trustFinalBalance)
        ? reserveInit
        : trustFinalBalance;

      // seeder redeeming fails if no reserve balance (raise hasn't ended)
      await Util.assertError(
        async () => await seederContract1.redeem(seeder1Units),
        "revert RESERVE_BALANCE",
        "seeder1 redeemed when seeder contract had zero reserve balance"
      );

      // seeder1 ends raise
      await trust.connect(seeder1).anonEndDistribution();

      // seederContract should now hold reserve equal to final balance
      assert(
        (await reserve.balanceOf(seederContract.address)).eq(expectedSeederPay),
        `seeder contract has wrong reserve amount after failed raise ended
      expected  ${expectedSeederPay}
      actual    ${await reserve.balanceOf(seederContract.address)}`
      );

      // seeders redeem funds
      await seederContract1.redeem(seeder1Units);

      // correct amount of units should have been redeemed
      assert(
        (await seederContract.totalSupply()).eq(seeder2Units),
        "wrong total seeder units supply"
      );

      const expectedReturn1 = trustFinalBalance
        .mul(seeder1Units)
        .div(seederUnits);

      // correct amount of reserve should have been returned
      assert(
        (await reserve.balanceOf(seeder1.address)).eq(expectedReturn1),
        `wrong reserve returned to seeder1 after redeeming
      expected  ${expectedReturn1}
      actual    ${await reserve.balanceOf(seeder1.address)}
      `
      );

      await seederContract2.redeem(seeder2Units);

      // correct amount of units should have been redeemed
      assert(
        (await seederContract.totalSupply()).isZero(),
        "wrong total seeder units supply"
      );

      const expectedReturn2 = trustFinalBalance
        .mul(seeder2Units)
        .div(seederUnits)
        .add(1);

      // correct amount of reserve should have been returned
      assert(
        (await reserve.balanceOf(seeder2.address)).eq(expectedReturn2),
        `wrong reserve returned to seeder2 after redeeming
      expected  ${expectedReturn2}
      actual    ${await reserve.balanceOf(seeder2.address)}
      `
      );

      // fails if they don't have seed units
      await Util.assertError(
        async () => await seederContract1.redeem(seeder1Units),
        "revert ERC20: burn amount exceeds balance",
        "seeder1 redeemed when they had no seed units to redeem"
      );
    });
  });
});
