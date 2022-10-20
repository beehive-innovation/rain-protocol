import { assert } from "chai";
import { ethers } from "hardhat";
import { TierV2Test } from "../../../typechain";
import { zeroPad4 } from "../../../utils/bytes";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";

describe("TierV2 supports erc165 interface", async function () {
  const erc165InterfaceID = ethers.BigNumber.from(0x01ffc9a7);
  const invalidInterfaceID = ethers.BigNumber.from(0x00000001);

  it("should verify that a contract implements ITierV2 interface", async () => {
    const tierV2Test = (await basicDeploy("TierV2Test", {})) as TierV2Test;

    const supportsERC165Interface = await tierV2Test.supportsInterface(
      zeroPad4(erc165InterfaceID)
    );
    const supportsInvalidInterface = await tierV2Test.supportsInterface(
      zeroPad4(invalidInterfaceID)
    );

    assert(supportsERC165Interface, "should support erc165 interface");
    assert(
      !supportsInvalidInterface,
      "should not support interface with id other than 0x01ffc9a7"
    );
  });
});
