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

contract TestBadDebtPushSpell {
  uint256 public constant RAY = 10**27;

  VatLike public immutable vat;
  address public immutable wormholeJoin;
  uint256 public immutable line;
  bytes32 public immutable ilk;

  constructor(
    VatLike _vat,
    address _wormholeJoin,
    uint256 _line,
    bytes32 _ilk
  ) {
    wormholeJoin = _wormholeJoin;
    vat = _vat;
    line = _line;
    ilk = _ilk;
  }

  function execute() external {
    vat.rely(wormholeJoin);
    vat.init(ilk);
    vat.file(ilk, bytes32("spot"), RAY);
    vat.file(ilk, bytes32("line"), line);
  }
}
