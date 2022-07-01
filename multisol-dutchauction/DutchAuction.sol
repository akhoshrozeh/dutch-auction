// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./console.sol";
import "./Ownable.sol";

interface IERC721 {
    function safeTransferFrom(address from, address to, uint tokenId) external;
}

// Dutch Auction for an ERC721
contract DutchAuction is Ownable {

    bool public auctionLive;
    Item private _item;
    bool _locked;

    struct Item {
        uint startTS;
        uint endTS;
        uint startPrice;
        uint tokenId;
        address tokenAddress;
    }

    // prevent reentrancy
    modifier lock() {
        require(!_locked, "locked");
        _locked = true;
        _;
        _locked = false;
    }

    constructor() {}

    function createItem(uint startTS, uint endTS, uint startPrice,  uint tokenId, address tokenAddress) public onlyOwner {
        require(!auctionLive, "auction ongoing");
        require(startTS < endTS, "bad ts");

        _item = Item(startTS, endTS, startPrice, tokenId, tokenAddress);
        IERC721(tokenAddress).safeTransferFrom(msg.sender, address(this), tokenId);
        auctionLive = true;
    }

    
    function bid() public payable lock {
        Item memory itm = _item;

        require(auctionLive, "auction not live");

        // auction expired; refund back to caller
        if (block.timestamp > itm.endTS) {            
            (bool res, ) = payable(msg.sender).call{value: msg.value}("");
            require(res, "refund1 fail");
            
            IERC721(itm.tokenAddress).safeTransferFrom(address(this), owner(), itm.tokenId);
        }

        else {
            uint currPrice = getPrice();
            require(msg.value >= currPrice, "not enough");

            // send refunds back to bidder if overpaid
            if (msg.value > currPrice) {
                (bool res, ) = payable(msg.sender).call{value: msg.value - currPrice}("");
                require(res, "refund2 fail");
            }

            IERC721(itm.tokenAddress).safeTransferFrom(address(this), msg.sender, itm.tokenId);

        }

        // clean up auction
        auctionLive = false;
        delete _item;
    }


    //
    function getPrice() public view returns (uint) {
        Item memory i = _item;
        require(block.timestamp <= i.endTS, "auction expired");

        uint duration = i.endTS - i.startTS;

        // avoid rounding errors by scaling up
        // multiply first, then divide
        uint slope = (i.startPrice * 1e18) / duration;

        // change in price
        uint dPrice = ((block.timestamp - i.startTS) * slope) / 1e18;
        return i.startPrice - dPrice;
    }

}