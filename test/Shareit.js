"use strict";

const fs = require('fs')
const contracts = JSON.parse(fs.readFileSync('./generated/contracts.json', 'utf8')).contracts
const chaithereum = require('chaithereum')
const web3 = chaithereum.web3
const chai = chaithereum.chai
const expect = chaithereum.chai.expect

const periodSeconds = 60 * 60 * 24 * 7
let shareit
let created
let account
let accounts

before(() => {
	return chaithereum.promise.then(() => {
		account = chaithereum.account
		accounts = chaithereum.accounts
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
		return shareit.getPeriod.q().should.eventually.be.bignumber.equal(getPeriod())
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
		return shareit.inflate.q(accounts[1], 10, { from: accounts[1] }).should.be.rejected
	})

	it('should be able to inflate from account', () => {
		return shareit.inflate.q(accounts[0], 10).should.be.fulfilled
	})

	it('should have 10 shares', () => {
		return shareit.shares.q().should.eventually.be.bignumber.equal(10)
	})

	it('should be able to deposit 10 wei', () => {
		return shareit.depositWei.q({ value: 10 }).should.be.fulfilled
	})

	it('should not be able to finalize log 0', () => {
		return shareit.finalizeLog.q(0).should.be.rejected
	})

	it('should not be able to finalize holder log 0', () => {
		return shareit.finalizeHolderLog.q(0).should.be.rejected
	})

	describe('log 0', () => {

		let log0Params

		it('should be retreivable', () => {
			return shareit.getLogParams.q(0).then((logParams) => {
				log0Params = logParams
			})
		})

		it('should not be finalized', () => {
			expect(log0Params[0]).to.be.false
		})

		it('should have received 10 wei', () => {
			expect(log0Params[1]).to.be.bignumber.equal(10)
		})

		it('should have increased shares by 10', () => {
			expect(log0Params[2]).to.be.bignumber.equal(10)
		})

		it('should have total shares of 0, since it hasnt been finalized yet', () => {
			expect(log0Params[3]).to.be.bignumber.equal(0)
		})

	})

	// describe('holder', () => {
	// 	let holder

	// 	it('should be retreivable', () => {
	// 		return share.getHolder.q(account,)
	// 	})
	// })

	describe('holder log 0', () => {

		let holderLog0Params

		it('should be retreivable', () => {
			return shareit.getHolderLogParams.q(account, 0).then((holderLogParams) => {
				holderLog0Params = holderLogParams
			})
		})

		it('should not be finalized', () => {
			expect(holderLog0Params[0]).to.be.false
		})

		it('should have increased shares by 10', () => {
			expect(holderLog0Params[1]).to.be.bignumber.equal(10)
		})

		it('should have decreased shares by 0', () => {
			expect(holderLog0Params[2]).to.be.bignumber.equal(0)
		})

		it('should have total shares of 0, since it hasnt been finalized yet', () => {
			expect(holderLog0Params[3]).to.be.bignumber.equal(0)
		})

	})

})

describe('jump', () => {
	it(`should jump by ${periodSeconds} seconds`, (done) => {
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
})

function getNow(){
	return Math.floor((new Date).getTime() / 1000)
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