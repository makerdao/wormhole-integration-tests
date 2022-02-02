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
    uint256 data
  ) external;

  function file(
    bytes32 what,
    bytes32 domain_,
    address data
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

interface L1Escrow {
  function approve(
    address token,
    address spender,
    uint256 value
  ) external;
}

contract L1AddWormholeDomainSpell {
  uint256 public constant RAY = 10**27;

  bytes32 public immutable slaveDomainA;

  WormholeJoinLike public immutable wormholeJoin;
  address public immutable constantFees;

  uint256 public immutable line;

  RouterLike public immutable router;
  address public immutable slaveDomainABridge;

  L1Escrow public immutable escrow;
  address public immutable dai;

  constructor(
    bytes32 _slaveDomainA,
    WormholeJoinLike _wormholeJoin,
    address _constantFees,
    uint256 _line,
    RouterLike _router,
    address _slaveDomainABridge,
    L1Escrow _escrow,
    address _dai
  ) {
    slaveDomainA = _slaveDomainA;
    wormholeJoin = _wormholeJoin;
    constantFees = _constantFees;
    line = _line;
    router = _router;
    slaveDomainABridge = _slaveDomainABridge;
    escrow = _escrow;
    dai = _dai;
  }

  function execute() external {
    router.file(bytes32("gateway"), slaveDomainA, slaveDomainABridge);

    wormholeJoin.file(bytes32("fees"), slaveDomainA, constantFees);
    wormholeJoin.file(bytes32("line"), slaveDomainA, line);

    escrow.approve(dai, slaveDomainABridge, type(uint256).max);
  }
}
