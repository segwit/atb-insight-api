'use strict';

var _ = require('lodash');
var async = require('async');
var Common = require('./common');

function UtilsController(node, options) {
  this.node = node;
  this.common = new Common({log: this.node.log});
  this.minEstimateFee = options.minEstimateFee;
}

UtilsController.prototype.estimateFee = function(req, res) {
  var self = this;
  var args = req.query.nbBlocks || '2';
  var nbBlocks = args.split(',');

  async.map(nbBlocks, function(n, next) {
    var num = parseInt(n);
    // Insight and ATBcoin JSON-RPC return atbcoin for this value (instead of satoshis).
    self.node.services.atbcoind.estimateFee(num, function(err, fee) {
      if (err) {
        return next(err);
      }

      if (fee === -1 && self.minEstimateFee) {
         fee = self.minEstimateFee;
      }

      next(null, [num, fee]);
    });
  }, function(err, result) {
    if (err) {
      return self.common.handleErrors(err, res);
    }
    res.jsonp(_.zipObject(result));
  });

};

module.exports = UtilsController;
