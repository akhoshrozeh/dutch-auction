const { ethers, waffle} = require("hardhat");
const { expect } = require('chai');
const chai = require('chai');
const provider = waffle.provider;

describe('Basic Functionalities\n  *********************\n', async function() {
    before('get factories', async function () {
        this.accounts = await hre.ethers.getSigners();

        // deploy erc721/nft contract that will be used in dutch auction
        console.log("Creating NFT contracts...")
        this.nftFactory = await hre.ethers.getContractFactory('NFT')
        this.nft = await this.nftFactory.deploy();
        await this.nft.deployed();

        console.log("Creating Dutch Auction contract...");
        this.dutchAuctionFactory = await hre.ethers.getContractFactory("DutchAuction");
        this.da = await this.dutchAuctionFactory.deploy();
        await this.da.deployed();


        
    });

    it('Creating item/starting auction', async function () {
        // minting NFTs for auction
        await this.nft.connect(this.accounts[0]).mint(this.accounts[0].address, 10);
        await this.nft.connect(this.accounts[0]).setApprovalForAll(this.da.address, true);

        const weekTime = 3600 * 24 * 7;
        const startTS = 2000000000;
        const endTS = startTS + weekTime;
        const startPrice = ethers.utils.parseEther("1.0");
        const reservationPrice = 0;
        
        expect(await this.da.auctionLive()).to.equal(false);

        await ethers.provider.send("evm_mine", [startTS])
        // create the auction
        await this.da.connect(this.accounts[0]).createItem(startTS, endTS, startPrice, reservationPrice, 1, this.nft.address);

        // check auction is live and auction contract owns nft now
        expect(await this.da.auctionLive()).to.equal(true);
        expect(await this.nft.ownerOf(1)).to.equal(this.da.address);

        console.log('Starting Price: 1 eth');
        console.log('Duration: 1 week');

    });

    it('Checking prices throughout auction', async function () {
        const tenthOfWeek = 3600 * 24 * 7 / 10;
         // few seconds have passed since auction began; can't ts to be less than current time
        let currTS = 2000000003;

        // each iteration, 1/10 of a week's time has passed
        // so the price should decrease by 0.1 ether each time we check
        for (let i = 0; i < 9; i++) {
            console.log("Price at", i*10, "% through auction", await this.da.getPrice() / 1e18);
            currTS += tenthOfWeek;
            await ethers.provider.send("evm_mine", [currTS])
        }
        
        console.log("Price at", 9*10, "% through auction", await this.da.getPrice() / 1e18);
        // ~9/10 of the week have passed, so the price should be slightly less than 0.1 ether (due to timing inaccuracies in local testnet)
    }); 

    it('Bidding on auction', async function () {
        console.log('BIDDER ADDRESS:', this.accounts[1].address);
        console.log('CONTRACT ADDRESS:', this.da.address);
        console.log('OWNER ADDRESS:', this.accounts[0].address, "\n\n");

        console.log('PRE BID BALANCES:');
        console.log('Auction contract balance: ', await provider.getBalance(this.da.address) / 1e18);
        console.log('Bidder balance: ', await provider.getBalance(this.accounts[1].address) / 1e18);
        console.log('Owner ERC721: ', await this.nft.ownerOf(1));
        
        // overpay and get some refunds
        const val = {value: ethers.utils.parseEther("0.5")}
        
        // auction owns nft
        expect(await this.nft.ownerOf(1)).to.equal(this.da.address);
        
        // price is not about 0.1 eth
        await this.da.connect(this.accounts[1]).bid(val);
        
        // bidder won the auction
        expect(await this.nft.ownerOf(1)).to.equal(this.accounts[1].address);
        
        console.log('\n\nPOST BID BALANCES:');
        console.log('Auction contract balance: ', await provider.getBalance(this.da.address) / 1e18);
        console.log('Bidder balance: ', await provider.getBalance(this.accounts[1].address) / 1e18);
        console.log('Owner ERC721: ', await this.nft.ownerOf(1));
           
        
    });
    
    it('Owner withdraws funds', async function () {
        console.log('Owner balance before: ', await provider.getBalance(this.accounts[0].address) / 1e18);
        console.log('Owner withdrawing this much: ', await provider.getBalance(this.da.address) / 1e18);
        await this.da.connect(this.accounts[0]).withdraw();
        console.log('Owner balance after: ', await provider.getBalance(this.accounts[0].address) / 1e18);

    });

    it('Can create another auction after 1st one completed', async function () {
        const weekTime = 3600 * 24 * 7;
        const startTS = 2001000000;
        const endTS = startTS + weekTime;
        const startPrice = ethers.utils.parseEther("1.0");
        const reservationPrice = 0;
        
        expect(await this.da.auctionLive()).to.equal(false);

        await ethers.provider.send("evm_mine", [startTS])
        // create the auction
        await this.da.connect(this.accounts[0]).createItem(startTS, endTS, startPrice, reservationPrice, 2, this.nft.address);

        // check auction is live and auction contract owns nft now
        expect(await this.da.auctionLive()).to.equal(true);
        expect(await this.nft.ownerOf(2)).to.equal(this.da.address);

    });
    
    it('Correct auction clean up if expired', async function () {
        const weekTime = 3600 * 24 * 7;
        const startTS = 2001000000;
        let expiredTS = startTS + 2 * weekTime;  

        // fast forward 2 weeks; expired auction now
        await ethers.provider.send("evm_mine", [expiredTS])

        console.log('User tries to bid 1eth on expired contract, gets refunds');
        console.log('User balance before bad bid: ', await provider.getBalance(this.accounts[5].address));

        expect(await this.da.auctionLive()).to.equal(true);
        expect(await this.nft.ownerOf(2)).to.equal(this.da.address);

        // someone tries to bid
        await this.da.connect(this.accounts[5]).bid({value: ethers.utils.parseEther("1.0")});

        console.log('User balance after bad bid: ', await provider.getBalance(this.accounts[5].address));

        // confirm auction is over
        expect(await this.da.auctionLive()).to.equal(false);

        // erc721 was sent back to owner since auction was expired when bid() was called
        expect(await this.nft.ownerOf(2)).to.equal(this.accounts[0].address);
        
    });


});