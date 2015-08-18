/// <reference path="../utils.ts" />
/// <reference path="../../common/models.ts" />

import Models = require("../../common/models");
import Config = require("../config");
import Utils = require("../utils");
import Interfaces = require("../interfaces");
import CryptsyExchange = require("./cryptsy-api");
var uuid = require('node-uuid');

export class CryptsyOrderGateway implements Interfaces.IOrderEntryGateway {
    OrderUpdate = new Utils.Evt<Models.OrderStatusReport>();
    ConnectChanged = new Utils.Evt<Models.ConnectivityStatus>();

    public cancelsByClientOrderId = true;

    generateClientOrderId = (): string => {
        return uuid.v1();
    }

    sendOrder(order: Models.BrokeredOrder): Models.OrderGatewayActionReport {
        setTimeout(() => this.trigger(order.orderId, Models.OrderStatus.Working, order), 10);
        return new Models.OrderGatewayActionReport(Utils.date());
    }

    cancelOrder(cancel: Models.BrokeredCancel): Models.OrderGatewayActionReport {
        setTimeout(() => this.trigger(cancel.clientOrderId, Models.OrderStatus.Complete), 10);
        return new Models.OrderGatewayActionReport(Utils.date());
    }

    replaceOrder(replace: Models.BrokeredReplace): Models.OrderGatewayActionReport {
        this.cancelOrder(new Models.BrokeredCancel(replace.origOrderId, replace.orderId, replace.side, replace.exchangeId));
        return this.sendOrder(replace);
    }

    private trigger(orderId: string, status: Models.OrderStatus, order: Models.BrokeredOrder = null) {
        var rpt: Models.OrderStatusReport = {
            orderId: orderId,
            orderStatus: status,
            time: Utils.date()
        };
        this.OrderUpdate.trigger(rpt);

        if (status === Models.OrderStatus.Working) {
            var rpt: Models.OrderStatusReport = {
                orderId: orderId,
                orderStatus: status,
                time: Utils.date(),
                lastQuantity: order.quantity,
                lastPrice: order.price
            };
            setTimeout(() => this.OrderUpdate.trigger(rpt), 1000);
        }
    }

    constructor() {
        setTimeout(() => this.ConnectChanged.trigger(Models.ConnectivityStatus.Connected), 500);
    }
}

export class CryptsyPositionGateway implements Interfaces.IPositionGateway {
    PositionUpdate = new Utils.Evt<Models.CurrencyPosition>();
    apiClient : CryptsyExchange.CryptsyApiClient;

    getCurrencyPositions() {
      var positions = this.apiClient.getPositions( (positions) => {
        for(var currency in Models.Currency) {
          if (Models.Currency.hasOwnProperty(currency) && !/^\d+$/.test(currency)) {
          var position = new Models.CurrencyPosition(positions[currency], 0, Models.Currency[currency]);
          this.PositionUpdate.trigger(position);
        }
        }
      });
    }

    constructor(apiClient : CryptsyExchange.CryptsyApiClient) {
        this.apiClient = apiClient;
        setInterval(() => this.getCurrencyPositions(), 5000);
    }

}

export class CryptsyMarketDataGateway implements Interfaces.IMarketDataGateway {
    MarketData = new Utils.Evt<Models.Market>();
    ConnectChanged = new Utils.Evt<Models.ConnectivityStatus>();
    MarketTrade = new Utils.Evt<Models.GatewayMarketTrade>();

    constructor() {
        setTimeout(() => this.ConnectChanged.trigger(Models.ConnectivityStatus.Connected), 500);
        setInterval(() => this.MarketData.trigger(this.generateMarketData()), 5000);
        setInterval(() => this.MarketTrade.trigger(this.genMarketTrade()), 15000);
    }

    private genMarketTrade = () => new Models.GatewayMarketTrade(Math.random(), Math.random(), Utils.date(), false, Models.Side.Bid);

    private genSingleLevel = () => new Models.MarketSide(200 + 100 * Math.random(), Math.random());

    private generateMarketData = () => {
        var genSide = () => {
            var s = [];
            for (var x = 0; x < 5; x++) {
                s.push(this.genSingleLevel());
            }
            return s;
        };
        return new Models.Market(genSide(), genSide(), Utils.date());
    };


}

class CryptsyGatewayDetails implements Interfaces.IExchangeDetailsGateway {
    public get hasSelfTradePrevention() {
        return false;
    }

    name(): string {
        return "Cryptsy";
    }

    makeFee(): number {
        return 0;
    }

    takeFee(): number {
        return 0;
    }

    exchange(): Models.Exchange {
        return Models.Exchange.Cryptsy;
    }

    private static AllPairs = [
        new Models.CurrencyPair(Models.Currency.BTC, Models.Currency.USD),
        new Models.CurrencyPair(Models.Currency.BTC, Models.Currency.EUR),
        new Models.CurrencyPair(Models.Currency.BTC, Models.Currency.GBP)
    ];
    public get supportedCurrencyPairs() {
        return CryptsyGatewayDetails.AllPairs;
    }
}

export class Cryptsy extends Interfaces.CombinedGateway {
    constructor(config: Config.IConfigProvider) {

        var apiClient = new CryptsyExchange.CryptsyApiClient(config);


        super(new CryptsyMarketDataGateway(), new CryptsyOrderGateway(), new CryptsyPositionGateway(apiClient), new CryptsyGatewayDetails());
    }
}
