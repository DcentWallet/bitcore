import { TransformOptions } from '../types/TransformOptions';
import { BaseModel, MongoBound } from './base';
import { IBlock } from '../types/Block';
import { StorageService, secondaryPreferrence  } from '../services/storage';

export type IBlock = {
  chain: string;
  confirmations?: number;
  network: string;
  height: number;
  hash: string;
  time: Date;
  timeNormalized: Date;
  previousBlockHash: string;
  nextBlockHash: string;
  transactionCount: number;
  size: number;
  reward: number;
  processed: boolean;
};

export abstract class BaseBlock<T extends IBlock> extends BaseModel<T> {
  constructor(storage?: StorageService) {
    super('blocks', storage);
  }

  allowedPaging = [
    {
      key: 'height' as 'height',
      type: 'number' as 'number'
    }
  ];

  async onConnect() {
    this.collection.createIndex({ hash: 1 }, { background: true });
    this.collection.createIndex({ chain: 1, network: 1, processed: 1, height: -1 }, { background: true });
    this.collection.createIndex({ chain: 1, network: 1, timeNormalized: 1 }, { background: true });
    this.collection.createIndex({ previousBlockHash: 1 }, { background: true });
  }

  getPoolInfo(coinbase: string) {
    //TODO need to make this actually parse the coinbase input and map to miner strings
    // also should go somewhere else
    return coinbase;
  }

  async getLocalTip({ chain, network }) {
    const tip = await this.collection.find({ chain, network, processed: true }, { limit: 1, sort: { height: -1 }, readPreference: secondaryPreferrence })
      .toArray();
    return tip.length > 0 ? tip[0] as IBlock : null;
  }

  abstract _apiTransform(block: T | Partial<MongoBound<T>>, options?: TransformOptions): any;
}
