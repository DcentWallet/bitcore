import { CSP } from '../../types/namespaces/ChainStateProvider';
import { Chain } from '../../types/ChainNetwork';

const services: CSP.ChainStateServices = {};

class ChainStateProxy implements CSP.ChainStateProvider {
  get({ chain }: Chain) {
    if (services[chain] == undefined) {
      throw new Error(`Chain ${chain} doesn't have a ChainStateProvider registered`);
    }
    return services[chain];
  }

  streamAddressUtxos(params: CSP.StreamAddressUtxosParams) {
    return this.get(params).streamAddressUtxos(params);
  }

  streamAddressesUtxos(params: CSP.StreamAddressesUtxosParams) {
    return this.get(params).streamAddressesUtxos(params);
  }

  streamAddressTransactions(params: CSP.StreamAddressUtxosParams) {
    return this.get(params).streamAddressTransactions(params);
  }
  
  streamAddressesTransactions(params: CSP.StreamAddressesUtxosParams) {
    return this.get(params).streamAddressesTransactions(params);
  }

  async getBalanceForAddress(params: CSP.GetBalanceForAddressParams) {
    return this.get(params).getBalanceForAddress(params);
  }

  async getBalanceForAddresses(params: CSP.GetBalanceForAddressesParams) {
    return this.get(params).getBalanceForAddresses(params);
  }

  async getBlock(params: CSP.GetBlockParams) {
    return this.get(params).getBlock(params);
  }

  async getBlockBeforeTime(params: CSP.GetBlockBeforeTimeParams) {
    return this.get(params).getBlockBeforeTime(params);
  }

  streamBlocks(params: CSP.StreamBlocksParams) {
    return this.get(params).streamBlocks(params);
  }

  streamTransactions(params: CSP.StreamTransactionsParams) {
    return this.get(params).streamTransactions(params);
  }

  getAuthhead(params: CSP.StreamTransactionParams) {
    return this.get(params).getAuthhead(params);
  }

  getDailyTransactions(params: CSP.DailyTransactionsParams) {
    return this.get(params).getDailyTransactions(params);
  }

  getTransaction(params: CSP.StreamTransactionParams) {
    return this.get(params).getTransaction(params);
  }

  async getFee(params: CSP.GetEstimateSmartFeeParams) {
    return this.get(params).getFee(params);
  }

  async broadcastTransaction(params: CSP.BroadcastTransactionParams) {
    return this.get(params).broadcastTransaction(params);
  }

  registerService(currency: string, service: CSP.IChainStateService) {
    services[currency] = service;
  }

  async getCoinsForTx(params: { chain: string; network: string; txid: string }) {
    return this.get(params).getCoinsForTx(params);
  }

  async getLocalTip(params) {
    return this.get(params).getLocalTip(params);
  }

  async getLocatorHashes(params) {
    return this.get(params).getLocatorHashes(params);
  }

  isValid(params) {
    return this.get(params).isValid(params);
  }
}
export let ChainStateProvider = new ChainStateProxy();
