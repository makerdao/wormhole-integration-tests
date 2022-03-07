// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2021 Dai Foundation
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

pragma solidity 0.8.9;

import {DssExec} from "../common/DssExec.sol";
import {DssAction} from "../common/DssAction.sol";

interface VatLike {
  function rely(address usr) external;

  function init(bytes32 ilk) external;

  function file(
    bytes32 ilk,
    bytes32 what,
    uint256 data
  ) external;
}

interface WormholeJoinLike {
  function file(bytes32 what, address val) external;

  function file(
    bytes32 what,
    bytes32 domain_,
    address data
  ) external;

  function file(
    bytes32 what,
    bytes32 domain_,
    uint256 data
  ) external;

  function ilk() external returns (bytes32);
}

interface OracleAuthLike {
  function file(bytes32 what, uint256 data) external;

  function addSigners(address[] calldata signers_) external;
}

interface RouterLike {
  function file(
    bytes32 what,
    bytes32 domain,
    address data
  ) external;
}

interface L1EscrowLike {
  function approve(
    address token,
    address spender,
    uint256 value
  ) external;
}

interface GovernanceRelayLike {
  function relay(
    address target,
    bytes calldata targetData,
    uint256 l1CallValue,
    uint256 maxGas,
    uint256 gasPriceBid,
    uint256 maxSubmissionCost
  ) external;
}

contract DssSpellAction is DssAction {
  uint256 public constant RAY = 10**27;
  uint256 public constant RAD = 10**45;

  uint256 public constant l1CallValue = 1922700645232;
  uint256 public constant maxGas = 139212;
  uint256 public constant gasPriceBid = 13751501;
  uint256 public constant maxSubmissionCost = 8326688020;

  string public constant override description = "Rinkeby Arbitrum Wormhole deployment spell";

  function officeHours() public pure override returns (bool) {
    return false;
  }

  function actions() public override {
    bytes32 masterDomain = "RINKEBY-MASTER-1";
    WormholeJoinLike wormholeJoin = WormholeJoinLike(0x2Cd1b8fe049a5a52Bd48e9c7aA651b2C013545A6);
    address vow = 0xD9dFdf1f1604eF572EFd9c8c2e5c6DDca659150A;
    VatLike vat = VatLike(0x66b3D63621FDD5967603A824114Da95cc3A35107);
    uint256 globalLine = 10000000000 * RAD;
    RouterLike router = RouterLike(0x50769F4c866476fFccCdcb80F84b40C6cd1F8F12);
    OracleAuthLike oracleAuth = OracleAuthLike(0x7FD07147305f7eCcA62d0a7737bbE0Bd8AC5359b);
    address[] memory oracles = new address[](5);
    oracles[0] = 0xC4756A9DaE297A046556261Fa3CD922DFC32Db78; // OCU
    oracles[1] = 0x23ce419DcE1De6b3647Ca2484A25F595132DfBd2; // OCU
    oracles[2] = 0x774D5AA0EeE4897a9a6e65Cbed845C13Ffbc6d16; // OCU
    oracles[3] = 0xb41E8d40b7aC4Eb34064E079C8Eca9d7570EBa1d; // OCU
    oracles[4] = 0xc65EF2D17B05ADbd8e4968bCB01b325ab799aBd8; // PECU

    wormholeJoin.file(bytes32("vow"), vow);
    router.file(bytes32("gateway"), masterDomain, address(wormholeJoin));
    vat.rely(address(wormholeJoin));
    bytes32 ilk = wormholeJoin.ilk();
    vat.init(ilk);
    vat.file(ilk, bytes32("spot"), RAY);
    vat.file(ilk, bytes32("line"), globalLine);
    oracleAuth.file(bytes32("threshold"), 1);
    oracleAuth.addSigners(oracles);

    // configure optimism wormhole
    bytes32 slaveDomain = "RINKEBY-SLAVE-ARBITRUM-1";
    uint256 optimismSlaveLine = 100 * RAD;
    address constantFees = 0x5F1B3d4DFCfCd7f6bbf3aC8ce2b4187579b1Ea04;
    address slaveDomainBridge = 0xD25CD820e6C16AAEfe23845D6D02dF889C471f99;
    L1EscrowLike escrow = L1EscrowLike(0x3128d6ffeB4CdD14dC47E4e6A70022F4bf8E7751);
    address dai = 0x17B729a6Ac1f265090cbb4AecBdd53E34664C00e;
    GovernanceRelayLike l1GovRelay = GovernanceRelayLike(
      0x97057eF24d3C69D974Cc5348145b7258c5a503B6
    );
    address l2ConfigureDomainSpell = 0xF4635D1590e0eA3F1D22F1F75E1C85B634b6F162;

    router.file(bytes32("gateway"), slaveDomain, slaveDomainBridge);
    wormholeJoin.file(bytes32("fees"), slaveDomain, constantFees);
    wormholeJoin.file(bytes32("line"), slaveDomain, optimismSlaveLine);
    escrow.approve(dai, slaveDomainBridge, type(uint256).max);

    l1GovRelay.relay(
      l2ConfigureDomainSpell,
      abi.encodeWithSignature("execute()"),
      l1CallValue,
      maxGas,
      gasPriceBid,
      maxSubmissionCost
    );
  }
}

contract L1RinkebyAddWormholeDomainSpell is DssExec {
  // hack allowing execution of spell without full MCD deployment
  function execute() external {
    (bool success, ) = address(action).delegatecall(abi.encodeWithSignature("actions()"));
    require(success, "L1RinkebyAddWormholeDomainSpell/delegatecall-failed");
  }

  constructor() DssExec(block.timestamp + 30 days, address(new DssSpellAction())) {}
}
