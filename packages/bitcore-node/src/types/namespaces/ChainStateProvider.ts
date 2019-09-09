import { TransactionJSON } from '../Transaction';
import { IBlock } from '../../models/block';
import { Request, Response } from 'express';
import { ChainNetwork } from '../../types/ChainNetwork';
import { AuthheadJSON } from '../Authhead';
import { CoinListingJSON } from '../Coin';
import { DailyTransactionsJSON } from '../stats';
import { StreamingFindOptions } from '../Query';
import { ICoin } from '../../models/coin';

export declare namespace CSP {

  export type StreamAddressUtxosArgs = {
    unspent: boolean;
  };

  export type GetBlockArgs = { limit: null | number };

  export type PubKey = { pubKey: string };

  export type GetBalanceForAddressParams = ChainNetwork & {
    address: string;
  };

  export type GetBlockParams = ChainNetwork & {
    blockId?: string;
    sinceBlock?: number | string;
    args?: Partial<{ startDate: Date; endDate: Date; date: Date } & StreamingFindOptions<IBlock>>;
  };
  export type StreamBlocksParams = ChainNetwork & {
    blockId?: string;
    sinceBlock: number | string;
    args?: Partial<{ startDate: Date; endDate: Date; date: Date } & StreamingFindOptions<IBlock>>;
    req: Request;
    res: Response;
  };
  export type GetEstimateSmartFeeParams = ChainNetwork & {
    target: number;
  };
  export type BroadcastTransactionParams = ChainNetwork & {
    rawTx: string;
  };

  export type StreamAddressUtxosParams = ChainNetwork & {
    address: string;
    req: Request;
    res: Response;
    args: Partial<StreamAddressUtxosArgs & StreamingFindOptions<ICoin>>;
  };

  export type StreamTransactionsParams = ChainNetwork & {
    req: Request;
    res: Response;
    args: any;
  };
  export type StreamTransactionParams = ChainNetwork & {
    txId: string;
  };

  export type Provider<T> = { get(params: { chain: string }): T };
  export type ChainStateProvider = Provider<IChainStateService> & IChainStateService;
  export interface IChainStateService {
    getBalanceForAddress(
      params: GetBalanceForAddressParams
    ): Promise<{ confirmed: number; unconfirmed: number; balance: number }>;
    getBlock(params: GetBlockParams): Promise<IBlock>;
    streamBlocks(params: StreamBlocksParams): any;
    getFee(params: GetEstimateSmartFeeParams): any;
    broadcastTransaction(params: BroadcastTransactionParams): Promise<any>;
    streamAddressUtxos(params: StreamAddressUtxosParams): any;
    streamAddressTransactions(params: StreamAddressUtxosParams): any;
    streamTransactions(params: StreamTransactionsParams): any;
    getAuthhead(params: StreamTransactionParams): Promise<AuthheadJSON | undefined>;
    getDailyTransactions(params: { chain: string; network: string }): Promise<DailyTransactionsJSON | undefined>;
    getTransaction(params: StreamTransactionParams): Promise<TransactionJSON | undefined>;
    getCoinsForTx(params: { chain: string; network: string; txid: string }): Promise<CoinListingJSON | undefined>;
    getLocalTip(params): Promise<IBlock | null>;
    getLocatorHashes(params): Promise<any>;
  }

  type ChainStateServices = { [key: string]: IChainStateService };
}
