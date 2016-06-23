"use strict";

const fs = require('fs')
const crypto = require('crypto')
const contracts = JSON.parse(fs.readFileSync('./generated/contracts.json', 'utf8')).contracts
const chaithereum = require('chaithereum')
const web3 = chaithereum.web3
const chai = chaithereum.chai
const expect = chaithereum.chai.expect

let increasedTime = 0
const periodSeconds = 60 * 60 * 24 * 7
let shareit
let created
let account
let accounts
let addresses

before(() => {
  return chaithereum.promise.then(() => {
    account = chaithereum.account
    accounts = chaithereum.accounts
  })
})

before(() => {
  //drain balances to 100 eth
  return web3.Q.all(Object.keys(new Int8Array(10)).map((index) => {
    return web3.eth.sendTransaction.q({
      from: accounts[index],
      to: 0,
      value: web3.toBigNumber('0xffffffffffffff00000000000000001').minus(web3.toWei('100', 'ether'))
    })
  }))
})

before(() => {
  return chaithereum.generateAddresses().then((_addresses) => {
    addresses = _addresses
  })
})

describe('Shareit', () => {

  it('should fail to instantiate with periodSeconds of 0', () => {
    return web3.eth.contract(JSON.parse(contracts.Shareit.interface)).new.q(
      0, { data: contracts.Shareit.bytecode }
    ).should.be.rejected
  })

  it('should successfully instantiate with non-zero periodSeconds', () => {
    return web3.eth.contract(JSON.parse(contracts.Shareit.interface)).new.q(
      periodSeconds, { data: contracts.Shareit.bytecode }
    ).should.eventually.be.contract.then((_shareit) => {
      shareit = _shareit
    })
  })

  it('should have chaithereum account as owner', () => {
    return shareit.owner.q().should.eventually.equal(account)
  })

  it('should have correct periodSeconds', () => {
    return shareit.periodSeconds.q().should.eventually.be.bignumber.equal(periodSeconds)
  })

  it('should start with correct created', () => {
    return web3.Q.all([
      shareit.created.q().should.eventually.be.bignumber.gt(getNow()-5),
      shareit.created.q().should.eventually.be.bignumber.lt(getNow()+5)
    ]).then((results) => {
      created = results[0].toNumber()
    })
  })

  it('should correctly getPeriod()', () => {
    return shareit.getPeriod.q().should.eventually.be.bignumber.equal(0)
  })

  it('should correctly getPeriodAt(0)', () => {
    return shareit.getPeriodAt.q(0).should.eventually.be.bignumber.equal(0)
  })

  it('should correctly getPeriodAt(randomTime) x 10', () => {
    return web3.Q.all(Object.keys(new Int8Array(10)).map(() => {
      const randomTime = getRandomTime()
      const period = getPeriod(randomTime)
      return shareit.getPeriodAt.q(randomTime).should.eventually.bignumber.equal(period)
    }))
  })

  it('should have 0 shares', () => {
    return shareit.shares.q().should.eventually.be.bignumber.equal(0)
  })

  it('should not be able to inflate from account1', () => {
    return shareit.inflate.q(accounts[0], 10, { from: accounts[1] }).should.be.rejected
  })

  it('should be able to inflate accounts[0] from account', () => {
    return shareit.inflate.q(accounts[0], 5).should.be.fulfilled
  })

  it('should be able to inflate accounts[1] from account', () => {
    return shareit.inflate.q(accounts[1], 5).should.be.fulfilled
  })

  it('should have 10 shares', () => {
    return shareit.shares.q().should.eventually.be.bignumber.equal(10)
  })

  it('should be able to send shareit 12 wei', () => {
    return web3.eth.sendTransaction.q({ to: shareit.address, value: 12 }).should.be.fulfilled
  })

  it('should not be able to finalize log 0', () => {
    return shareit.finalizeLog.q(0).should.be.rejected
  })

  it('should not be able to finalize account0 log 0', () => {
    return shareit.finalizeHolderLog.q(accounts[0], 0).should.be.rejected
  })

  describe('log 0', () => {

    let logParams

    it('should be retreivable', () => {
      return shareit.getLogParams.q(0).then((_logParams) => {
        logParams = _logParams
      })
    })

    it('should not be finalized', () => {
      expect(logParams[0]).to.be.false
    })

    it('should have received 12 wei', () => {
      expect(logParams[1]).to.be.bignumber.equal(12)
    })

    it('should have carried 0 wei', () => {
      expect(logParams[2]).to.be.bignumber.equal(0)
    })

    it('should have increased shares by 10', () => {
      expect(logParams[3]).to.be.bignumber.equal(10)
    })

    it('should have total shares of 0, since it hasnt been finalized yet', () => {
      expect(logParams[4]).to.be.bignumber.equal(0)
    })

  })

  describe('account0 log 0', () => {

    let holderLogParams

    it('should be retreivable', () => {
      return shareit.getHolderLogParams.q(accounts[0], 0).then((_holderLogParams) => {
        holderLogParams = _holderLogParams
      })
    })

    it('should not be finalized', () => {
      expect(holderLogParams[0]).to.be.false
    })

    it('should have increased shares by 5', () => {
      expect(holderLogParams[1]).to.be.bignumber.equal(5)
    })

    it('should have decreased shares by 0', () => {
      expect(holderLogParams[2]).to.be.bignumber.equal(0)
    })

    it('should have total shares of 0, since it hasnt been finalized yet', () => {
      expect(holderLogParams[3]).to.be.bignumber.equal(0)
    })

  })

})

describe('period 1', () => {
  it(`should jump by ${periodSeconds} seconds`, (done) => {
    increasedTime += periodSeconds
    web3.eth.getBlock.q('latest').then((blockBeforeJump) => {
      chaithereum.provider.manager.increaseTime(periodSeconds)
      web3.eth.getBlock.q('latest').then((blockAfterJump) => {
        const timeJumped = blockAfterJump.timestamp - blockBeforeJump.timestamp
        try {
          expect(timeJumped).to.be.within(periodSeconds, periodSeconds + 5)
        } catch (err) {
          return done(err)
        }
        done()
      }, (err) => { done(err) })
    }, (err) => { done(err) })

  })

  it('should correctly getPeriod()', () => {
    return shareit.getPeriod.q().should.eventually.be.bignumber.equal(1)
  })

  it('should correctly getPeriodAt(0)', () => {
    return shareit.getPeriodAt.q(0).should.eventually.be.bignumber.equal(0)
  })

  it('should correctly getPeriodAt(randomTime) x 10', () => {
    return web3.Q.all(Object.keys(new Int8Array(10)).map(() => {
      const randomTime = getRandomTime()
      const period = getPeriod(randomTime)
      return shareit.getPeriodAt.q(randomTime).should.eventually.bignumber.equal(period)
    }))
  })

  it('should not be able to finalize account0 log 0, since log 0 has not been finalized', () => {
    return shareit.finalizeHolderLog.q(accounts[0], 0).should.be.rejected
  })

  it('should be able to finalize log 0', () => {
    return shareit.finalizeLog.q(0).should.be.fulfilled
  })

  it('should not be able to re-finalize log 0', () => {
    return shareit.finalizeLog.q(0).should.be.rejected
  })

  it('should be able to finalize account0 log 0', () => {
    return shareit.finalizeHolderLog.q(accounts[0], 0).should.be.fulfilled
  })

  it('should not be able to re-finalize account0 log 0', () => {
    return shareit.finalizeHolderLog.q(accounts[0], 0).should.be.rejected
  })

  it('should be able to send shareit 15 wei', () => {
    return web3.eth.sendTransaction.q({ to: shareit.address, value: 15 }).should.be.fulfilled
  })

  describe('log 0', () => {

    let logParams

    it('should be retreivable', () => {
      return shareit.getLogParams.q(0).then((_logParams) => {
        logParams = _logParams
      })
    })

    it('should be finalized', () => {
      expect(logParams[0]).to.be.true
    })

    it('should have received 12 wei', () => {
      expect(logParams[1]).to.be.bignumber.equal(12)
    })

    it('should have carried 0 wei', () => {
      expect(logParams[2]).to.be.bignumber.equal(0)
    })

    it('should have increased shares by 10', () => {
      expect(logParams[3]).to.be.bignumber.equal(10)
    })

    it('should have total shares of 10', () => {
      expect(logParams[4]).to.be.bignumber.equal(10)
    })

  })

  describe('log 1', () => {

    let logParams

    it('should be retreivable', () => {
      return shareit.getLogParams.q(1).then((_logParams) => {
        logParams = _logParams
      })
    })

    it('should not be finalized', () => {
      expect(logParams[0]).to.be.false
    })

    it('should have received 15 wei', () => {
      expect(logParams[1]).to.be.bignumber.equal(15)
    })

    it('should have carried 2 wei', () => {
      expect(logParams[2]).to.be.bignumber.equal(2)
    })

    it('should have increased shares by 0', () => {
      expect(logParams[3]).to.be.bignumber.equal(0)
    })

    it('should have total shares of 0, since it hasnt been finalized yet', () => {
      expect(logParams[4]).to.be.bignumber.equal(0)
    })

  })

  describe('account0 log 0', () => {

    let holderLogParams

    it('should be retreivable', () => {
      return shareit.getHolderLogParams.q(accounts[0], 0).then((_holderLogParams) => {
        holderLogParams = _holderLogParams
      })
    })

    it('should be finalized', () => {
      expect(holderLogParams[0]).to.be.true
    })

    it('should have increased shares by 5', () => {
      expect(holderLogParams[1]).to.be.bignumber.equal(5)
    })

    it('should have decreased shares by 0', () => {
      expect(holderLogParams[2]).to.be.bignumber.equal(0)
    })

    it('should have total shares of 5', () => {
      expect(holderLogParams[3]).to.be.bignumber.equal(5)
    })

    it('should have rewarded wei of 5', () => {
      expect(holderLogParams[4]).to.be.bignumber.equal(5)
    })

  })

  describe('holder', () => {
    let holderParams

    it('should be retreivable', () => {
      return shareit.getHolderParams.q(account).then((_holderParams) => {
        holderParams = _holderParams
      })
    })

    it('should have 5 shares', () => {
      expect(holderParams[0]).to.be.bignumber.equal(5)
    })

    it('should have 5 wei unpaid', () => {
      expect(holderParams[1]).to.be.bignumber.equal(5)
    })
  })

  describe('transfers', () => {

    it('should not be able to transfer 6 shares from account0 to account2', () => {
      return shareit.transfer.q(accounts[2], 6).should.be.rejected
    })

    it('should transfer 1 shares from account0 to account3', () => {
      return shareit.transfer.q(accounts[3], 1).should.be.fulfilled
    })

    it('should transfer 2 shares from account1 to account2', () => {
      return shareit.transfer.q(accounts[2], 2, { from: accounts[1] }).should.be.fulfilled
    })

    it('accounts[0] should have 4 shares', () => {
      return shareit.balanceOf.q(accounts[0]).should.eventually.be.bignumber.equal(4)
    })

    it('accounts[1] should have 3 shares', () => {
      return shareit.balanceOf.q(accounts[1]).should.eventually.be.bignumber.equal(3)
    })

    it('accounts[2] should have 2 shares', () => {
      return shareit.balanceOf.q(accounts[2]).should.eventually.be.bignumber.equal(2)
    })

    it('accounts[3] should have 1 shares', () => {
      return shareit.balanceOf.q(accounts[3]).should.eventually.be.bignumber.equal(1)
    })

  })
})

describe('period 2', () => {
  it(`should jump by ${periodSeconds} seconds`, (done) => {
    increasedTime += periodSeconds
    web3.eth.getBlock.q('latest').then((blockBeforeJump) => {
      chaithereum.provider.manager.increaseTime(periodSeconds)
      web3.eth.getBlock.q('latest').then((blockAfterJump) => {
        const timeJumped = blockAfterJump.timestamp - blockBeforeJump.timestamp
        try {
          expect(timeJumped).to.be.within(periodSeconds, periodSeconds + 5)
        } catch (err) {
          return done(err)
        }
        done()
      }, (err) => { done(err) })
    }, (err) => { done(err) })

  })

  it('should be able to send shareit 2 wei', () => {
    return web3.eth.sendTransaction.q({ to: shareit.address, value: 2 }).should.be.fulfilled
  })
})

describe('period 3', () => {
  it(`should jump by ${periodSeconds} seconds`, (done) => {
    increasedTime += periodSeconds
    web3.eth.getBlock.q('latest').then((blockBeforeJump) => {
      chaithereum.provider.manager.increaseTime(periodSeconds)
      web3.eth.getBlock.q('latest').then((blockAfterJump) => {
        const timeJumped = blockAfterJump.timestamp - blockBeforeJump.timestamp
        try {
          expect(timeJumped).to.be.within(periodSeconds, periodSeconds + 5)
        } catch (err) {
          return done(err)
        }
        done()
      }, (err) => { done(err) })
    }, (err) => { done(err) })

  })


  it('should not be able to finalize log 2, since period 1 has not been finalized', () => {
    return shareit.finalizeLog.q(2).should.be.rejected
  })

  it('should be able to finalize log 1 and 2', () => {
    return web3.Q.all([
      shareit.finalizeLog.q(1).should.be.fulfilled,
      shareit.finalizeLog.q(2).should.be.fulfilled
    ])
  })

  it('should not be able to finalize account0 log 2, since account0 log 1 has not been finalized', () => {
    return shareit.finalizeHolderLog.q(accounts[0], 2).should.be.rejected
  })

  it('should be able to finalize account0 log 1 and 2', () => {
    return web3.Q.all([
      shareit.finalizeHolderLog.q(accounts[0], 1).should.be.fulfilled,
      shareit.finalizeHolderLog.q(accounts[0], 2).should.be.fulfilled
    ])
  })
  
  it('should be able to finalize account1 log 0, 1 and 2', () => {
    return web3.Q.all([
      shareit.finalizeHolderLog.q(accounts[1], 0).should.be.fulfilled,
      shareit.finalizeHolderLog.q(accounts[1], 1).should.be.fulfilled,
      shareit.finalizeHolderLog.q(accounts[1], 2).should.be.fulfilled
    ])
  })

  it('should be able to finalize account2 log 0, 1 and 2', () => {
    return web3.Q.all([
      shareit.finalizeHolderLog.q(accounts[2], 0).should.be.fulfilled,
      shareit.finalizeHolderLog.q(accounts[2], 1).should.be.fulfilled,
      shareit.finalizeHolderLog.q(accounts[2], 2).should.be.fulfilled
    ])
  })

  it('should be able to finalize account3 log 0, 1 and 2', () => {
    return web3.Q.all([
      shareit.finalizeHolderLog.q(accounts[3], 0).should.be.fulfilled,
      shareit.finalizeHolderLog.q(accounts[3], 1).should.be.fulfilled,
      shareit.finalizeHolderLog.q(accounts[3], 2).should.be.fulfilled
    ])
  })

  describe('log 1', () => {

    let logParams

    it('should be retreivable', () => {
      return shareit.getLogParams.q(1).then((_logParams) => {
        logParams = _logParams
      })
    })

    it('should be finalized', () => {
      expect(logParams[0]).to.be.true
    })

    it('should have received 15 wei', () => {
      expect(logParams[1]).to.be.bignumber.equal(15)
    })

    it('should have carried 2 wei', () => {
      expect(logParams[2]).to.be.bignumber.equal(2)
    })

    it('should have increased shares by 0', () => {
      expect(logParams[3]).to.be.bignumber.equal(0)
    })

    it('should have total shares of 10', () => {
      expect(logParams[4]).to.be.bignumber.equal(10)
    })

  })

  describe('log 2', () => {

    let logParams

    it('should be retreivable', () => {
      return shareit.getLogParams.q(2).then((_logParams) => {
        logParams = _logParams
      })
    })

    it('should be finalized', () => {
      expect(logParams[0]).to.be.true
    })

    it('should have received 2 wei', () => {
      expect(logParams[1]).to.be.bignumber.equal(2)
    })

    it('should have carried 7 wei', () => {
      expect(logParams[2]).to.be.bignumber.equal(7)
    })

    it('should have increased shares by 0', () => {
      expect(logParams[3]).to.be.bignumber.equal(0)
    })

    it('should have total shares of 10', () => {
      expect(logParams[4]).to.be.bignumber.equal(10)
    })

  })

  describe('log 3', () => {

    let logParams

    it('should be retreivable', () => {
      return shareit.getLogParams.q(3).then((_logParams) => {
        logParams = _logParams
      })
    })

    it('should not be finalized', () => {
      expect(logParams[0]).to.be.false
    })

    it('should have received 0 wei', () => {
      expect(logParams[1]).to.be.bignumber.equal(0)
    })

    it('should have carried 9 wei', () => {
      expect(logParams[2]).to.be.bignumber.equal(9)
    })

    it('should have increased shares by 0', () => {
      expect(logParams[3]).to.be.bignumber.equal(0)
    })

    it('should have total shares of 0, since it hasnt been finalized yet', () => {
      expect(logParams[4]).to.be.bignumber.equal(0)
    })

  })



  describe('account0 log 1', () => {

    let holderLogParams

    it('should be retreivable', () => {
      return shareit.getHolderLogParams.q(accounts[0], 1).then((_holderLogParams) => {
        holderLogParams = _holderLogParams
      })
    })

    it('should be finalized', () => {
      expect(holderLogParams[0]).to.be.true
    })

    it('should have increased shares by 0', () => {
      expect(holderLogParams[1]).to.be.bignumber.equal(0)
    })

    it('should have decreased shares by 1', () => {
      expect(holderLogParams[2]).to.be.bignumber.equal(1)
    })

    it('should have total shares of 4', () => {
      expect(holderLogParams[3]).to.be.bignumber.equal(4)
    })

    it('should have rewarded wei of 4', () => {
      expect(holderLogParams[4]).to.be.bignumber.equal(4)
    })

  })

  describe('account0 log 2', () => {

    let holderLogParams

    it('should be retreivable', () => {
      return shareit.getHolderLogParams.q(accounts[0], 2).then((_holderLogParams) => {
        holderLogParams = _holderLogParams
      })
    })

    it('should be finalized', () => {
      expect(holderLogParams[0]).to.be.true
    })

    it('should have increased shares by 0', () => {
      expect(holderLogParams[1]).to.be.bignumber.equal(0)
    })

    it('should have decreased shares by 0', () => {
      expect(holderLogParams[2]).to.be.bignumber.equal(0)
    })

    it('should have total shares of 4', () => {
      expect(holderLogParams[3]).to.be.bignumber.equal(4)
    })

    it('should have rewarded wei of 0', () => {
      expect(holderLogParams[4]).to.be.bignumber.equal(0)
    })

  })

  describe('account0 holder params', () => {
    let holderParams

    it('should be retreivable', () => {
      return shareit.getHolderParams.q(accounts[0]).then((_holderParams) => {
        holderParams = _holderParams
      })
    })

    it('should have 4 shares', () => {
      expect(holderParams[0]).to.be.bignumber.equal(4)
    })

    it('should have 9 wei unpaid', () => {
      expect(holderParams[1]).to.be.bignumber.equal(9)
    })
  })

  describe('account1 holder params', () => {
    let holderParams

    it('should be retreivable', () => {
      return shareit.getHolderParams.q(accounts[1]).then((_holderParams) => {
        holderParams = _holderParams
      })
    })

    it('should have 3 shares', () => {
      expect(holderParams[0]).to.be.bignumber.equal(3)
    })

    it('should have 8 wei unpaid', () => {
      expect(holderParams[1]).to.be.bignumber.equal(8)
    })
  })

  describe('account2 holder params', () => {
    let holderParams

    it('should be retreivable', () => {
      return shareit.getHolderParams.q(accounts[2]).then((_holderParams) => {
        holderParams = _holderParams
      })
    })

    it('should have 2 shares', () => {
      expect(holderParams[0]).to.be.bignumber.equal(2)
    })

    it('should have 2 wei unpaid', () => {
      expect(holderParams[1]).to.be.bignumber.equal(2)
    })
  })

  describe('account3 holder params', () => {
    let holderParams

    it('should be retreivable', () => {
      return shareit.getHolderParams.q(accounts[3]).then((_holderParams) => {
        holderParams = _holderParams
      })
    })

    it('should have 1 shares', () => {
      expect(holderParams[0]).to.be.bignumber.equal(1)
    })

    it('should have 1 wei unpaid', () => {
      expect(holderParams[1]).to.be.bignumber.equal(1)
    })
  })

  describe('withdrawls', () => {

    it('should withdraw accounts', () => {
      return web3.Q.all(Object.keys(new Int8Array(4)).map((index) => {
        return shareit.withdrawTo.q(addresses[index], { from: accounts[index] }).should.be.fulfilled
      }))
    })

    it('should withdraw accounts', () => {
      return web3.Q.all([
        web3.eth.getBalance.q(addresses[0]).should.eventually.be.bignumber.equal(9),
        web3.eth.getBalance.q(addresses[1]).should.eventually.be.bignumber.equal(8),
        web3.eth.getBalance.q(addresses[2]).should.eventually.be.bignumber.equal(2),
        web3.eth.getBalance.q(addresses[3]).should.eventually.be.bignumber.equal(1)
      ])
    })

  })

  describe('account0 holder params', () => {
    let holderParams

    it('should be retreivable', () => {
      return shareit.getHolderParams.q(accounts[0]).then((_holderParams) => {
        holderParams = _holderParams
      })
    })

    it('should have 4 shares', () => {
      expect(holderParams[0]).to.be.bignumber.equal(4)
    })

    it('should have 0 wei unpaid', () => {
      expect(holderParams[1]).to.be.bignumber.equal(0)
    })
  })

  describe('account1 holder params', () => {
    let holderParams

    it('should be retreivable', () => {
      return shareit.getHolderParams.q(accounts[1]).then((_holderParams) => {
        holderParams = _holderParams
      })
    })

    it('should have 3 shares', () => {
      expect(holderParams[0]).to.be.bignumber.equal(3)
    })

    it('should have 0 wei unpaid', () => {
      expect(holderParams[1]).to.be.bignumber.equal(0)
    })
  })

  describe('account2 holder params', () => {
    let holderParams

    it('should be retreivable', () => {
      return shareit.getHolderParams.q(accounts[2]).then((_holderParams) => {
        holderParams = _holderParams
      })
    })

    it('should have 2 shares', () => {
      expect(holderParams[0]).to.be.bignumber.equal(2)
    })

    it('should have 0 wei unpaid', () => {
      expect(holderParams[1]).to.be.bignumber.equal(0)
    })
  })

  describe('account3 holder params', () => {
    let holderParams

    it('should be retreivable', () => {
      return shareit.getHolderParams.q(accounts[3]).then((_holderParams) => {
        holderParams = _holderParams
      })
    })

    it('should have 1 shares', () => {
      expect(holderParams[0]).to.be.bignumber.equal(1)
    })

    it('should have 0 wei unpaid', () => {
      expect(holderParams[1]).to.be.bignumber.equal(0)
    })
  })

})

function getNow(){
  return increasedTime + Math.floor((new Date).getTime() / 1000)
}

function getPeriod(time){

  const now = getNow()
  time = time || now

  if(time < now)
    return 0
  else
    return Math.floor(((time - created) / periodSeconds))
}

function getRandomTime(){
  return Math.floor(Math.random() * 2 * getNow())
}

function generateRandomAddress(){
  crypto.randomBytes(20, function(err, buffer) {
    token = buffer.toString('hex');
  })
}