import { IBtcBlock } from '../../models/block';
import { Request, Response } from 'express';
import { ChainNetwork } from '../../types/ChainNetwork';
import { StreamingFindOptions } from '../../services/storage';
import { ITransaction } from '../../models/transaction';
import { AuthheadJSON } from '../Authhead';
import { CoinListingJSON } from '../Coin';
import { DailyTransactionsJSON } from '../stats';
import { TransactionJSON } from '../Transaction';
import { ICoin } from '../../models/coin';
import { IBlock } from '../../models/baseBlock';
export declare namespace CSP {
  export type StreamWalletTransactionsArgs = {
    startBlock: number;
    endBlock: number;
    startDate: string;
    endDate: string;
    includeMempool: boolean;
  } & StreamingFindOptions<ITransaction>;

  export type StreamAddressUtxosArgs = {
    unspent: boolean;
  };

  export type GetBlockArgs = { limit: null | number };

  export type PubKey = { pubKey: string };

  export type GetBalanceForAddressParams = ChainNetwork & {
    address: string;
    args: any;
  };
  export type GetBalanceForAddressesParams = ChainNetwork & {
    address: string[];
  };

  export type GetBlockParams = ChainNetwork & {
    blockId?: string;
    sinceBlock?: number | string;
    args?: Partial<{ startDate: Date; endDate: Date; date: Date } & StreamingFindOptions<IBtcBlock>>;
  };

  export type GetBlockBeforeTimeParams = ChainNetwork & {
    time?: Date | string;
  };

  export type StreamBlocksParams = ChainNetwork & {
    blockId?: string;
    sinceBlock: number | string;
    args?: Partial<{ startDate: Date; endDate: Date; date: Date } & StreamingFindOptions<IBtcBlock>>;
    req: Request;
    res: Response;
  };
  export type GetEstimateSmartFeeParams = ChainNetwork & {
    target: number;
  };
  export type BroadcastTransactionParams = ChainNetwork & {
    rawTx: string | Array<string>;
  };

  export type StreamAddressUtxosParams = ChainNetwork & {
    address: string;
    req: Request;
    res: Response;
    args: Partial<StreamAddressUtxosArgs & StreamingFindOptions<ICoin> & any>;
  };
  
  export type StreamAddressesUtxosParams = ChainNetwork & {
    address: string[];
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

  export type isValidParams = ChainNetwork & {
    input: string;
  };

  export type DailyTransactionsParams = ChainNetwork & {
    startDate: string;
    endDate: string;
  };

  export type GetCoinsForTxParams = { chain: string; network: string; txid: string };

  export type Provider<T> = { get(params: { chain: string }): T };
  export type ChainStateProvider = Provider<IChainStateService> & IChainStateService;
  export interface IChainStateService {
    getBalanceForAddress(
      params: GetBalanceForAddressParams
    ): Promise<{ confirmed: number; unconfirmed: number; balance: number }>;
    getBalanceForAddresses(
      params: GetBalanceForAddressesParams
    ): Promise<{ [address: string] : { confirmed: number; unconfirmed: number; balance: number } }>;
    getBlock(params: GetBlockParams): Promise<IBlock>;
    getBlockBeforeTime(params: GetBlockBeforeTimeParams): Promise<IBlock>;
    streamBlocks(params: StreamBlocksParams): any;
    getFee(params: GetEstimateSmartFeeParams): any;
    broadcastTransaction(params: BroadcastTransactionParams): Promise<any>;
    streamAddressUtxos(params: StreamAddressUtxosParams): any;
    streamAddressesUtxos(params: StreamAddressesUtxosParams): any;
    streamAddressTransactions(params: StreamAddressUtxosParams): any;
    streamAddressesTransactions(params: StreamAddressesUtxosParams): any;
    streamTransactions(params: StreamTransactionsParams): any;
    getAuthhead(params: StreamTransactionParams): Promise<AuthheadJSON | undefined>;
    getDailyTransactions(params: DailyTransactionsParams): Promise<DailyTransactionsJSON>;
    getTransaction(params: StreamTransactionParams): Promise<TransactionJSON | undefined>;
    getCoinsForTx(params: { chain: string; network: string; txid: string }): Promise<CoinListingJSON>;
    getLocalTip(params): Promise<IBlock | null>;
    getLocatorHashes(params): Promise<any>;
    isValid(params: isValidParams): { isValid: boolean; type: string };
  }

  type ChainStateServices = { [key: string]: IChainStateService };
}
