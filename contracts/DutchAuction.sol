// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";


interface IERC721 {
    function safeTransferFrom(address from, address to, uint tokenId) external;
}

// Dutch Auction for an ERC721
contract DutchAuction is Ownable, ERC721Holder {

    bool private _locked;
    bool public auctionLive;

    // singleton
    Item private _item;

    // Item to be sold for auction
    struct Item {
        uint startTS;
        uint endTS;
        uint startPrice;
        uint reservationPrice;
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

    function createItem(uint startTS, uint endTS, uint startPrice, uint reservationPrice, uint tokenId, address tokenAddress) public onlyOwner {
        require(!auctionLive, "auction ongoing");
        require(startTS < endTS, "bad ts");
        require(reservationPrice < startPrice, "bad pricing");

        _item = Item(startTS, endTS, startPrice, reservationPrice, tokenId, tokenAddress);
        IERC721(tokenAddress).safeTransferFrom(msg.sender, address(this), tokenId);
        auctionLive = true;
    }

    
    function bid() public payable lock {
        require(auctionLive, "auction not live");

        Item memory itm = _item;

        // auction expired; refund back to caller
        if (block.timestamp > itm.endTS) {            
            (bool res, ) = payable(msg.sender).call{value: msg.value}("");
            require(res, "refund1 fail");
            
            IERC721(itm.tokenAddress).safeTransferFrom(address(this), owner(), itm.tokenId);
        }

        // auction not expired, so purchase
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

        // clean up auction data
        auctionLive = false;
        delete _item;
    }


    // calculates current price
    function getPrice() public view returns (uint) {
        require(auctionLive, "auction not live");
        Item memory i = _item;
        require(block.timestamp <= i.endTS, "auction expired");

        uint duration = i.endTS - i.startTS;

        // avoid rounding errors by scaling up
        // multiply first, then divide
        uint slope = ((i.startPrice - i.reservationPrice) * 1e18) / duration;

        // change in price
        uint dPrice = (block.timestamp - i.startTS) * slope;

        // scale back down
        return ((i.startPrice * 1e18) - dPrice) / 1e18;
    }

    // owner collects bids
    function withdraw() public onlyOwner {
        (bool res, ) = owner().call{value: address(this).balance}("");
        require(res, "withdraw fail");
    }

}