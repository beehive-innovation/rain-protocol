import { assert } from "chai";
import { ethers } from "hardhat";
import { MockISaleV2, ReserveToken } from "../../../typechain";
import { escrowDeploy } from "../../../utils/deploy/escrow/redeemableERC20ClaimEscrow/deploy";
import { assertError } from "../../../utils/test/assertError";
import { SaleStatus } from "../../../utils/types/saleEscrow";

describe("SaleEscrow protection from draining", async function () {
  it("if a sale creates a redeemable token that doesn't freeze, it should not be possible to drain the RedeemableERC20ClaimEscrow by repeatedly claiming after moving the same funds somewhere else (in the case of failed Sale)", async function () {
    const signers = await ethers.getSigners();

    const signer1 = signers[1];
    const signer2 = signers[2];

    // Deploy global Claim contract
    const { claim: rTKNClaimEscrow } = await escrowDeploy();

    const tokenFactory = await ethers.getContractFactory("ReserveToken");
    const reserve = (await tokenFactory.deploy()) as ReserveToken;
    const rTKN = (await tokenFactory.deploy()) as ReserveToken;

    await reserve.deployed();
    await rTKN.deployed();

    await reserve.initialize();
    await rTKN.initialize();
    const saleFactory = await ethers.getContractFactory("MockISaleV2");
    const sale1 = (await saleFactory.deploy()) as MockISaleV2;
    const sale2 = (await saleFactory.deploy()) as MockISaleV2;

    // Two identical successful sales with some tokens to distribute.
    const sales: Array<MockISaleV2> = [sale1, sale2];
    for (const sale of sales) {
      await sale.deployed();
      await sale.setReserve(reserve.address);
      await sale.setToken(rTKN.address);
      await sale.setSaleStatus(SaleStatus.Success);
      await reserve.approve(rTKNClaimEscrow.address, 1000);
      await rTKNClaimEscrow.deposit(sale.address, reserve.address, 1000);
    }

    assert(
      (await rTKN.balanceOf(signer1.address)).eq(0),
      "signer 1 had token balance prematurely"
    );
    // If signer1 has all the token they should get all deposited reserve.
    await rTKN.transfer(signer1.address, await rTKN.totalSupply());

    await rTKNClaimEscrow
      .connect(signer1)
      .withdraw(sale1.address, reserve.address, await rTKN.totalSupply());

    assert(
      (await reserve.balanceOf(signer1.address)).eq(1000),
      `signer 1 did not withdraw the deposited reserve`
    );

    // At this point signer 1 has withdrawn all they can for sale1.
    await assertError(
      async () =>
        await rTKNClaimEscrow
          .connect(signer1)
          .withdraw(sale1.address, reserve.address, await rTKN.totalSupply()),
      "ZERO_WITHDRAW",
      "didn't prevent signer 1 from withdrawing a second time"
    );

    // At this point there is still 1000 reserve in the escrow (for sale2).
    // We want to prevent signer 1 from colluding with signer 2 to withdraw
    // more funds from sale1 than were ever deposited for it. If this were
    // possible then malicious ISale contracts can steal from honest contracts.
    await rTKN
      .connect(signer1)
      .transfer(signer2.address, await rTKN.totalSupply());
    // This has to underflow here as signer2 is now trying to withdraw 1000
    // reserve tokens, which means 2000 reserve tokens total withdrawn from
    // sale1 vs. 1000 tokens deposited for sale1.
    await assertError(
      async () =>
        await rTKNClaimEscrow
          .connect(signer2)
          .withdraw(sale1.address, reserve.address, await rTKN.totalSupply()),
      "Error",
      "didn't prevent signer 2 from withdrawing from sale1 what was already withdrawn"
    );

    // However, it's entirely possible for signer2 to withdraw 1000 tokens
    // from sale2 as sale1 and sale2 share the same non-reserve token.
    await rTKNClaimEscrow
      .connect(signer2)
      .withdraw(sale2.address, reserve.address, await rTKN.totalSupply());

    assert(
      (await reserve.balanceOf(signer1.address)).eq(1000),
      `signer 1 has incorrect reserve.`
    );
    assert(
      (await reserve.balanceOf(signer2.address)).eq(1000),
      `signer 2 has incorrect reserve.`
    );
    assert(
      (await reserve.balanceOf(rTKNClaimEscrow.address)).eq(0),
      `escrow has incorrect reserve.`
    );
  });
});
