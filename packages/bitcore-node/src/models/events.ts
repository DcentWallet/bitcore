import { ITransaction } from './transaction';
import { IBlock } from '../types/Block';
import { ICoin } from './coin';

export namespace IEvent {
  export type BlockEvent = IBlock;
  export type TxEvent = ITransaction;
  export type CoinEvent = { coin: Partial<ICoin>; address: string };
}
interface IEvent {
  payload: IEvent.BlockEvent | IEvent.TxEvent | IEvent.CoinEvent;
  type: 'block' | 'tx' | 'coin';
  emitTime: Date;
}
