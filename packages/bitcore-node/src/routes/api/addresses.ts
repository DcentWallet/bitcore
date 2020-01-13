import express = require('express');
const router = express.Router({ mergeParams: true });
import { ChainStateProvider } from '../../providers/chain-state';

router.get('/:addresses/txs',  function(req, res) {
  let { alladdress, chain, network } = req.params;
  let { unspent, limit = 10, since, offset, pagesize } = req.query;
  let address = alladdress.split('|')
  let payload = {
    chain,
    network,
    address,
    req,
    res,
    args: { unspent, limit, since, offset, pagesize }
  };
  ChainStateProvider.streamAddressesTransactions(payload);
});

router.get('/:addresses',  function(req, res) {
  let { alladdress, chain, network } = req.params;
  let { unspent, limit = 10, since } = req.query;
  let address = alladdress.split('|')
  let payload = {
    chain,
    network,
    address,
    req,
    res,
    args: { unspent, limit, since }
  };
  ChainStateProvider.streamAddressesUtxos(payload);
});

router.get('/:addresses/balance',  async function(req, res) {
  let { alladdress, chain, network } = req.params;
  let address = alladdress.split('|')
  try {
    let result = await ChainStateProvider.getBalanceForAddresses({
      chain,
      network,
      address
    });
    return res.send(result || []);
  } catch (err) {
    return res.status(500).send(err);
  }
});

module.exports = {
  router: router,
  path: '/addresses'
};
