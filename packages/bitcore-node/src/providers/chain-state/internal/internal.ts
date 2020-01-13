import { CoinStorage } from '../../../models/coin';
import { BitcoinBlockStorage, IBtcBlock } from '../../../models/block';
import { CSP } from '../../../types/namespaces/ChainStateProvider';
import { Storage } from '../../../services/storage';
import { RPC } from '../../../rpc';
import { LoggifyClass } from '../../../decorators/Loggify';
import { TransactionStorage, ITransaction } from '../../../models/transaction';
import { SpentHeightIndicators, CoinJSON } from '../../../types/Coin';
import { Config } from '../../../services/config';
import { Validation } from 'crypto-wallet-core';
import { TransactionJSON } from '../../../types/Transaction';
import { IBlock } from '../../../models/baseBlock';

@LoggifyClass
export class InternalStateProvider implements CSP.IChainStateService {
  chain: string;
  constructor(chain: string) {
    this.chain = chain;
    this.chain = this.chain.toUpperCase();
  }

  getRPC(chain: string, network: string) {
    const RPC_PEER = Config.get().chains[chain][network].rpc;
    if (!RPC_PEER) {
      throw new Error(`RPC not configured for ${chain} ${network}`);
    }
    const { username, password, host, port } = RPC_PEER;
    return new RPC(username, password, host, port);
  }

  private getAddressQuery(params: CSP.StreamAddressUtxosParams) {
    const { chain, network, address, args } = params;
    if (typeof address !== 'string' || !chain || !network) {
      throw 'Missing required param';
    }
    const query = { chain: chain, network: network.toLowerCase(), address } as any;
    if (args.unspent) {
      query.spentHeight = { $lt: SpentHeightIndicators.minimum };
    }
    return query;
  }
  private getAddressesQuery(params: CSP.StreamAddressesUtxosParams) {
    const { chain, network, address, args } = params;
    if (!chain || !network) {
      throw 'Missing required param';
    }
    const addressquery = {
      $all: address
    }
    const query = { chain: chain, network: network.toLowerCase(), address: addressquery } as any;
    if (args.unspent) {
      query.spentHeight = { $lt: SpentHeightIndicators.minimum };
    }
    return query;
  }

  streamAddressUtxos(params: CSP.StreamAddressUtxosParams) {
    const { req, res, args } = params;
    const { limit, since, offset, pagesize } = args;
    const query = this.getAddressQuery(params);
    Storage.apiStreamingFind(CoinStorage, query, { limit, since, paging: '_id', offset, pagesize }, req, res);
  }

  streamAddressesUtxos(params: CSP.StreamAddressesUtxosParams) {
    const { req, res, args } = params;
    const { limit, since, offset, pagesize } = args;
    const query = this.getAddressesQuery(params);
    Storage.apiStreamingFind(CoinStorage, query, { limit, since, paging: '_id', offset, pagesize }, req, res);
  }


  async streamAddressTransactions(params: CSP.StreamAddressUtxosParams) {
    const { req, res, args } = params;
    const { limit, offset, pagesize } = args;
    const query = this.getAddressQuery(params);
    Storage.transactionStreamingFind(TransactionStorage, query, { limit, paging: '_id', offset, pagesize }, req, res);
  }

  async streamAddressesTransactions(params: CSP.StreamAddressesUtxosParams) {
    const { req, res, args } = params;
    const { limit, offset, pagesize } = args;
    const query = this.getAddressesQuery(params);
    Storage.transactionStreamingFind(TransactionStorage, query, { limit, paging: '_id', offset, pagesize }, req, res);
  }

  async getBalanceForAddress(params: CSP.GetBalanceForAddressParams) {
    const { chain, network, address } = params;
    const query = {
      chain,
      network,
      address,
      spentHeight: { $lt: SpentHeightIndicators.minimum },
      mintHeight: { $gt: SpentHeightIndicators.conflicting }
    };
    let balance = await CoinStorage.getBalance({ query });
    return balance;
  }
  async getBalanceForAddresses(params: CSP.GetBalanceForAddressesParams) {
    const { chain, network, address } = params;
    const query = {
      chain,
      network,
      address: { $in: address },
      spentHeight: { $lt: SpentHeightIndicators.minimum },
      mintHeight: { $gt: SpentHeightIndicators.conflicting }
    };
    let balance = await CoinStorage.getBalances({ query });
    return balance;
  }


  streamBlocks(params: CSP.StreamBlocksParams) {
    const { req, res } = params;
    const { query, options } = this.getBlocksQuery(params);
    Storage.apiStreamingFind(BitcoinBlockStorage, query, options, req, res);
  }

  async getBlocks(params: CSP.GetBlockParams): Promise<Array<IBlock>> {
    const { query, options } = this.getBlocksQuery(params);
    let cursor = BitcoinBlockStorage.collection.find(query, options).addCursorFlag('noCursorTimeout', true);
    if (options.sort) {
      cursor = cursor.sort(options.sort);
    }
    let blocks = await cursor.toArray();
    const tip = await this.getLocalTip(params);
    const tipHeight = tip ? tip.height : 0;
    const blockTransform = (b: IBtcBlock) => {
      let confirmations = 0;
      if (b.height && b.height >= 0) {
        confirmations = tipHeight - b.height + 1;
      }
      const convertedBlock = BitcoinBlockStorage._apiTransform(b, { object: true }) as IBtcBlock;
      return { ...convertedBlock, confirmations };
    };
    return blocks.map(blockTransform);
  }

  protected getBlocksQuery(params: CSP.GetBlockParams | CSP.StreamBlocksParams) {
    const { chain, network, sinceBlock, blockId, args = {} } = params;
    let { startDate, endDate, date, since, direction, paging } = args;
    let { limit = 10, sort = { height: -1 } } = args;
    let options = { limit, sort, since, direction, paging };
    if (!chain || !network) {
      throw 'Missing required param';
    }
    let query: any = {
      chain: chain,
      network: network.toLowerCase(),
      processed: true
    };
    if (blockId) {
      if (blockId.length >= 64) {
        query.hash = blockId;
      } else {
        let height = parseInt(blockId, 10);
        if (Number.isNaN(height) || height.toString(10) !== blockId) {
          throw 'invalid block id provided';
        }
        query.height = height;
      }
    }
    if (sinceBlock) {
      let height = Number(sinceBlock);
      if (Number.isNaN(height) || height.toString(10) !== sinceBlock) {
        throw 'invalid block id provided';
      }
      query.height = { $gt: height };
    }
    if (startDate) {
      query.time = { $gt: new Date(startDate) };
    }
    if (endDate) {
      Object.assign(query.time, { ...query.time, $lt: new Date(endDate) });
    }
    if (date) {
      let firstDate = new Date(date);
      let nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      query.time = { $gt: firstDate, $lt: nextDate };
    }
    return { query, options };
  }

  async getBlock(params: CSP.GetBlockParams) {
    let blocks = await this.getBlocks(params);
    return blocks[0];
  }

  async getBlockBeforeTime(params: { chain: string; network: string; time: Date }) {
    const { chain, network, time } = params;
    const [block] = await BitcoinBlockStorage.collection
      .find({
        chain,
        network,
        timeNormalized: { $lte: new Date(time) }
      })
      .limit(1)
      .sort({ timeNormalized: -1 })
      .toArray();
    return block as IBlock;
  }

  async streamTransactions(params: CSP.StreamTransactionsParams) {
    const { chain, network, req, res, args } = params;
    let { blockHash, blockHeight } = args;
    if (!chain || !network) {
      throw 'Missing chain or network';
    }
    let query: any = {
      chain: chain,
      network: network.toLowerCase()
    };
    if (blockHeight !== undefined) {
      query.blockHeight = Number(blockHeight);
    }
    if (blockHash !== undefined) {
      query.blockHash = blockHash;
    }
    const tip = await this.getLocalTip(params);
    const tipHeight = tip ? tip.height : 0;
    return Storage.apiStreamingFind(TransactionStorage, query, args, req, res, t => {
      let confirmations = 0;
      if (t.blockHeight !== undefined && t.blockHeight >= 0) {
        confirmations = tipHeight - t.blockHeight + 1;
      }
      const convertedTx = TransactionStorage._apiTransform(t, { object: true }) as Partial<ITransaction>;
      return JSON.stringify({ ...convertedTx, confirmations: confirmations });
    });
  }

  async getTransaction(params: CSP.StreamTransactionParams) {
    let { chain, network, txId } = params;
    if (typeof txId !== 'string' || !chain || !network) {
      throw 'Missing required param';
    }
    network = network.toLowerCase();
    let query = { chain: chain, network, txid: txId };
    const tip = await this.getLocalTip(params);
    const tipHeight = tip ? tip.height : 0;
    const found = await TransactionStorage.collection.findOne(query);
    if (found) {
      let confirmations = 0;
      if (found.blockHeight && found.blockHeight >= 0) {
        confirmations = tipHeight - found.blockHeight + 1;
      }
      const convertedTx = TransactionStorage._apiTransform(found, { object: true }) as TransactionJSON;
      return { ...convertedTx, confirmations: confirmations } as any;
    } else {
      return undefined;
    }
  }

  async getAuthhead(params: CSP.StreamTransactionParams) {
    let { chain, network, txId } = params;
    if (typeof txId !== 'string') {
      throw 'Missing required param';
    }
    const found = (await CoinStorage.resolveAuthhead(txId, chain, network))[0];
    if (found) {
      const transformedCoins = found.identityOutputs.map<CoinJSON>(output =>
        CoinStorage._apiTransform(output, { object: true })
      );
      return {
        chain: found.chain,
        network: found.network,
        authbase: found.authbase,
        identityOutputs: transformedCoins
      };
    } else {
      return undefined;
    }
  }

  async getFee(params: CSP.GetEstimateSmartFeeParams) {
    const { chain, network, target } = params;
    return this.getRPC(chain, network).getEstimateSmartFee(Number(target));
  }

  async broadcastTransaction(params: CSP.BroadcastTransactionParams) {
    const { chain, network, rawTx } = params;
    const txids = new Array<string>();
    const rawTxs = typeof rawTx === 'string' ? [rawTx] : rawTx;
    for (const tx of rawTxs) {
      const txid = await this.getRPC(chain, network).sendTransaction(tx);
      txids.push(txid);
    }
    return txids.length === 1 ? txids[0] : txids;
  }

  async getCoinsForTx({ chain, network, txid }: { chain: string; network: string; txid: string }) {
    const tx = await TransactionStorage.collection.countDocuments({ txid });
    if (tx === 0) {
      throw new Error(`No such transaction ${txid}`);
    }

    let inputs = await CoinStorage.collection
      .find({
        chain,
        network,
        spentTxid: txid
      })
      .addCursorFlag('noCursorTimeout', true)
      .toArray();

    const outputs = await CoinStorage.collection
      .find({
        chain,
        network,
        mintTxid: txid
      })
      .addCursorFlag('noCursorTimeout', true)
      .toArray();

    return {
      inputs: inputs.map(input => CoinStorage._apiTransform(input, { object: true })),
      outputs: outputs.map(output => CoinStorage._apiTransform(output, { object: true }))
    };
  }

  async getDailyTransactions(params: CSP.DailyTransactionsParams) {
    const { chain, network, startDate, endDate } = params;
    const formatDate = (d: Date) => new Date(d.toISOString().split('T')[0]);
    const todayTruncatedUTC = formatDate(new Date());
    let oneMonth = new Date(todayTruncatedUTC);
    oneMonth.setDate(todayTruncatedUTC.getDate() - 30);
    oneMonth = formatDate(oneMonth);

    const isValidDate = (d: string) => {
      return new Date(d).toString() !== 'Invalid Date';
    };
    const start = startDate && isValidDate(startDate) ? new Date(startDate) : oneMonth;
    const end = endDate && isValidDate(endDate) ? formatDate(new Date(endDate)) : todayTruncatedUTC;
    const results = await BitcoinBlockStorage.collection
      .aggregate<{
        date: string;
        transactionCount: number;
      }>([
        {
          $match: {
            chain,
            network,
            timeNormalized: {
              $gte: start,
              $lt: end
            }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$timeNormalized'
              }
            },
            transactionCount: {
              $sum: '$transactionCount'
            }
          }
        },
        {
          $project: {
            _id: 0,
            date: '$_id',
            transactionCount: '$transactionCount'
          }
        },
        {
          $sort: {
            date: 1
          }
        }
      ])
      .toArray();
    return {
      chain,
      network,
      results
    };
  }

  async getLocalTip({ chain, network }) {
    return BitcoinBlockStorage.getLocalTip({ chain, network });
  }

  /**
   * Get a series of hashes that come before a given height, or the 30 most recent hashes
   *
   * @returns Array<string>
   */
  async getLocatorHashes(params) {
    const { chain, network, startHeight, endHeight } = params;
    const query =
      startHeight && endHeight
        ? {
            processed: true,
            chain,
            network,
            height: { $gt: startHeight, $lt: endHeight }
          }
        : {
            processed: true,
            chain,
            network
          };
    const locatorBlocks = await BitcoinBlockStorage.collection
      .find(query, { sort: { height: -1 }, limit: 30 })
      .addCursorFlag('noCursorTimeout', true)
      .toArray();
    if (locatorBlocks.length < 2) {
      return [Array(65).join('0')];
    }
    return locatorBlocks.map(block => block.hash);
  }

  public isValid(params) {
    const { input } = params;

    if (this.isValidBlockOrTx(input)) {
      return { isValid: true, type: 'blockOrTx' };
    } else if (this.isValidAddress(params)) {
      return { isValid: true, type: 'addr' };
    } else if (this.isValidBlockIndex(input)) {
      return { isValid: true, type: 'blockOrTx' };
    } else {
      return { isValid: false, type: 'invalid' };
    }
  }

  private isValidBlockOrTx(inputValue: string): boolean {
    const regexp = /^[0-9a-fA-F]{64}$/;
    if (regexp.test(inputValue)) {
      return true;
    } else {
      return false;
    }
  }

  private isValidAddress(params): boolean {
    const { chain, network, input } = params;
    const addr = this.extractAddress(input);
    return !!Validation.validateAddress(chain, network, addr);
  }

  private isValidBlockIndex(inputValue): boolean {
    return isFinite(inputValue);
  }

  private extractAddress(address: string): string {
    const extractedAddress = address.replace(/^(bitcoincash:|bchtest:|bitcoin:)/i, '').replace(/\?.*/, '');
    return extractedAddress || address;
  }
}
