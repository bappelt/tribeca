/// <reference path="../utils.ts" />
/// <reference path="../../common/models.ts" />
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var Models = require("../../common/models");
var Utils = require("../utils");
var Interfaces = require("../interfaces");
var CryptsyExchange = require("./cryptsy-api");
var uuid = require('node-uuid');
var CryptsyOrderGateway = (function () {
    function CryptsyOrderGateway() {
        var _this = this;
        this.OrderUpdate = new Utils.Evt();
        this.ConnectChanged = new Utils.Evt();
        this.cancelsByClientOrderId = true;
        this.generateClientOrderId = function () {
            return uuid.v1();
        };
        setTimeout(function () { return _this.ConnectChanged.trigger(Models.ConnectivityStatus.Connected); }, 500);
    }
    CryptsyOrderGateway.prototype.sendOrder = function (order) {
        var _this = this;
        setTimeout(function () { return _this.trigger(order.orderId, Models.OrderStatus.Working, order); }, 10);
        return new Models.OrderGatewayActionReport(Utils.date());
    };
    CryptsyOrderGateway.prototype.cancelOrder = function (cancel) {
        var _this = this;
        setTimeout(function () { return _this.trigger(cancel.clientOrderId, Models.OrderStatus.Complete); }, 10);
        return new Models.OrderGatewayActionReport(Utils.date());
    };
    CryptsyOrderGateway.prototype.replaceOrder = function (replace) {
        this.cancelOrder(new Models.BrokeredCancel(replace.origOrderId, replace.orderId, replace.side, replace.exchangeId));
        return this.sendOrder(replace);
    };
    CryptsyOrderGateway.prototype.trigger = function (orderId, status, order) {
        var _this = this;
        if (order === void 0) { order = null; }
        var rpt = {
            orderId: orderId,
            orderStatus: status,
            time: Utils.date()
        };
        this.OrderUpdate.trigger(rpt);
        if (status === Models.OrderStatus.Working) {
            var rpt = {
                orderId: orderId,
                orderStatus: status,
                time: Utils.date(),
                lastQuantity: order.quantity,
                lastPrice: order.price
            };
            setTimeout(function () { return _this.OrderUpdate.trigger(rpt); }, 1000);
        }
    };
    return CryptsyOrderGateway;
})();
exports.CryptsyOrderGateway = CryptsyOrderGateway;
var CryptsyPositionGateway = (function () {
    function CryptsyPositionGateway(apiClient) {
        var _this = this;
        this.PositionUpdate = new Utils.Evt();
        this.apiClient = apiClient;
        setInterval(function () { return _this.getCurrencyPositions(); }, 5000);
    }
    CryptsyPositionGateway.prototype.getCurrencyPositions = function () {
        var _this = this;
        var positions = this.apiClient.getPositions(function (positions) {
            for (var currency in Models.Currency) {
                if (Models.Currency.hasOwnProperty(currency) && !/^\d+$/.test(currency)) {
                    var position = new Models.CurrencyPosition(positions[currency], 0, Models.Currency[currency]);
                    _this.PositionUpdate.trigger(position);
                }
            }
        });
    };
    return CryptsyPositionGateway;
})();
exports.CryptsyPositionGateway = CryptsyPositionGateway;
var CryptsyMarketDataGateway = (function () {
    function CryptsyMarketDataGateway() {
        var _this = this;
        this.MarketData = new Utils.Evt();
        this.ConnectChanged = new Utils.Evt();
        this.MarketTrade = new Utils.Evt();
        this.genMarketTrade = function () { return new Models.GatewayMarketTrade(Math.random(), Math.random(), Utils.date(), false, Models.Side.Bid); };
        this.genSingleLevel = function () { return new Models.MarketSide(200 + 100 * Math.random(), Math.random()); };
        this.generateMarketData = function () {
            var genSide = function () {
                var s = [];
                for (var x = 0; x < 5; x++) {
                    s.push(_this.genSingleLevel());
                }
                return s;
            };
            return new Models.Market(genSide(), genSide(), Utils.date());
        };
        setTimeout(function () { return _this.ConnectChanged.trigger(Models.ConnectivityStatus.Connected); }, 500);
        setInterval(function () { return _this.MarketData.trigger(_this.generateMarketData()); }, 5000);
        setInterval(function () { return _this.MarketTrade.trigger(_this.genMarketTrade()); }, 15000);
    }
    return CryptsyMarketDataGateway;
})();
exports.CryptsyMarketDataGateway = CryptsyMarketDataGateway;
var CryptsyGatewayDetails = (function () {
    function CryptsyGatewayDetails() {
    }
    Object.defineProperty(CryptsyGatewayDetails.prototype, "hasSelfTradePrevention", {
        get: function () {
            return false;
        },
        enumerable: true,
        configurable: true
    });
    CryptsyGatewayDetails.prototype.name = function () {
        return "Cryptsy";
    };
    CryptsyGatewayDetails.prototype.makeFee = function () {
        return 0;
    };
    CryptsyGatewayDetails.prototype.takeFee = function () {
        return 0;
    };
    CryptsyGatewayDetails.prototype.exchange = function () {
        return Models.Exchange.Cryptsy;
    };
    Object.defineProperty(CryptsyGatewayDetails.prototype, "supportedCurrencyPairs", {
        get: function () {
            return CryptsyGatewayDetails.AllPairs;
        },
        enumerable: true,
        configurable: true
    });
    CryptsyGatewayDetails.AllPairs = [
        new Models.CurrencyPair(Models.Currency.BTC, Models.Currency.USD),
        new Models.CurrencyPair(Models.Currency.BTC, Models.Currency.EUR),
        new Models.CurrencyPair(Models.Currency.BTC, Models.Currency.GBP)
    ];
    return CryptsyGatewayDetails;
})();
var Cryptsy = (function (_super) {
    __extends(Cryptsy, _super);
    function Cryptsy(config) {
        var apiClient = new CryptsyExchange.CryptsyApiClient(config);
        _super.call(this, new CryptsyMarketDataGateway(), new CryptsyOrderGateway(), new CryptsyPositionGateway(apiClient), new CryptsyGatewayDetails());
    }
    return Cryptsy;
})(Interfaces.CombinedGateway);
exports.Cryptsy = Cryptsy;
