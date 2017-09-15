var Common = require('./common');
var LRU = require('lru-cache');
var async = require('async');
var BigNumber = require('bignumber.js');

function StatisticController(options) {

    this.node = options.node;

    /**
     *
     * @type {Common}
     */
    this.common = new Common({log: this.node.log});
    this.lastTipHeight = 0;
    this.lastTipInProcess = false;
    this.lastTipTimeout = false;
    this.lastCheckedBlock = 0;
    this.totalSupplyBN = new BigNumber(0);

    this.initWatcher();

}


StatisticController.prototype.initWatcher = function() {

    if (this.node.services.atbcoind.height) {
        this._rapidProtectedUpdateTip(this.node.services.atbcoind.height);
    }

    this.node.services.atbcoind.on('tip', this._rapidProtectedUpdateTip.bind(this));

};

StatisticController.prototype.availableSupply = function(req, res) {

    var total_supply = this.totalSupplyBN ? this.totalSupplyBN.dividedBy(1e8).toString(10) : 0;

    if (req.query.format === 'plaintext') {
        return res.send(total_supply);
    }

    return res.jsonp({
        total_supply: total_supply
    });

};

/**
 *
 * @param {number} height
 * @returns {boolean}
 * @private
 */
StatisticController.prototype._rapidProtectedUpdateTip = function(height) {

    var self = this;

    if (height > this.lastTipHeight) {
        this.lastTipHeight = height;
    }

    if (this.lastTipInProcess) {
        return false;
    }

    this.lastTipInProcess = true;

    self.common.log.info('[STATISTIC] start upd from', self.lastCheckedBlock + 1 , 'to', height);

    return this._processBlocksToHeight(height, function (err) {

        self.lastTipInProcess = false;

        if (err) {
            return false;
        }

        self.common.log.info('[STATISTIC] updated to', height);

        if (self.lastTipHeight !== height) {
            self._rapidProtectedUpdateTip(self.lastTipHeight);
        }

    });

};

/**
 *
 * @param {Number} height
 * @param {Function} next
 * @private
 */
StatisticController.prototype._processBlocksToHeight = function(height, next) {

    var self = this,
        blocks = [],
        sum = new BigNumber(0);

    for (var i = self.lastCheckedBlock + 1; i <= height; i++) {
        blocks.push(i);
    }

    return async.eachSeries(blocks, function (blockHeight, callback) {

        var dataFlow = {
            block: null,
            rewardTx: null
        };

        return async.waterfall([function (callback) {

            return self.node.getBlockOverview(blockHeight, function(err, block) {

                if(err) {
                    return callback(err);
                }

                dataFlow.block = block;

                return callback();
            });
        }, function (callback) {

            var block = dataFlow.block,
                txRewardHash;

            if (block.flags === 'proof-of-work') {
                txRewardHash = block.txids[0];
            } else {
                txRewardHash = block.txids[1];
            }

            return self.node.getChainTransaction(txRewardHash, function(err, tx) {

                if (err) {
                    return callback(err);
                }

                if (block.flags === 'proof-of-work') {

                    tx.vout.forEach(function(vout) {
                        sum = sum.plus(vout.valueSat);
                    });

                } else {

                    tx.vout.forEach(function(vout) {
                        sum = sum.plus(vout.valueSat);
                    });

                    tx.vin.forEach(function(vin) {
                        sum = sum.minus(vin.valueSat);
                    });

                }

                return callback();

            });

        }], function (err) {

            if (err) {
                return callback(err)
            }

            self.lastCheckedBlock = blockHeight;

            return callback();

        });

    }, function (err)  {

        if (err) {
            return next(err)
        }

        self.totalSupplyBN = self.totalSupplyBN.plus(sum);

        var a = self.totalSupplyBN.dividedBy(1e8);

        console.log('self.totalSupplyBN', self.totalSupplyBN.toString(10), a.toString(10));

        return next();

    });

};


module.exports = StatisticController;