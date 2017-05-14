'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _txSender = require('./tx-sender');

var _txSender2 = _interopRequireDefault(_txSender);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const log = require('minilog')('example');
require('minilog').enable();

const short = hash => hash.substring(0, 8);

/**
 * Examples class is meant to deploy some of the tests defined in
 * {@link FincontractMarketplace} as well as assign Gateways to global values.
 * It's solely for testing purposes and should be removed once the project is
 * released.
 */
class Examples {

  /** @private */
  static get AllExamples() {
    return ['simpleTest', 'complexScaleObsTest', 'timeboundTest', 'setGateways', 'resetGateways'];
  }

  /**
   * Constucts the {@link Examples} object that allows for deployment
   * of predefined tests
   * @param {FincontractMarketplace} marketplace a Fincontracts smart contract instance
   * @param {Gateway} gatewaybool a connected GatewayBool instance
   * @param {Gateway} gatewayint a connected GatewayInteger instance
   * @param {Web3} web3 a web3 instance connected to Ethereum node
   */
  constructor(marketplace, gatewaybool, gatewayint, web3) {
    /** @private */
    this.marketplace = marketplace;
    /** @private */
    this.gatewaybool = gatewaybool;
    /** @private */
    this.gatewayint = gatewayint;
    /** @private */
    this.web3 = web3;
  }

  /**
   * Runs a predefined function on the blockchain.
   * See {@link FincontractMarketplace} for more details.
   * @param  {String} name name of the test to be dpeloyed
   * @return {Promise<String, Error>} promise that resolves to fincontract ID or
   *   nothing in case of setting/resetting gateways or it rejects with an Error
   *   in case the transaction has failed
   */
  runExample(name) {
    const noArgExamples = ['simpleTest', 'complexScaleObsTest'];
    if (noArgExamples.includes(name)) {
      return this.deployExample(name, [0x0]);
    } else if (name === 'timeboundTest') {
      const lowerBound = Math.round(Date.now() / 1000 + 120);
      const upperBound = Math.round(Date.now() / 1000 + 3600);
      return this.deployExample('timeboundTest', [0x0, lowerBound, upperBound]);
    } else if (['setGateways', 'resetGateways'].includes(name)) {
      const gwint = name === 'setGateways' ? this.gatewayint.address : 0;

      const gwbool = name === 'setGateways' ? this.gatewaybool.address : 0;

      return this.setGateways(gwint, gwbool);
    }
    return Promise.reject(Error('Example does not exist!'));
  }

  /**
   * Runs setGatewayI and setGatewayB {@link FincontractMarketplace} functions
   * with specified parameters as addresses to these gateways.
   * @param {String} gwint address of GatewayI
   * @param {String} gwbool address of GatewayB
   * @return {Promise<String, Error>} promise that resolve to nothing or rejects
   *   with an Error in case transaction has failed
   */
  setGateways(gwint, gwbool) {
    const p1 = this.deploy('setGatewayI', [gwint], { block: 'latest' }, () => log.info(`gatewayI set to ${short(gwint)}`));
    const p2 = this.deploy('setGatewayB', [gwbool], { block: 'latest' }, () => log.info(`gatewayB set to ${short(gwbool)}`));
    return Promise.all([p1, p2]);
  }

  /**
   * Sends a transaction with proper name and arguments and starts listening
   * to `CreatedBy` event with callback that returns the id of newly created
   * Fincontract. (See {@link Examples#deploy} for more details)
   * @param  {String} name name of the transaction
   * @param  {Array} args arguments of the transaction
   * @return {Promise<String, Error>} promise that resolves to id of the
   *   newly created fincontract or reject with an Error if it has failed
   */
  deployExample(name, args) {
    return this.deploy(name, args, { event: 'CreatedBy' }, logs => {
      const fctID = logs.args.fctId;
      const owner = logs.args.user;
      log.info(`Fincontract: ${short(fctID)}`);
      log.info(`Created for: ${short(owner)}`);
      return fctID;
    });
  }

  /**
   * Sends a transaction with proper name and arguments and starts watching for
   * an event to happen, which is defined by filter and then triggers the
   * the callback.
   * @param  {String} name name of the transaction
   * @param  {String} args arguments of the transaction
   * @param  {TransactionFilter} filter a filter object to listen for events
   * @param  {Function} callback a callback to be executed once event was triggered
   * @return {Promise<String,Error>} promise that resolves to the value returned
   *  by the callback
   */
  deploy(name, args, filter, callback) {
    const s = new _txSender2.default(this.marketplace, this.web3);
    return s.send(name, args).watch(filter, callback);
  }
}
exports.default = Examples;