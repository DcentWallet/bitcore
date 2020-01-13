import { CoinStorage } from '../../../models/coin';
import { Transform } from 'stream';

export class ListTransactionsStream extends Transform {
  constructor() {
    super({ objectMode: true });
  }

  async _transform(transaction, _, done) {
    const sending = !! await CoinStorage.collection.countDocuments({
      'wallets.0': { $exists: true },
      spentTxid: transaction.txid
    });

    if (sending) {
      const outputs = await CoinStorage.collection
        .find(
          {
            chain: transaction.chain,
            network: transaction.network,
            mintTxid: transaction.txid
          },
          { batchSize: 10000 }
        )
        .project({ address: 1, wallets: 1, value: 1, mintIndex: 1 })
        .addCursorFlag('noCursorTimeout', true)
        .toArray();
      outputs.forEach((output) => {
        this.push(
          JSON.stringify({
            id: transaction._id,
            txid: transaction.txid,
            fee: transaction.fee,
            size: transaction.size,
            category: 'send',
            satoshis: -output.value,
            height: transaction.blockHeight,
            address: output.address,
            outputIndex: output.mintIndex,
            blockTime: transaction.blockTimeNormalized
          }) + '\n'
        );
      });
      if (transaction.fee > 0) {
        this.push(
          JSON.stringify({
            id: transaction._id,
            txid: transaction.txid,
            category: 'fee',
            satoshis: -transaction.fee,
            height: transaction.blockHeight,
            blockTime: transaction.blockTimeNormalized
          }) + '\n'
        );
      }
      return done();
    } else {
      const outputs = await CoinStorage.collection.find({
        mintTxid: transaction.txid
      })
        .project({ address: 1, wallets: 1, value: 1, mintIndex: 1 })
        .addCursorFlag('noCursorTimeout', true)
        .toArray();
      outputs.forEach((output) => {
        this.push(
          JSON.stringify({
            id: transaction._id,
            txid: transaction.txid,
            fee: transaction.fee,
            size: transaction.size,
            category: 'receive',
            satoshis: output.value,
            height: transaction.blockHeight,
            address: output.address,
            outputIndex: output.mintIndex,
            blockTime: transaction.blockTimeNormalized
          }) + '\n'
        );
      });
    }
    done();
  }
}
