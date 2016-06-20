contract Shareit{

	address public owner;
	uint public created;
	uint public periodSeconds;
	uint public shares;
	mapping(address => Holder) holders;
	mapping(uint => Log) logs;

	struct Log {
		bool isFinalized;
		uint weiReceived;
		uint sharesInc;
		uint shares;
	}

	struct Holder {
		uint created;
		uint shares;
		uint weiUnpaid;
		mapping(uint => HolderLog) logs;
	}

	struct HolderLog {
		bool isFinalized;
		uint sharesInc;
		uint sharesDec;
		uint shares;
	}

	function Shareit(uint _periodSeconds) {
		if(_periodSeconds == 0)
			throw;

		owner = msg.sender;
		created = now;
		periodSeconds = _periodSeconds;
	}

	function finalizeLog(uint period) {
		
		if(period >= getPeriod())
			throw;

		if(logs[period].isFinalized)
			throw;

		if(period != getPeriodAt(created) && !logs[period - 1].isFinalized)
			throw;

		logs[period].shares = logs[period-1].shares + logs[period].sharesInc;
		logs[period].isFinalized = true;

	}

	function finalizeHolderLog(address addr, uint period) {
		
		if(!logs[period].isFinalized)
			throw;

		Holder holder = holders[addr];

		if(holder.logs[period].isFinalized)
			throw;

		if(period != getPeriodAt(holder.created) && !holder.logs[period - 1].isFinalized)
			throw;

		holder.logs[period].shares =
			holder.logs[period-1].shares
			+ holder.logs[period].sharesInc
			- holder.logs[period].sharesDec;

		if (holder.logs[period].shares > 0) {
			holder.weiUnpaid += ((holder.logs[period].shares * logs[period].weiReceived) / logs[period].shares);
		}

		holder.logs[period].isFinalized = true;

	}

	function getPeriod() constant returns (uint){
		return (now - created) / periodSeconds;
	}

	function getPeriodAt(uint time) constant returns (uint){
		if(time < created){
			return 0;
		}

		return (time - created) / periodSeconds;
	}

	function inflate(address addr, uint count) {
		if(msg.sender != owner)
			throw;

		uint period = getPeriod();

		shares += count;
		logs[period].sharesInc += count;
		holders[addr].shares += count;
		holders[addr].logs[period].sharesInc += count;

		if(holders[addr].created == 0){
			holders[addr].created = now;
		}
	}

	function depositWei() {
		logs[getPeriod()].weiReceived += msg.value;
	}

	function withdrawWei() {
		if(!msg.sender.send(holders[msg.sender].weiUnpaid))
			throw;

		holders[msg.sender].weiUnpaid = 0;
	}

	function getHolderParams(address addr) constant returns(uint, uint, uint) {
		Holder holder = holders[addr];
		return (holder.created, holder.shares, holder.weiUnpaid);
	}

	function getLogParams(uint period) constant returns(bool, uint, uint, uint) {
		Log log = logs[period];
		return (log.isFinalized, log.weiReceived, log.sharesInc, log.shares);
	}

	function getHolderLogParams(address addr, uint period) constant returns(bool, uint, uint, uint) {
		HolderLog holderLog = holders[addr].logs[period];
		return (holderLog.isFinalized, holderLog.sharesInc, holderLog.sharesDec, holderLog.shares);
	}

	function bootstrapHolder(address addr) {
		if(holders[addr].created == 0){
			holders[addr].created = getPeriod();
		}
	}

}