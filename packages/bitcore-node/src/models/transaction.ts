
import { CoinStorage } from './coin';
import { TransformOptions } from '../types/TransformOptions';
import { LoggifyClass } from '../decorators/Loggify';
import { Bitcoin } from '../types/namespaces/Bitcoin';
import { MongoBound } from './base';
import { StorageService } from '../services/storage';
import { TransactionJSON } from '../types/Transaction';
import { SpentHeightIndicators } from '../types/Coin';
import { Config } from '../services/config';
import { BaseTransaction, ITransaction } from './baseTransaction';
import { Readable, Transform } from 'stream';
import { Collection } from 'mongodb';
import { partition } from '../utils/partition';

export { ITransaction };

const MAX_BATCH_SIZE = 50000;

export type IBtcTransaction = ITransaction & {
  coinbase: boolean;
  locktime: number;
  inputCount: number;
  outputCount: number;
  size: number;
};

export type MintOp = {
  updateOne: {
    filter: {
      mintTxid: string;
      mintIndex: number;
      chain: string;
      network: string;
    };
    update: {
      $set: {
        chain: string;
        network: string;
        address: string;
        mintHeight: number;
        coinbase: boolean;
        value: number;
        script: Buffer;
        spentTxid?: string;
        spentHeight?: SpentHeightIndicators;
      };
      $setOnInsert: {
        spentHeight: SpentHeightIndicators;
      };
    };
    upsert: true;
    forceServerObjectId: true;
  };
};

export type SpendOp = {
  updateOne: {
    filter: {
      mintTxid: string;
      mintIndex: number;
      spentHeight: { $lt: SpentHeightIndicators };
      chain: string;
      network: string;
    };
    update: { $set: { spentTxid: string; spentHeight: number } };
  };
};

export interface TxOp {
  updateOne: {
    filter: { txid: string; chain: string; network: string };
    update: {
      $set: {
        chain: string;
        network: string;
        blockHeight: number;
        blockHash?: string;
        blockTime?: Date;
        blockTimeNormalized?: Date;
        coinbase: boolean;
        fee: number;
        size: number;
        locktime: number;
        inputCount: number;
        outputCount: number;
        value: number;
        mempoolTime?: Date;
      };
      $setOnInsert?: TxOp['updateOne']['update']['$set'];
    };
    upsert: true;
    forceServerObjectId: true;
  };
}

const getUpdatedBatchIfMempool = (batch, height) =>
  height >= SpentHeightIndicators.minimum ? batch : batch.map(op => TransactionStorage.toMempoolSafeUpsert(op, height));

export class MempoolSafeTransform extends Transform {
  constructor(private height: number) {
    super({ objectMode: true });
  }

  async _transform(
    coinBatch: Array<{ updateOne: { filter: any; update: { $set: any; $setOnInsert?: any } } }>,
    _,
    done
  ) {
    done(null, getUpdatedBatchIfMempool(coinBatch, this.height));
  }
}

export class MongoWriteStream extends Transform {
  constructor(private collection: Collection) {
    super({ objectMode: true });
  }

  async _transform(data: Array<any>, _, done) {
    await Promise.all(
      partition(data, data.length / Config.get().maxPoolSize).map(batch => this.collection.bulkWrite(batch))
    );
    done(null, data);
  }
}

export class PruneMempoolStream extends Transform {
  constructor(private chain: string, private network: string, private initialSyncComplete: boolean) {
    super({ objectMode: true });
  }

  async _transform(spendOps: Array<SpendOp>, _, done) {
    await TransactionStorage.pruneMempool({
      chain: this.chain,
      network: this.network,
      initialSyncComplete: this.initialSyncComplete,
      spendOps
    });
    done(null, spendOps);
  }
}

@LoggifyClass
export class TransactionModel extends BaseTransaction<IBtcTransaction> {
  constructor(storage?: StorageService) {
    super(storage);
  }

  async batchImport(params: {
    txs: Array<Bitcoin.Transaction>;
    height: number;
    mempoolTime?: Date;
    blockTime?: Date;
    blockHash?: string;
    blockTimeNormalized?: Date;
    parentChain?: string;
    forkHeight?: number;
    chain: string;
    network: string;
    initialSyncComplete: boolean;
  }) {
    const { initialSyncComplete, height, chain, network } = params;

    const spentStream = new Readable({
      objectMode: true,
      read: () => {}
    });

    const txStream = new Readable({
      objectMode: true,
      read: () => {}
    });

    this.streamSpendOps({ ...params, spentStream });
    await new Promise(r =>
      spentStream
        .pipe(new MongoWriteStream(CoinStorage.collection))
        .pipe(new PruneMempoolStream(chain, network, initialSyncComplete))
        .on('finish', r)
    );

    this.streamTxOps({ ...params, txs: params.txs as Bitcoin.Transaction[], txStream });
    await new Promise(r =>
      txStream
        .pipe(new MempoolSafeTransform(height))
        .pipe(new MongoWriteStream(TransactionStorage.collection))
        .on('finish', r)
    );
  }

  async streamTxOps(params: {
    txs: Array<Bitcoin.Transaction>;
    height: number;
    blockTime?: Date;
    blockHash?: string;
    blockTimeNormalized?: Date;
    parentChain?: string;
    forkHeight?: number;
    initialSyncComplete: boolean;
    chain: string;
    network: string;
    mempoolTime?: Date;
    txStream: Readable;
  }) {
    let {
      blockHash,
      blockTime,
      blockTimeNormalized,
      chain,
      height,
      network,
      parentChain,
      forkHeight,
      mempoolTime
    } = params;
    if (parentChain && forkHeight && height < forkHeight) {
      const parentTxs = await TransactionStorage.collection
        .find({ blockHeight: height, chain: parentChain, network })
        .toArray();
      params.txStream.push(
        parentTxs.map(parentTx => {
          return {
            updateOne: {
              filter: { txid: parentTx.txid, chain, network },
              update: {
                $set: {
                  chain,
                  network,
                  blockHeight: height,
                  blockHash,
                  blockTime,
                  blockTimeNormalized,
                  coinbase: parentTx.coinbase,
                  fee: parentTx.fee,
                  size: parentTx.size,
                  locktime: parentTx.locktime,
                  inputCount: parentTx.inputCount,
                  outputCount: parentTx.outputCount,
                  value: parentTx.value,
                  ...(mempoolTime && { mempoolTime })
                }
              },
              upsert: true,
              forceServerObjectId: true
            }
          };
        })
      );
    } else {
      let spentQuery;
      if (height > 0) {
        spentQuery = { spentHeight: height, chain, network };
      } else {
        spentQuery = { spentTxid: { $in: params.txs.map(tx => tx._hash) }, chain, network };
      }
      const spent = await CoinStorage.collection
        .find(spentQuery)
        .project({ spentTxid: 1, value: 1 })
        .toArray();

      let txBatch = new Array<TxOp>();
      for (let tx of params.txs) {
        const txid = tx._hash!;
        let fee = 0;

        txBatch.push({
          updateOne: {
            filter: { txid, chain, network },
            update: {
              $set: {
                chain,
                network,
                blockHeight: height,
                blockHash,
                blockTime,
                blockTimeNormalized,
                coinbase: tx.isCoinbase(),
                fee,
                size: tx.toBuffer().length,
                locktime: tx.nLockTime,
                inputCount: tx.inputs.length,
                outputCount: tx.outputs.length,
                value: tx.outputAmount,
                ...(mempoolTime && { mempoolTime })
              }
            },
            upsert: true,
            forceServerObjectId: true
          }
        });

        if (txBatch.length > MAX_BATCH_SIZE) {
          params.txStream.push(txBatch);
          txBatch = new Array<TxOp>();
        }
      }
      if (txBatch.length) {
        params.txStream.push(txBatch);
      }
      params.txStream.push(null);
    }
  }

  streamSpendOps(params: {
    txs: Array<Bitcoin.Transaction>;
    height: number;
    parentChain?: string;
    forkHeight?: number;
    chain: string;
    network: string;
    spentStream: Readable;
  }) {
    let { chain, network, height, parentChain, forkHeight } = params;
    if (parentChain && forkHeight && height < forkHeight) {
      params.spentStream.push(null);
      return;
    }
    let spendOpsBatch = new Array<SpendOp>();
    for (let tx of params.txs) {
      if (tx.isCoinbase()) {
        continue;
      }
      for (let input of tx.inputs) {
        let inputObj = input.toObject();
        const updateQuery = {
          updateOne: {
            filter: {
              mintTxid: inputObj.prevTxId,
              mintIndex: inputObj.outputIndex,
              spentHeight: { $lt: SpentHeightIndicators.minimum },
              chain,
              network
            },
            update: { $set: { spentTxid: tx._hash || tx.hash, spentHeight: height, sequenceNumber: inputObj.sequenceNumber } }
          }
        };
        spendOpsBatch.push(updateQuery);
      }
      if (spendOpsBatch.length > MAX_BATCH_SIZE) {
        params.spentStream.push(spendOpsBatch);
        spendOpsBatch = new Array<SpendOp>();
      }
    }
    if (spendOpsBatch.length) {
      params.spentStream.push(spendOpsBatch);
    }
    params.spentStream.push(null);
    spendOpsBatch = new Array<SpendOp>();
  }

  async pruneMempool(params: {
    chain: string;
    network: string;
    spendOps: Array<SpendOp>;
    initialSyncComplete: boolean;
  }) {
    const { chain, network, spendOps, initialSyncComplete } = params;
    if (!initialSyncComplete || !spendOps.length) {
      return;
    }
    let coins = await CoinStorage.collection
      .find({
        chain,
        network,
        spentHeight: SpentHeightIndicators.pending,
        mintTxid: { $in: spendOps.map(s => s.updateOne.filter.mintTxid) }
      })
      .project({ mintTxid: 1, mintIndex: 1, spentTxid: 1 })
      .toArray();
    coins = coins.filter(
      c =>
        spendOps.findIndex(
          s =>
            s.updateOne.filter.mintTxid === c.mintTxid &&
            s.updateOne.filter.mintIndex === c.mintIndex &&
            s.updateOne.update.$set.spentTxid !== c.spentTxid
        ) > -1
    );

    const invalidatedTxids = Array.from(new Set(coins.map(c => c.spentTxid)));

    await Promise.all([
      this.collection.update(
        { chain, network, txid: { $in: invalidatedTxids } },
        { $set: { blockHeight: SpentHeightIndicators.conflicting } },
        { multi: true }
      ),
      CoinStorage.collection.update(
        { chain, network, mintTxid: { $in: invalidatedTxids } },
        { $set: { mintHeight: SpentHeightIndicators.conflicting } },
        { multi: true }
      )
    ]);

    return;
  }

  _apiTransform(tx: Partial<MongoBound<IBtcTransaction>>, options?: TransformOptions): TransactionJSON | string {
    const transaction: TransactionJSON = {
      _id: tx._id ? tx._id.toString() : '',
      txid: tx.txid || '',
      network: tx.network || '',
      chain: tx.chain || '',
      blockHeight: tx.blockHeight || -1,
      blockHash: tx.blockHash || '',
      blockTime: tx.blockTime ? tx.blockTime.toISOString() : '',
      blockTimeNormalized: tx.blockTimeNormalized ? tx.blockTimeNormalized.toISOString() : '',
      coinbase: tx.coinbase || false,
      locktime: tx.locktime || -1,
      inputCount: tx.inputCount || -1,
      outputCount: tx.outputCount || -1,
      size: tx.size || -1,
      fee: tx.fee || -1,
      value: tx.value || -1
    };
    if (options && options.object) {
      return transaction;
    }
    return JSON.stringify(transaction);
  }
}
export let TransactionStorage = new TransactionModel();
