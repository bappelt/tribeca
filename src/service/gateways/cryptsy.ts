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
    apiClient : CryptsyExchange.CryptsyApiClient;

    public cancelsByClientOrderId = false;

    generateClientOrderId = (): string => {
        return uuid.v1();
    }

    sendOrder(order: Models.BrokeredOrder): Models.OrderGatewayActionReport {
        this.apiClient.createOrder(order, (status) => {
          status.orderId = order.orderId;
          console.log("Order Creation Status Report: " + JSON.stringify(status));
          this.OrderUpdate.trigger(status);
          if(status.orderStatus != Models.OrderStatus.Rejected) {
            setTimeout(() => this.updateOrderStatus(status.exchangeId), 30 );
          }
        });
        return new Models.OrderGatewayActionReport(Utils.date());
    }

    updateOrderStatus(exchangeId: string) {
      this.apiClient.getOrderStatus(exchangeId, (orderStatusReport) => {
        this.OrderUpdate.trigger(orderStatusReport);
        if(orderStatusReport===Models.OrderStatus.Working || orderStatusReport===Models.OrderStatus.New) {
          setTimeout(() => this.updateOrderStatus(exchangeId), 30 );
        }
      });

    }

    cancelOrder(cancel: Models.BrokeredCancel): Models.OrderGatewayActionReport {
        this.apiClient.cancelOrder(cancel.exchangeId, (orderID) => {
          var rpt: Models.OrderStatusReport = {
              exchangeId: orderID,
              orderStatus: Models.OrderStatus.Cancelled,
              time: Utils.date()
          };
          this.OrderUpdate.trigger(rpt);
        });
        return new Models.OrderGatewayActionReport(Utils.date());
    }

    replaceOrder(replace: Models.BrokeredReplace): Models.OrderGatewayActionReport {
        this.cancelOrder(new Models.BrokeredCancel(replace.origOrderId, replace.orderId, replace.side, replace.exchangeId));
        return this.sendOrder(replace);
    }

    // private trigger(orderId: string, status: Models.OrderStatus, order: Models.BrokeredOrder = null) {
    //     var rpt: Models.OrderStatusReport = {
    //         orderId: orderId,
    //         orderStatus: status,
    //         time: Utils.date()
    //     };
    //     this.OrderUpdate.trigger(rpt);
    //
    //     if (status === Models.OrderStatus.Working) {
    //         var rpt: Models.OrderStatusReport = {
    //             orderId: orderId,
    //             orderStatus: status,
    //             time: Utils.date(),
    //             lastQuantity: order.quantity,
    //             lastPrice: order.price
    //         };
    //         setTimeout(() => this.OrderUpdate.trigger(rpt), 1000);
    //     }
    // }


      constructor(apiClient : CryptsyExchange.CryptsyApiClient) {
          this.apiClient = apiClient;
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
    apiClient : CryptsyExchange.CryptsyApiClient;

    generateMarketData = () => {
      var market;
      this.apiClient.getMarketOrderbook(155, (orderBook) => {
        var sellOrders = orderBook.sellorders;
        var buyOrders = orderBook.buyorders;
        var bids : Models.MarketSide[] = new Array<Models.MarketSide>();
        var asks : Models.MarketSide[] = new Array<Models.MarketSide>();
        sellOrders.forEach(function(sellOrder) {
          var ms = new Models.MarketSide(sellOrder.price, sellOrder.quantity);
          asks.push(ms);
        });
        buyOrders.forEach(function(buyOrder) {
          var ms = new Models.MarketSide(buyOrder.price, buyOrder.quantity);
          bids.push(ms);
        });
        this.MarketData.trigger( new Models.Market(bids, asks, Utils.date() ) );
      });
    }

    constructor(apiClient : CryptsyExchange.CryptsyApiClient) {
      this.apiClient = apiClient;
        setTimeout(() => this.ConnectChanged.trigger(Models.ConnectivityStatus.Connected), 500);
        setInterval(() => this.generateMarketData(), 30000);

        apiClient.getTradeHistory(155, (trades) => {
          trades.forEach(trade => {
            console.log('adding trade: ' + trade);
            this.MarketTrade.trigger(trade);
          })
        });

        apiClient.subscribeToPublicTrades(155, (trade) => {
          console.log("adding trade: " + trade );
          this.MarketTrade.trigger(trade);
        });

    }

    private genMarketTrade = () => new Models.GatewayMarketTrade(Math.random(), Math.random(), Utils.date(), false, Models.Side.Bid);

    private genSingleLevel = () => new Models.MarketSide(200 + 100 * Math.random(), Math.random());

    // private generateMarketData = () => {
    //     var genSide = () => {
    //         var s = [];
    //         for (var x = 0; x < 5; x++) {
    //             s.push(this.genSingleLevel());
    //         }
    //         return s;
    //     };
    //     return new Models.Market(genSide(), genSide(), Utils.date());
    // };


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
        new Models.CurrencyPair(Models.Currency.DASH, Models.Currency.BTC)
    ];
    public get supportedCurrencyPairs() {
        return CryptsyGatewayDetails.AllPairs;
    }
}

export class Cryptsy extends Interfaces.CombinedGateway {
    constructor(config: Config.IConfigProvider) {

        var apiClient = new CryptsyExchange.CryptsyApiClient(config);


        super(new CryptsyMarketDataGateway(apiClient),
        new CryptsyOrderGateway(apiClient),
        new CryptsyPositionGateway(apiClient),
        new CryptsyGatewayDetails()
      );
    }
}
