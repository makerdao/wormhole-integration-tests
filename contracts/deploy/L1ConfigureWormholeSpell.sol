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

contract L1ConfigureWormholeSpell {
  uint256 public constant RAY = 10**27;

  bytes32 public immutable masterDomain;

  WormholeJoinLike public immutable wormholeJoin;
  address public immutable vow;

  VatLike public immutable vat;
  uint256 public immutable line;

  RouterLike public immutable router;

  constructor(
    bytes32 _masterDomain,
    WormholeJoinLike _wormholeJoin,
    address _vow,
    VatLike _vat,
    uint256 _line,
    RouterLike _router
  ) {
    masterDomain = _masterDomain;
    wormholeJoin = _wormholeJoin;
    vow = _vow;
    vat = _vat;
    line = _line;
    router = _router;
  }

  function execute() external {
    wormholeJoin.file(bytes32("vow"), vow);
    router.file(bytes32("gateway"), masterDomain, address(wormholeJoin));

    vat.rely(address(wormholeJoin));
    bytes32 ilk = wormholeJoin.ilk();
    vat.init(ilk);
    vat.file(ilk, bytes32("spot"), RAY);
    vat.file(ilk, bytes32("line"), line);
  }
}
