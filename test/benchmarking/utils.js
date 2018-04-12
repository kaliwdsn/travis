const BigNumber = require("bignumber.js")
const Tx = require("ethereumjs-tx")
const async = require("async")
const config = require("config")

const blockTimeout = config.get("blockTimeout") || 20
const waitInterval = config.get("waitInterval") || 100
const concurrency = config.get("concurrency") || 100

const sendTxGas = 21000 // Simple transaction gas requirement
const sendTokenTxGas = 37611 // Token transaction gas requirement(estimate)

exports.generateRawTransaction = txObject => {
  const txParams = {
    nonce: "0x" + txObject.nonce.toString(16),
    gasPrice: "0x" + txObject.gasPrice.toString(16),
    gas: "0x" + new BigNumber(sendTxGas).toString(16),
    from: txObject.from,
    to: txObject.to,
    value: txObject.value ? "0x" + txObject.value.toString(16) : "0x00",
    data: "0x"
  }
  let tx = new Tx(txParams)
  tx.sign(txObject.privKey)

  return "0x" + tx.serialize().toString("hex")
}

exports.generateTransaction = txObject => {
  const txParams = {
    gasPrice: "0x" + txObject.gasPrice.toString(16),
    gas: "0x" + new BigNumber(sendTxGas).toString(16),
    from: txObject.from,
    to: txObject.to,
    value: txObject.value,
    data: "0x"
  }
  return txParams
}

exports.sendRawTransactions = (web3, transactions, cb) => {
  let start = new Date()
  async.parallelLimit(
    transactions.map(tx => {
      return web3.cmt.sendRawTransaction.bind(null, tx)
    }),
    concurrency,
    err => {
      if (err) {
        return cb(err)
      }

      cb(null, new Date() - start)
    }
  )
}

exports.sendTransactions = (web3, transactions, cb) => {
  let start = new Date()
  async.parallelLimit(
    transactions.map(tx => {
      return web3.cmt.sendTransaction.bind(null, tx)
    }),
    concurrency,
    err => {
      if (err) {
        return cb(err)
      }

      cb(null, new Date() - start)
    }
  )
}

exports.tokenTransfer = (web3, tokenInstance, transactions, cb) => {
  let start = new Date()
  async.parallelLimit(
    transactions.map(tx => {
      return tokenInstance.transfer.sendTransaction.bind(null, tx.to, tx.value)
    }),
    concurrency,
    err => {
      if (err) {
        return cb(err)
      }

      cb(null, new Date() - start)
    }
  )
}

exports.waitProcessedInterval = (
  web3,
  startingBlock,
  fromAddr,
  initialNonce,
  txs,
  cb
) => {
  let interval = setInterval(() => {
    let blocksGone = web3.cmt.blockNumber - startingBlock
    if (blocksGone > blockTimeout) {
      clearInterval(interval)
      cb(new Error(`Pending full after ${blockTimeout} blocks`))
      return
    }

    let balance = web3.cmt.getBalance(fromAddr)
    let processed = web3.cmt.getTransactionCount(fromAddr) - initialNonce
    console.log(
      `Blocks Passed ${blocksGone}, current balance: ${balance.toString()}, processed transactions: ${processed}`
    )

    if (processed >= txs) {
      clearInterval(interval)
      cb(null, new Date())
    }
  }, waitInterval || 100)
}

exports.waitMultipleProcessed = (web3, startingBlock, accounts, txs, cb) => {
  async.parallelLimit(
    accounts.map(addr => {
      return exports.waitProcessedInterval.bind(
        null,
        web3,
        startingBlock,
        addr,
        0,
        txs
      )
    }),
    concurrency,
    (err, ms) => {
      if (err) {
        return cb(err)
      }
      cb(null, new Date())
    }
  )
}

exports.calculateTransactionsPrice = (gasPrice, value, txcount) => {
  return new BigNumber(gasPrice)
    .times(sendTxGas)
    .plus(value)
    .times(txcount)
}

exports.calculateTokenTransactionsPrice = (gasPrice, txcount) => {
  return new BigNumber(gasPrice).times(sendTokenTxGas).times(txcount)
}

exports.getTokenBalance = function(web3, addr) {
  let contractAddress = config.get("contractAddress")
  let fs = require("fs")
  let abi = JSON.parse(fs.readFileSync("TestToken.json").toString())["abi"]
  let tokenContract = web3.cmt.contract(abi)
  let tokenInstance = tokenContract.at(contractAddress)

  return tokenInstance.balanceOf(addr)
}