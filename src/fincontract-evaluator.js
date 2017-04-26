import {Gateway} from '../contracts/bin/gateway';
import {Visitor, CollectingVisitor} from './fincontract-visitor';
import Sender from './tx-sender';
import {currencyCount} from './currency';

const log = require('minilog')('eval');
require('minilog').enable();

const makeArray = (size, obj) => Array.apply(null, Array(size)).map(() => obj);
const flatten = arr => arr.reduce((a, b) => a.concat(b));
const cross = (arr1, arr2) => arr1.map(a => arr2.map(b => [a, b]));
const zip = (a1, a2) => a1.map((x, i) => [x, a2[i]]);
const tupleMUL = i => i[0] * i[1];

/*
 * TODO
   - ScaleObs ranges should be applied here
   - pull currency exchange rates data and calculate single USD value
   - return a dictionary
 */

const makeEstimationEvaluators = () => ({
  if: () => ([iA, iB]) => [Math.min(iA[0], iB[0]), Math.max(iA[1], iB[1])],
  or: () => ([iA, iB]) => [Math.min(iA[0], iB[0]), Math.max(iA[1], iB[1])],
  and: () => ([iA, iB]) => [iA[0] + iB[0], iA[1] + iB[1]],
  give: () => i => [-i[1], -i[0]],
  scale: node => i => [i[0] * node.scale, i[1] * node.scale],
  scaleObs: node => i => {
    // Throw in the futures if range is not defined!
    const range = node.range || [1, 1.2];
    const a = flatten(cross(range, i)).map(tupleMUL);
    return [Math.min(...a), Math.max(...a)];
  },
  timebound: node => i => {
    return (node.upperBound < Math.round(Date.now() / 1000)) ? [0, 0] : i;
  },
  zero: () => () => makeArray(currencyCount, [0, 0]),
  one: node => () => {
    const arr = makeArray(currencyCount, [0, 0]);
    arr[node.currency] = [1, 1];
    return arr;
  }
});

const makeDirectEvaluators = web3 => {
  const gateway = Gateway(web3);
  const evaluator = makeEstimationEvaluators();
  evaluator.if = node => ([iA, iB]) => {
    const bool = gateway.at(node.gatewayAddress).getValue.call();
    return bool ? iA : iB;
  };
  evaluator.scaleObs = node => i => {
    const scale = gateway.at(node.gatewayAddress).getValue.call();
    return [i[0] * scale, i[1] * scale];
  };
  return evaluator;
};

class EvaluatorVisitor extends Visitor {

  constructor(nodeEvaluators) {
    super();
    this.nodeEvaluators = nodeEvaluators;
  }

  processAndNode(node, left, right) {
    return zip(left, right).map(this.nodeEvaluators.and(node));
  }

  processIfNode(node, left, right) {
    return zip(left, right).map(this.nodeEvaluators.if(node));
  }

  processOrNode(node, left, right) {
    return zip(left, right).map(this.nodeEvaluators.or(node));
  }

  processTimeboundNode(node, child) {
    return child.map(this.nodeEvaluators.timebound(node));
  }

  processGiveNode(node, child) {
    return child.map(this.nodeEvaluators.give(node));
  }

  processScaleObsNode(node, child) {
    return child.map(this.nodeEvaluators.scaleObs(node));
  }

  processScaleNode(node, child) {
    return child.map(this.nodeEvaluators.scale(node));
  }

  processOneNode(node) {
    return this.nodeEvaluators.one(node).call();
  }

  processZeroNode(node) {
    return this.nodeEvaluators.zero(node).call();
  }

  processUnknownNode() {
    throw new Error('Unknown case during evaluation');
  }

}

class GatewayVisitor extends CollectingVisitor {

  constructor(web3) {
    super();
    this.web3 = web3;
  }

  updateAllGateways(node) {
    return Promise.all(this.visit(node));
  }

  updateGateway(address, type) {
    if (!parseInt(address, 16)) {
      throw new Error(`Gateway's address was 0x0`);
    }
    const gateway = Gateway(this.web3).at(address);
    return new Sender(gateway, this.web3)
      .send('update', [])
      .watch({block: 'latest'}, () => {
        log.info('Finished updating ' + type + ' gateway at: ' + address);
      });
  }

  processIfNode(node, left, right) {
    const self = this.updateGateway(node.gatewayAddress, 'If');
    return [...left, ...right, self];
  }

  processScaleObsNode(node, child) {
    const self = this.updateGateway(node.gatewayAddress, 'ScaleObs');
    return [...child, self];
  }
}

export default class Evaluator {

  constructor(web3) {
    this.web3 = web3;
  }

  async evaluate(fincontract, options) {
    const root = fincontract.rootDescription;
    if (options.method === 'direct') {
      const evaluators = makeDirectEvaluators(this.web3);
      const ev = new EvaluatorVisitor(evaluators);
      const gv = new GatewayVisitor(this.web3);
      await gv.updateAllGateways(root);
      return Promise.resolve(ev.visit(root));
    } else if (options.method === 'estimate') {
      const evaluators = makeEstimationEvaluators();
      const ev = new EvaluatorVisitor(evaluators);
      return Promise.resolve(ev.visit(root));
    }
    return Promise.reject(Error('Wrong evaluation method'));
  }
}
