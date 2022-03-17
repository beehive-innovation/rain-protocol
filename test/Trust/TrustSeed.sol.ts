/* eslint-disable @typescript-eslint/no-var-requires */
import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import type { ReserveToken } from "../../typechain/ReserveToken";
import type { SeedERC20 } from "../../typechain/SeedERC20";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { RedeemableERC20 } from "../../typechain/RedeemableERC20";
import { factoriesDeploy } from "../Util";
import type { Contract } from "ethers";

const { assert } = chai;

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

enum SeedPhase {
  UNINITIALIZED,
  SEEDING,
  REDEEMING,
}

const seedERC20Json = require("../../artifacts/contracts/seed/SeedERC20.sol/SeedERC20.json");
const redeemableTokenJson = require("../../artifacts/contracts/redeemableERC20/RedeemableERC20.sol/RedeemableERC20.json");

describe("TrustSeed", async function () {
  it("should allow unseeding only after unseed delay period", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const deployer = signers[1]; // deployer is not creator
    const seeder1 = signers[2];
    const seeder2 = signers[3];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.GOLD;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const seederUnits = 10;
    const seedERC20Config = {
      name: "SeedToken",
      symbol: "SDT",
      distributor: Util.zeroAddress,
      initialSupply: seederUnits,
    };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
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
        seederFee,
        redeemInit,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
        minimumTradingDuration,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: tier.address,
        minimumTier,
      },
      {
        seeder: Util.zeroAddress,
        cooldownDuration: seederCooldownDuration,
        erc20Config: seedERC20Config,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const seeder = (
      await Util.getEventArgs(trust.deployTransaction, "Initialize", trust)
    ).seeder;
    const seederContract = new ethers.Contract(
      seeder,
      seedERC20Json.abi,
      signers[0]
    ) as SeedERC20 & Contract;

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
        "COOLDOWN",
        `seeder1 unseeded before their cooldown
        lastBlock   ${await ethers.provider.getBlockNumber()}
        unlockBlock ${delay1UnlockBlock}`
      );

      if (i === 1) {
        // seeder2 sends 1 unit to seeder contract
        await seederContract2.seed(0, 1);

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
        "COOLDOWN",
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

    const erc20PulleeFactory = await ethers.getContractFactory(
      "ERC20PulleeTest"
    );
    const erc20Pullee = await erc20PulleeFactory.deploy();
    await erc20Pullee.deployed();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);

    const seederUnits = 10;
    const cooldownDuration = 1;
    const seedPrice = reserveInit.div(10);

    const [seederContract] = await Util.seedERC20Deploy(signers[0], {
      reserve: reserve.address,
      recipient: erc20Pullee.address,
      seedPrice,
      cooldownDuration,
      erc20Config: {
        name: "SeedToken",
        symbol: "SDT",
        distributor: Util.zeroAddress,
        initialSupply: seederUnits,
      },
    });

    assert(
      (await seederContract.totalSupply()).eq(seederUnits),
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
      )) as ReserveToken & Contract;

      const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);

      const seederUnits = 0;
      const cooldownDuration = 1;
      const seedPrice = reserveInit.div(10);

      await Util.assertError(
        async () =>
          await Util.seedERC20Deploy(signers[0], {
            reserve: reserve.address,
            recipient: signers[0].address,
            seedPrice,
            cooldownDuration,
            erc20Config: {
              name: "SeedToken",
              symbol: "SDT",
              distributor: Util.zeroAddress,
              initialSupply: seederUnits,
            },
          }),
        "SUPPLY_0",
        "seeder contract was wrongly constructed with seederUnits set to 0"
      );
    });

    it("seedPrice set to 0", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const reserve = (await Util.basicDeploy(
        "ReserveToken",
        {}
      )) as ReserveToken & Contract;

      const seederUnits = 10;
      const cooldownDuration = 1;
      const seedPrice = 0;

      await Util.assertError(
        async () =>
          await Util.seedERC20Deploy(signers[0], {
            reserve: reserve.address,
            recipient: signers[0].address,
            seedPrice,
            cooldownDuration,
            erc20Config: {
              name: "SeedToken",
              symbol: "SDT",
              distributor: Util.zeroAddress,
              initialSupply: seederUnits,
            },
          }),
        "PRICE_0",
        "seeder contract was wrongly constructed with seedPrice set to 0"
      );
    });
  });

  it("should set phases correctly", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const deployer = signers[1]; // deployer is not creator
    const seeder1 = signers[2];
    const seeder2 = signers[3];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.GOLD;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const seederUnits = 10;
    const seedERC20Config = {
      name: "SeedToken",
      symbol: "SDT",
      distributor: Util.zeroAddress,
      initialSupply: seederUnits,
    };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
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
        seederFee,
        redeemInit,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
        minimumTradingDuration,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: tier.address,
        minimumTier,
      },
      {
        seeder: Util.zeroAddress,
        cooldownDuration: seederCooldownDuration,
        erc20Config: seedERC20Config,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const seeder = (
      await Util.getEventArgs(trust.deployTransaction, "Initialize", trust)
    ).seeder;
    const seederContract = new ethers.Contract(
      seeder,
      seedERC20Json.abi,
      signers[0]
    ) as SeedERC20 & Contract;

    assert(
      (await seederContract.currentPhase()).eq(SeedPhase.SEEDING),
      `should be phase SEEDING (1) after initialization, got ${await seederContract.currentPhase()}`
    );

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
      (await seederContract.currentPhase()).eq(SeedPhase.SEEDING),
      `should still be phase SEEDING (1) before all units seeded, got ${await seederContract.currentPhase()}`
    );

    await seederContract2.seed(0, seeder2Units);

    assert(
      (await seederContract.currentPhase()).eq(SeedPhase.REDEEMING),
      `should be phase REDEEMING (2) after all units seeded, got ${await seederContract.currentPhase()}`
    );
  });

  it("should allow trust to build SeedERC20 on construction and begin raise with sufficient funds", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const deployer = signers[1]; // deployer is not creator
    const seeder1 = signers[2];
    const seeder2 = signers[3];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.GOLD;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const seederUnits = 10;
    const seedERC20Config = {
      name: "SeedToken",
      symbol: "SDT",
      distributor: Util.zeroAddress,
      initialSupply: seederUnits,
    };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
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
        seederFee,
        redeemInit,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
        minimumTradingDuration,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: tier.address,
        minimumTier,
      },
      {
        seeder: Util.zeroAddress,
        cooldownDuration: seederCooldownDuration,
        erc20Config: seedERC20Config,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const seeder = (
      await Util.getEventArgs(trust.deployTransaction, "Initialize", trust)
    ).seeder;
    const seederContract = new ethers.Contract(
      seeder,
      seedERC20Json.abi,
      signers[0]
    ) as SeedERC20 & Contract;

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

    await Util.assertError(
      async () => await trust.startDutchAuction({ gasLimit: 100000000 }),
      "ERC20: transfer amount exceeds balance",
      "raise begun with insufficient seed reserve"
    );

    await seederContract2.seed(0, seeder2Units);

    await trust.startDutchAuction({ gasLimit: 100000000 });
  });

  describe("should allow many seeders to seed trust", async function () {
    it("successful raise", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const creator = signers[0];
      const deployer = signers[1]; // deployer is not creator
      const seeder1 = signers[2];
      const seeder2 = signers[3];
      const signer1 = signers[4];

      const [crpFactory, bFactory] = await Util.balancerDeploy();

      const reserve = (await Util.basicDeploy(
        "ReserveToken",
        {}
      )) as ReserveToken & Contract;

      const tierFactory = await ethers.getContractFactory("ReadWriteTier");
      const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
      const minimumTier = Tier.GOLD;

      const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

      const totalTokenSupply = ethers.BigNumber.from(
        "2000" + Util.eighteenZeros
      );
      const redeemableERC20Config = {
        name: "Token",
        symbol: "TKN",
        distributor: Util.zeroAddress,
        initialSupply: totalTokenSupply,
      };
      const seederUnits = 10;
      const seedERC20Config = {
        name: "SeedToken",
        symbol: "SDT",
        distributor: Util.zeroAddress,
        initialSupply: seederUnits,
      };

      const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
      const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

      const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
      const seederCooldownDuration = 1;
      const seedPrice = reserveInit.div(10);

      const successLevel = redeemInit
        .add(minimumCreatorRaise)
        .add(seederFee)
        .add(reserveInit);
      const finalValuation = successLevel;

      const minimumTradingDuration = 50;

      const trustFactoryDeployer = trustFactory.connect(deployer);

      await tier.setTier(signer1.address, Tier.GOLD, []);

      const trust = await Util.trustDeploy(
        trustFactoryDeployer,
        creator,
        {
          creator: creator.address,
          minimumCreatorRaise,
          seederFee,
          redeemInit,
          reserve: reserve.address,
          reserveInit,
          initialValuation,
          finalValuation,
          minimumTradingDuration,
        },
        {
          erc20Config: redeemableERC20Config,
          tier: tier.address,
          minimumTier,
        },
        {
          seeder: Util.zeroAddress,
          cooldownDuration: seederCooldownDuration,
          erc20Config: seedERC20Config,
        },
        { gasLimit: 100000000 }
      );

      await trust.deployed();

      const seeder = (
        await Util.getEventArgs(trust.deployTransaction, "Initialize", trust)
      ).seeder;
      const seederContract = new ethers.Contract(
        seeder,
        seedERC20Json.abi,
        signers[0]
      ) as SeedERC20 & Contract;

      const token = new ethers.Contract(
        await trust.token(),
        redeemableTokenJson.abi,
        creator
      ) as RedeemableERC20 & Contract;

      const recipient = trust.address;

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
        async () => await trust.startDutchAuction({ gasLimit: 100000000 }),
        "ERC20: transfer amount exceeds balance",
        "raise begun with insufficient seed reserve"
      );

      await seederContract2.seed(0, seeder2Units);

      // seeder cannot unseed after all units seeded
      await Util.assertError(
        async () => await seederContract1.unseed(seeder1Units),
        "BAD_PHASE",
        "seeder1 unseeded despite all units being seeded"
      );

      // Recipient gains infinite approval on reserve token withdrawals from seed contract
      await reserve.allowance(seederContract.address, recipient);

      assert(
        (await reserve.balanceOf(seederContract.address)).isZero(),
        `seeder contract should have transferred all funds to recipient
        expected  0
        actual    ${await reserve.balanceOf(seederContract.address)}
      `
      );

      assert(
        (await reserve.balanceOf(trust.address)).eq(reserveInit),
        `trust should have received all funds from seeder contract
        expected  ${reserveInit}
        actual    ${await reserve.balanceOf(trust.address)}
      `
      );

      await trust.startDutchAuction({ gasLimit: 100000000 });

      const [crp, bPool] = await Util.poolContracts(signers, trust);

      const startBlock = await ethers.provider.getBlockNumber();

      assert(
        (await reserve.balanceOf(seederContract.address)).isZero(),
        `seeder contract wrongly holding reserve after raise started`
      );

      const reserveSpend = finalValuation.div(10);

      // signer1 fully funds raise
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
        async () => await seederContract1.redeem(seeder1Units, 0),
        "RESERVE_BALANCE",
        "seeder1 redeemed when seeder contract had zero reserve balance"
      );

      // seeder1 ends raise
      await trust.connect(seeder1).endDutchAuction();

      const allowance = await reserve.allowance(trust.address, seeder);

      // seeder1 pulls erc20
      await seederContract.connect(seeder1).pullERC20(allowance);

      // on successful raise, seeder gets reserveInit + seederFee
      const expectedSeederPay = reserveInit.add(seederFee);

      // seederContract should now hold reserve equal to final balance
      assert(
        (await reserve.balanceOf(seederContract.address)).eq(expectedSeederPay),
        `seeder contract has wrong reserve amount after failed raise ended
      expected  ${expectedSeederPay}
      actual    ${await reserve.balanceOf(seederContract.address)}`
      );

      // seeders redeem funds
      await seederContract1.redeem(seeder1Units, 0);

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

      // fails if they don't have seed units
      await Util.assertError(
        async () => await seederContract1.redeem(seeder1Units, 0),
        "ERC20: burn amount exceeds balance",
        "seeder1 redeemed when they had no seed units to redeem"
      );

      await seederContract2.redeem(seeder2Units, 0);

      // correct amount of units should have been redeemed
      assert(
        (await seederContract.totalSupply()).isZero(),
        "wrong total seeder units supply"
      );

      // add 1 to offset rounding error
      const expectedReturn2 = expectedSeederPay
        .mul(seeder2Units)
        .div(seederUnits);
      const return2 = await reserve.balanceOf(seeder2.address);

      // correct amount of reserve should have been returned
      assert(
        return2.eq(expectedReturn2),
        `wrong reserve returned to seeder2 after redeeming
      expected  ${expectedReturn2}
      actual    ${return2}
      `
      );
    });

    it("failed raise", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const creator = signers[0];
      const deployer = signers[1]; // deployer is not creator
      const seeder1 = signers[2];
      const seeder2 = signers[3];

      const [crpFactory, bFactory] = await Util.balancerDeploy();

      const reserve = (await Util.basicDeploy(
        "ReserveToken",
        {}
      )) as ReserveToken & Contract;

      const tierFactory = await ethers.getContractFactory("ReadWriteTier");
      const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
      const minimumTier = Tier.GOLD;

      const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

      const totalTokenSupply = ethers.BigNumber.from(
        "2000" + Util.eighteenZeros
      );
      const redeemableERC20Config = {
        name: "Token",
        symbol: "TKN",
        distributor: Util.zeroAddress,
        initialSupply: totalTokenSupply,
      };
      const seederUnits = 10;
      const seedERC20Config = {
        name: "SeedToken",
        symbol: "SDT",
        distributor: Util.zeroAddress,
        initialSupply: seederUnits,
      };

      const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
      const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

      const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
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
          seederFee,
          redeemInit,
          reserve: reserve.address,
          reserveInit,
          initialValuation,
          finalValuation: successLevel,
          minimumTradingDuration,
        },
        {
          erc20Config: redeemableERC20Config,
          tier: tier.address,
          minimumTier,
        },
        {
          seeder: Util.zeroAddress,
          cooldownDuration: seederCooldownDuration,
          erc20Config: seedERC20Config,
        },
        { gasLimit: 100000000 }
      );

      await trust.deployed();

      const seeder = (
        await Util.getEventArgs(trust.deployTransaction, "Initialize", trust)
      ).seeder;
      const seederContract = new ethers.Contract(
        seeder,
        seedERC20Json.abi,
        signers[0]
      ) as SeedERC20 & Contract;

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
        async () => await trust.startDutchAuction({ gasLimit: 100000000 }),
        "ERC20: transfer amount exceeds balance",
        "raise begun with insufficient seed reserve"
      );

      // redeem fails before seeding is complete
      await Util.assertError(
        async () => await seederContract1.redeem(seeder1Units, 0),
        "BAD_PHASE",
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
        (await reserve.balanceOf(trust.address)).eq(reserveInit),
        `trust should have received all funds from seeder contract
        expected  ${reserveInit}
        actual    ${await reserve.balanceOf(trust.address)}
      `
      );

      await trust.startDutchAuction({ gasLimit: 100000000 });

      const [, bPool] = await Util.poolContracts(signers, trust);

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
        Util.determineReserveDust(bPoolFinalBalance).add(1);

      const trustFinalBalance = bPoolFinalBalance.sub(bPoolReserveDust);

      const expectedSeederPay = (
        reserveInit.lte(trustFinalBalance) ? reserveInit : trustFinalBalance
      )
        // intentional dust.
        .sub(1);

      // seeder redeeming fails if no reserve balance (raise hasn't ended)
      await Util.assertError(
        async () => await seederContract1.redeem(seeder1Units, 0),
        "RESERVE_BALANCE",
        "seeder1 redeemed when seeder contract had zero reserve balance"
      );

      // seeder1 ends raise
      await trust.connect(seeder1).endDutchAuction();

      const allowance = await reserve.allowance(trust.address, seeder);

      // seeder1 pulls erc20
      await seederContract.connect(seeder1).pullERC20(allowance);

      // seederContract should now hold reserve equal to final balance
      assert(
        (await reserve.balanceOf(seederContract.address)).eq(expectedSeederPay),
        `seeder contract has wrong reserve amount after failed raise ended
      expected  ${expectedSeederPay}
      actual    ${await reserve.balanceOf(seederContract.address)}`
      );

      const safeExit_ = seedPrice.mul(seederUnits);
      const safetyRelease_ = safeExit_.sub(expectedSeederPay); // seeder 'yields', accepting that trapped reserve dust in balancer pool after failed raise will affect the amount of reserve they receive on redemption

      // seeders redeem funds
      await seederContract1.redeem(seeder1Units, safetyRelease_);

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

      // fails if they don't have seed units
      await Util.assertError(
        async () => await seederContract1.redeem(seeder1Units, safetyRelease_),
        "ERC20: burn amount exceeds balance",
        "seeder1 redeemed when they had no seed units to redeem"
      );

      await seederContract2.redeem(seeder2Units, safetyRelease_);

      // correct amount of units should have been redeemed
      assert(
        (await seederContract.totalSupply()).isZero(),
        "wrong total seeder units supply"
      );

      const expectedReturn2 = trustFinalBalance
        .mul(seeder2Units)
        .div(seederUnits);

      // correct amount of reserve should have been returned
      assert(
        (await reserve.balanceOf(seeder2.address)).eq(expectedReturn2),
        `wrong reserve returned to seeder2 after redeeming
      expected  ${expectedReturn2}
      actual    ${await reserve.balanceOf(seeder2.address)}
      `
      );
    });
  });
});
