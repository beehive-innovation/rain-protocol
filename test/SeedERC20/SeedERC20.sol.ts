import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import type { ReserveToken } from "../../typechain/ReserveToken";
import type { SeedERC20ForceSendEther } from "../../typechain/SeedERC20ForceSendEther";
import type { Contract } from "ethers";
import {
  PhaseScheduledEvent,
  RedeemEvent,
  SeedEvent,
  UnseedEvent,
} from "../../typechain/SeedERC20";

const { assert } = chai;

enum SeedPhase {
  UNINITIALIZED,
  SEEDING,
  REDEEMING,
}

describe("SeedERC20", async function () {
  it("should behave correctly if people grief contract with reserve transfers", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const alice = signers[0];
    const bob = signers[1];
    const carol = signers[2];
    const griefer = signers[4];

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    // let griefer hold 1m reserve, for whatever reasons
    await reserve.transfer(griefer.address, "1000000");

    const aliceReserve = reserve.connect(alice);
    const bobReserve = reserve.connect(bob);
    const carolReserve = reserve.connect(carol);

    const seedPrice = 100;
    const seedUnits = 10;
    const cooldownDuration = 1;

    const bobUnits = ethers.BigNumber.from(6);
    const carolUnits = ethers.BigNumber.from(4);

    const erc20PulleeFactory = await ethers.getContractFactory(
      "ERC20PulleeTest"
    );
    const erc20Pullee = await erc20PulleeFactory.deploy();
    await erc20Pullee.deployed();

    const [seedERC20, txSeedERC20] = await Util.seedERC20Deploy(alice, {
      reserve: reserve.address,
      recipient: erc20Pullee.address,
      seedPrice,
      cooldownDuration,
      erc20Config: {
        name: "SeedToken",
        symbol: "SDT",
        distributor: Util.zeroAddress,
        initialSupply: bobUnits.add(carolUnits),
      },
    });

    const bobSeed = seedERC20.connect(bob);
    const carolSeed = seedERC20.connect(carol);

    const {
      reserve: reserveEvent,
      seedPrice: seedPriceEvent,
      recipient,
    } = await Util.getEventArgs(txSeedERC20, "Initialize", seedERC20);

    assert(reserveEvent == reserve.address, `reserve not set`);
    assert(seedPriceEvent.eq(seedPrice), `seed price not set`);
    assert(
      (await seedERC20.totalSupply()).eq(seedUnits),
      `seed total supply is wrong`
    );
    assert(recipient == erc20Pullee.address, `failed to set recipient`);

    await aliceReserve.transfer(bob.address, bobUnits.mul(seedPrice));
    await aliceReserve.transfer(carol.address, carolUnits.mul(seedPrice));

    assert(
      (await reserve.balanceOf(bob.address)).eq(bobUnits.mul(seedPrice)),
      `failed to send reserve to bob`
    );
    assert(
      (await seedERC20.balanceOf(bob.address)).eq(0),
      `bob did not start with zero seed erc20`
    );

    // attempt to grief contract by sending a small amount of reserve
    await reserve
      .connect(griefer)
      .transfer(seedERC20.address, ethers.BigNumber.from("10"));

    // Bob and carol co-fund the seed round.

    await bobReserve.approve(seedERC20.address, bobUnits.mul(seedPrice));
    await bobSeed.seed(0, bobUnits);
    await bobSeed.unseed(2);

    await bobReserve.approve(seedERC20.address, 2 * seedPrice);
    await bobSeed.seed(0, 2);

    await carolReserve.approve(seedERC20.address, carolUnits.mul(seedPrice));
    await carolSeed.seed(0, carolUnits);

    // seed contract automatically transfers to recipient on successful seed
    assert(
      (await reserve.balanceOf(seedERC20.address)).isZero(),
      `seed contract did not transfer reserve to recipient`
    );
    assert(
      (await reserve.balanceOf(erc20Pullee.address)).gte(seedPrice * seedUnits),
      `recipient did not receive transferred funds
      expected  ${seedPrice * seedUnits}
      got       ${await reserve.balanceOf(erc20Pullee.address)}`
    );

    // Dave gets 10% extra reserve from somewhere.

    await aliceReserve.transfer(
      erc20Pullee.address,
      seedPrice * seedUnits * 0.1
    );

    // Dave sends reserve back to the seed contract.

    const erc20PulleeBalance = await reserve.balanceOf(erc20Pullee.address);
    await erc20Pullee.approve(
      reserve.address,
      seedERC20.address,
      erc20PulleeBalance
    );
    await seedERC20.pullERC20(erc20PulleeBalance);

    // Bob and carol can redeem their seed tokens.
    await bobSeed.redeem(bobUnits, 0);
    await carolSeed.redeem(carolUnits, 0);

    const bobFinalBalance = await bobReserve.balanceOf(bob.address);
    const carolFinalBalance = await carolReserve.balanceOf(carol.address);

    // bob and carol should have 10% more reserve than they put in after redemption.
    assert(
      bobFinalBalance.gte(660),
      `Wrong final balance for bob ${bobFinalBalance}`
    );
    assert(
      carolFinalBalance.gte(440),
      `Wrong final balance for carol ${carolFinalBalance}`
    );
  });

  it("should emit Redeem, Seed, Unseed events", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const alice = signers[0];
    const bob = signers[1];
    const carol = signers[2];

    const erc20PulleeFactory = await ethers.getContractFactory(
      "ERC20PulleeTest"
    );
    const erc20Pullee = await erc20PulleeFactory.deploy();
    await erc20Pullee.deployed();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const aliceReserve = reserve.connect(alice);
    const bobReserve = reserve.connect(bob);
    const carolReserve = reserve.connect(carol);

    const seedPrice = ethers.BigNumber.from(100);
    const seedUnits = ethers.BigNumber.from(10);
    const cooldownDuration = 1;

    const bobUnits = ethers.BigNumber.from(6);
    const carolUnits = ethers.BigNumber.from(4);

    const [seedERC20] = await Util.seedERC20Deploy(alice, {
      reserve: reserve.address,
      recipient: erc20Pullee.address,
      seedPrice,
      cooldownDuration,
      erc20Config: {
        name: "SeedToken",
        symbol: "SDT",
        distributor: Util.zeroAddress,
        initialSupply: bobUnits.add(carolUnits),
      },
    });

    const bobSeed = seedERC20.connect(bob);
    const carolSeed = seedERC20.connect(carol);

    await aliceReserve.transfer(bob.address, bobUnits.mul(seedPrice));
    await aliceReserve.transfer(carol.address, carolUnits.mul(seedPrice));

    // Bob and carol co-fund the seed round.

    await bobReserve.approve(seedERC20.address, bobUnits.mul(seedPrice));
    const bobSeedPromise = bobSeed.seed(0, bobUnits);

    const event0 = (await Util.getEventArgs(
      await bobSeedPromise,
      "Seed",
      seedERC20
    )) as SeedEvent["args"];

    assert(event0.sender === bob.address, "wrong sender in event0");
    assert(event0.tokensSeeded.eq(bobUnits), "wrong tokensSeeded in event0");
    assert(
      event0.reserveReceived.eq(bobUnits.mul(seedPrice)),
      "wrong reserveReceived in event0"
    );

    const bobUnseedPromise = bobSeed.unseed(2);

    const event1 = (await Util.getEventArgs(
      await bobUnseedPromise,
      "Unseed",
      seedERC20
    )) as UnseedEvent["args"];

    assert(event1.sender === bob.address, "wrong sender in event1");
    assert(event1.tokensUnseeded.eq(2), "wrong tokensUnseeded in event1");
    assert(
      event1.reserveReturned.eq(ethers.BigNumber.from(2).mul(seedPrice)),
      "wrong reserveReturned in event1"
    );

    await bobReserve.approve(seedERC20.address, seedPrice.mul(2));
    await bobSeed.seed(0, 2);

    await carolReserve.approve(seedERC20.address, carolUnits.mul(seedPrice));
    await carolSeed.seed(0, carolUnits);

    // Dave gets 10% extra reserve from somewhere.

    await aliceReserve.transfer(
      erc20Pullee.address,
      seedPrice.mul(seedUnits).div(10)
    );

    // Dave sends reserve back to the seed contract.

    const erc20PulleeBalance = await reserve.balanceOf(erc20Pullee.address);
    await erc20Pullee.approve(
      reserve.address,
      seedERC20.address,
      erc20PulleeBalance
    );
    await seedERC20.pullERC20(erc20PulleeBalance);

    // Bob and carol can redeem their seed tokens.

    const reserve0 = await reserve.balanceOf(seedERC20.address);
    const totalSupply0 = await seedERC20.totalSupply();

    const event2 = (await Util.getEventArgs(
      await bobSeed.redeem(bobUnits, 0),
      "Redeem",
      seedERC20
    )) as RedeemEvent["args"];

    assert(event2.sender === bob.address, "wrong sender in event2");
    assert(
      event2.treasuryAsset === reserve.address,
      "wrong treasuryAsset in event2"
    );
    assert(event2.redeemAmount.eq(bobUnits), "wrong redeemAmount in event2");
    assert(
      event2.assetAmount.eq(bobUnits.mul(reserve0).div(totalSupply0)),
      "wrong assetAmount in event2"
    );

    const reserve1 = await reserve.balanceOf(seedERC20.address);
    const totalSupply1 = await seedERC20.totalSupply();

    const event3 = (await Util.getEventArgs(
      await carolSeed.redeem(carolUnits, 0),
      "Redeem",
      seedERC20
    )) as RedeemEvent["args"];

    assert(event3.sender === carol.address, "wrong sender in event3");
    assert(
      event3.treasuryAsset === reserve.address,
      "wrong treasuryAsset in event3"
    );
    assert(event3.redeemAmount.eq(carolUnits), "wrong redeemAmount in event3");
    assert(
      event3.assetAmount.eq(carolUnits.mul(reserve1).div(totalSupply1)),
      "wrong assetAmount in event3"
    );
  });

  it("shouldn't be affected by attacker forcibly sending ether to contract", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const alice = signers[0];
    const bob = signers[1];
    const carol = signers[2];

    const erc20PulleeFactory = await ethers.getContractFactory(
      "ERC20PulleeTest"
    );
    const erc20Pullee = await erc20PulleeFactory.deploy();
    await erc20Pullee.deployed();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const aliceReserve = reserve.connect(alice);
    const bobReserve = reserve.connect(bob);
    const carolReserve = reserve.connect(carol);

    const seedPrice = 100;
    const cooldownDuration = 1;

    const bobUnits = ethers.BigNumber.from(6);
    const carolUnits = ethers.BigNumber.from(4);

    const [seedERC20] = await Util.seedERC20Deploy(alice, {
      reserve: reserve.address,
      recipient: erc20Pullee.address,
      seedPrice,
      cooldownDuration,
      erc20Config: {
        name: "SeedToken",
        symbol: "SDT",
        distributor: Util.zeroAddress,
        initialSupply: bobUnits.add(carolUnits),
      },
    });

    const bobSeed = seedERC20.connect(bob);
    const carolSeed = seedERC20.connect(carol);

    await aliceReserve.transfer(bob.address, bobUnits.mul(seedPrice));
    await aliceReserve.transfer(carol.address, carolUnits.mul(seedPrice));

    // Bob and carol co-fund the seed round.

    await bobReserve.approve(seedERC20.address, bobUnits.mul(seedPrice));
    await bobSeed.seed(0, bobUnits);

    // Setup attacker contract
    // This contract sends ether to SeedERC20, affecting value returned from balanceOf(address(this))
    const forceSendEtherFactory = await ethers.getContractFactory(
      "SeedERC20ForceSendEther"
    );
    const forceSendEther =
      (await forceSendEtherFactory.deploy()) as SeedERC20ForceSendEther &
        Contract;

    // send ether to attacker contract
    await signers[0].sendTransaction({
      to: forceSendEther.address,
      value: ethers.utils.parseEther("1.0"),
    });
    // destroy attacker contract
    await forceSendEther.destroy(seedERC20.address);

    await carolReserve.approve(
      seedERC20.address,
      carolUnits.add(1).mul(seedPrice)
    );
    await Util.assertError(
      async () => await carolSeed.seed(carolUnits.add(1), carolUnits.add(1)),
      "INSUFFICIENT_STOCK",
      "seedUnits stock calculation was affected by forcibly sending eth to contract"
    );
  });

  it("should have 0 decimals", async () => {
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

    const seedPrice = 100;
    const seedUnits = 10;
    const cooldownDuration = 1;

    const [seedERC20] = await Util.seedERC20Deploy(signers[9], {
      reserve: reserve.address,
      recipient: erc20Pullee.address,
      seedPrice,
      cooldownDuration,
      erc20Config: {
        name: "SeedToken",
        symbol: "SDT",
        distributor: Util.zeroAddress,
        initialSupply: seedUnits,
      },
    });

    // SeedERC20 has 0 decimals
    const decimals = await seedERC20.decimals();
    assert(decimals === 0, `expected 0 decimals, got ${decimals}`);
  });

  it("should allow specifing a min/max units to seed", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const bob = signers[1];
    const carol = signers[2];
    const dave = signers[3];

    const erc20PulleeFactory = await ethers.getContractFactory(
      "ERC20PulleeTest"
    );
    const erc20Pullee = await erc20PulleeFactory.deploy();
    await erc20Pullee.deployed();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const bobReserve = reserve.connect(bob);
    const carolReserve = reserve.connect(carol);
    const daveReserve = reserve.connect(dave);

    const seedPrice = 100;
    const seederUnits = 10;
    const cooldownDuration = 1;

    const [seedERC20] = await Util.seedERC20Deploy(signers[9], {
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

    const bobSeed = seedERC20.connect(bob);
    const carolSeed = seedERC20.connect(carol);
    const daveSeed = seedERC20.connect(dave);

    const bobUnits = {
      min: 5,
      desired: 6,
    };
    const carolUnits = {
      min: 5,
      desired: 6,
    };
    const daveUnits = {
      min: 0,
      desired: 10,
    };

    // bob seeds with min/max unit values (5, 6)
    await reserve.transfer(bob.address, bobUnits.desired * seedPrice);
    await bobReserve.approve(seedERC20.address, bobUnits.desired * seedPrice);
    await Util.assertError(
      async () => await bobSeed.seed(1, 0), // max === 0
      "DESIRED_0",
      "bob successfully called seed with 0 max desired units"
    );
    await Util.assertError(
      async () => await bobSeed.seed(2, 1), // min > max
      "MINIMUM_OVER_DESIRED",
      "bob successfully called seed with min greater than max"
    );
    await bobSeed.seed(bobUnits.min, bobUnits.desired); // normal

    // 6/10 units have been sold

    assert(
      (await seedERC20.balanceOf(bob.address)).eq(bobUnits.desired),
      "bob did not receive desired units"
    );

    // carol seeds with min/max unit values (5, 6)
    await reserve.transfer(carol.address, carolUnits.desired * seedPrice);
    await carolReserve.approve(
      seedERC20.address,
      carolUnits.desired * seedPrice
    );
    await Util.assertError(
      async () => await carolSeed.seed(carolUnits.min, carolUnits.desired),
      "INSUFFICIENT_STOCK",
      "carol's minimum did not cause seed to fail"
    );

    assert(
      (await seedERC20.balanceOf(carol.address)).eq(0),
      "carol wrongly has units despite out of stock error"
    );

    // still 6/10 units sold

    // dave buys up remaining units (0, 10)
    await reserve.transfer(dave.address, daveUnits.desired * seedPrice);
    await daveReserve.approve(seedERC20.address, daveUnits.desired * seedPrice);
    await daveSeed.seed(daveUnits.min, daveUnits.desired);

    const daveExpected = 4;
    const daveActual = await seedERC20.balanceOf(dave.address);
    assert(
      daveActual.eq(daveExpected),
      `dave did not buy up remaining units, expected ${daveExpected} got ${daveActual}`
    );
  });

  it("should emit PhaseScheduled event when fully seeded", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const alice = signers[0];
    const bob = signers[1];
    const carol = signers[2];
    const dave = signers[3];

    const erc20PulleeFactory = await ethers.getContractFactory(
      "ERC20PulleeTest"
    );
    const erc20Pullee = await erc20PulleeFactory.deploy();
    await erc20Pullee.deployed();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const aliceReserve = reserve.connect(alice);
    const bobReserve = reserve.connect(bob);
    const carolReserve = reserve.connect(carol);

    const seedPrice = 100;
    const seedUnits = 10;
    const cooldownDuration = 1;

    const bobUnits = ethers.BigNumber.from(6);
    const carolUnits = ethers.BigNumber.from(4);

    const [seedERC20] = await Util.seedERC20Deploy(dave, {
      reserve: reserve.address,
      recipient: erc20Pullee.address,
      seedPrice,
      cooldownDuration,
      erc20Config: {
        name: "SeedToken",
        symbol: "SDT",
        distributor: Util.zeroAddress,
        initialSupply: bobUnits.add(carolUnits),
      },
    });

    const bobSeed = seedERC20.connect(bob);
    const carolSeed = seedERC20.connect(carol);

    await aliceReserve.transfer(bob.address, bobUnits.mul(seedPrice));
    await aliceReserve.transfer(carol.address, carolUnits.mul(seedPrice));

    // Bob and carol co-fund the seed round.

    await bobReserve.approve(seedERC20.address, bobUnits.mul(seedPrice));
    await bobSeed.seed(0, bobUnits);
    await bobSeed.unseed(2);

    await bobReserve.approve(seedERC20.address, 2 * seedPrice);
    await bobSeed.seed(0, 2);

    await carolReserve.approve(seedERC20.address, carolUnits.mul(seedPrice));

    const event0 = (await Util.getEventArgs(
      await carolSeed.seed(0, carolUnits),
      "PhaseScheduled",
      seedERC20
    )) as PhaseScheduledEvent["args"];

    assert(event0.sender === carol.address, "wrong sender in event0");
    assert(event0.newPhase.eq(SeedPhase.REDEEMING), "wrong newPhase in event0");
    assert(
      event0.scheduledBlock.eq(await ethers.provider.getBlockNumber()),
      "wrong scheduledBlock in event0"
    );

    // seed contract automatically transfers to recipient on successful seed
    assert(
      (await reserve.balanceOf(seedERC20.address)).isZero(),
      `seed contract did not transfer reserve to recipient`
    );
    assert(
      (await reserve.balanceOf(erc20Pullee.address)).eq(seedPrice * seedUnits),
      `recipient did not receive transferred funds`
    );
  });

  it("should work on the happy path", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const alice = signers[0];
    const bob = signers[1];
    const carol = signers[2];
    const dave = signers[3];

    const erc20PulleeFactory = await ethers.getContractFactory(
      "ERC20PulleeTest"
    );
    const erc20Pullee = await erc20PulleeFactory.deploy();
    await erc20Pullee.deployed();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const aliceReserve = reserve.connect(alice);
    const bobReserve = reserve.connect(bob);
    const carolReserve = reserve.connect(carol);

    const seedPrice = 100;
    const seedUnits = 10;
    const cooldownDuration = 1;

    const bobUnits = ethers.BigNumber.from(6);
    const carolUnits = ethers.BigNumber.from(4);

    const [seedERC20, txSeedERC20] = await Util.seedERC20Deploy(dave, {
      reserve: reserve.address,
      recipient: erc20Pullee.address,
      seedPrice,
      cooldownDuration,
      erc20Config: {
        name: "SeedToken",
        symbol: "SDT",
        distributor: Util.zeroAddress,
        initialSupply: bobUnits.add(carolUnits),
      },
    });

    const bobSeed = seedERC20.connect(bob);
    const carolSeed = seedERC20.connect(carol);

    const {
      reserve: reserveEvent,
      seedPrice: seedPriceEvent,
      recipient,
    } = await Util.getEventArgs(txSeedERC20, "Initialize", seedERC20);

    assert(reserveEvent == reserve.address, `reserve not set`);

    assert(seedPriceEvent.eq(seedPrice), `seed price not set`);

    assert(
      (await seedERC20.totalSupply()).eq(seedUnits),
      `seed total supply is wrong`
    );

    assert(recipient == erc20Pullee.address, `failed to set recipient`);

    await aliceReserve.transfer(bob.address, bobUnits.mul(seedPrice));
    await aliceReserve.transfer(carol.address, carolUnits.mul(seedPrice));

    assert(
      (await reserve.balanceOf(bob.address)).eq(bobUnits.mul(seedPrice)),
      `failed to send reserve to bob`
    );
    assert(
      (await seedERC20.balanceOf(bob.address)).eq(0),
      `bob did not start with zero seed erc20`
    );

    // Bob and carol co-fund the seed round.

    await bobReserve.approve(seedERC20.address, bobUnits.mul(seedPrice));
    await bobSeed.seed(0, bobUnits);
    await bobSeed.unseed(2);

    await bobReserve.approve(seedERC20.address, 2 * seedPrice);
    await bobSeed.seed(0, 2);

    await carolReserve.approve(seedERC20.address, carolUnits.mul(seedPrice));
    await carolSeed.seed(0, carolUnits);

    // seed contract automatically transfers to recipient on successful seed
    assert(
      (await reserve.balanceOf(seedERC20.address)).isZero(),
      `seed contract did not transfer reserve to recipient`
    );
    assert(
      (await reserve.balanceOf(erc20Pullee.address)).eq(seedPrice * seedUnits),
      `recipient did not receive transferred funds`
    );

    // Dave gets 10% extra reserve from somewhere.

    await aliceReserve.transfer(
      erc20Pullee.address,
      seedPrice * seedUnits * 0.1
    );

    // Dave sends reserve back to the seed contract.

    const erc20PulleeBalance = await reserve.balanceOf(erc20Pullee.address);
    erc20Pullee.approve(reserve.address, seedERC20.address, erc20PulleeBalance);
    await seedERC20.pullERC20(erc20PulleeBalance);

    // Bob and carol can redeem their seed tokens.
    await bobSeed.redeem(bobUnits, 0);
    await carolSeed.redeem(carolUnits, 0);

    const bobFinalBalance = await bobReserve.balanceOf(bob.address);
    const carolFinalBalance = await carolReserve.balanceOf(carol.address);

    // bob and carol should have 10% more reserve than they put in after redemption.
    assert(
      bobFinalBalance.eq(660),
      `Wrong final balance for bob ${bobFinalBalance}`
    );
    assert(
      carolFinalBalance.eq(440),
      `Wrong final balance for carol ${carolFinalBalance}`
    );
  });
});
