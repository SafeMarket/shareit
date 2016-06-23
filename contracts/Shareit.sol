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
    uint weiCarried;
    uint sharesInc;
    uint shares;
  }

  struct Holder {
    uint shares;
    uint weiUnpaid;
    mapping(uint => HolderLog) logs;
  }

  struct HolderLog {
    bool isFinalized;
    uint sharesInc;
    uint sharesDec;
    uint shares;
    uint weiRewarded;
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

    if(period != 0 && !logs[period - 1].isFinalized)
      throw;

    logs[period].shares = logs[period-1].shares + logs[period].sharesInc;
    logs[period+1].weiCarried += (logs[period].weiReceived + logs[period].weiCarried) % logs[period].shares;

    logs[period].isFinalized = true;

  }

  function finalizeHolderLog(address addr, uint period) {
    
    if(!logs[period].isFinalized)
      throw;

    Holder holder = holders[addr];
    Log log = logs[period];

    if(holder.logs[period].isFinalized)
      throw;

    if(period != 0 && !holder.logs[period - 1].isFinalized)
      throw;

    holder.logs[period].shares =
      holder.logs[period-1].shares
      + holder.logs[period].sharesInc
      - holder.logs[period].sharesDec;

    if (holder.logs[period].shares > 0) {
      holder.logs[period].weiRewarded =  (
        (holder.logs[period].shares * (log.weiReceived + log.weiCarried - logs[period+1].weiCarried))
        /
        log.shares
      );
      holder.weiUnpaid += holder.logs[period].weiRewarded;
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
  }

  function() {
    logs[getPeriod()].weiReceived += msg.value;
  }

  function withdrawTo(address addr) {
    uint weiUnpaid = holders[msg.sender].weiUnpaid;
    holders[msg.sender].weiUnpaid = 0;
    if(!addr.call.value(weiUnpaid)())
      throw;
  }

  function getHolderParams(address addr) constant returns(uint, uint) {
    Holder holder = holders[addr];
    return (holder.shares, holder.weiUnpaid);
  }

  function getLogParams(uint period) constant returns(bool, uint, uint, uint, uint) {
    Log log = logs[period];
    return (log.isFinalized, log.weiReceived, log.weiCarried, log.sharesInc, log.shares);
  }

  function getHolderLogParams(address addr, uint period) constant returns(bool, uint, uint, uint, uint) {
    HolderLog holderLog = holders[addr].logs[period];
    return (holderLog.isFinalized, holderLog.sharesInc, holderLog.sharesDec, holderLog.shares, holderLog.weiRewarded);
  }

  function totalSupply() constant returns (uint256 supply) {
    return shares;
  }

  function balanceOf(address addr) constant returns (uint256 balance) {
    return holders[addr].shares;
  }

  function transfer(address addr, uint256 count) {
    if(holders[msg.sender].shares < count)
      throw;

    uint period = getPeriod();

    holders[msg.sender].shares -= count;
    holders[msg.sender].logs[period].sharesDec += count;
    holders[addr].shares += count;
    holders[addr].logs[period].sharesInc += count;
  }

}