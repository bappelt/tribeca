var crypto = require('crypto');
var request = require('request');
import Config = require("../config");
import Models = require("../../common/models");
import moment = require("moment");
import Utils = require("../utils");
var PusherClient = require('pusher-node-client').PusherClient

interface CryptsyCurrency {
  id: number;
  code: string;
}

class CryptsyTribecaCurrencyMap {
  [tribecaId: number]: string
  cryptsyIdForCurrency = (currency : Models.Currency) => {
      for(var tribecaId in this) {
        if(this[tribecaId]===Models.Currency[currency]) return tribecaId;
      }
  }
}

export class CryptsyApiClient {

  publicKey : string;
  privateKey : string;
  apiHost : string;
  basePath : string;


  constructor(config: Config.IConfigProvider) {
    this.apiHost = config.GetString('CryptsyApiURL');
    this.basePath = "/api/v2";
    this.publicKey = config.GetString('CryptsyApiPublicKey');
    this.privateKey = config.GetString('CryptsyApiPrivateKey');
  }

  private makeRequest = (path: string, callback, method='GET') => {
    var query = "nonce=" + Date.now();
    var queryIndex = path.indexOf("?");
    if (queryIndex > 0) {
      var queryFromPath = path.substr(queryIndex+1);
      path = path.substring(0, queryIndex);
      query = query + "&" + queryFromPath;
    }
    var hmac = crypto.createHmac('sha512', this.privateKey);
    hmac.update(query);
    var sign = hmac.digest('hex');
    var requestURL = this.apiHost + this.basePath + path + "?" + query;
    console.log("requesting: " + method + " " + requestURL);
    var options = {
      url: requestURL,
      headers: {'Sign': sign, 'Key': this.publicKey},
      method: method
    }
    request(options, callback);
  }

  getMarkets = (callback) => {
    this.makeRequest('/markets', (err, response, body) => {
      callback(JSON.parse(body).data);
    });
  };

  getMarket = (marketId, callback) => {
    this.makeRequest('/markets/' + marketId, (err, response, body) => {
      callback(JSON.parse(body).data);
    });
  };

  getMarketOrderbook = (marketId, callback) => {
    this.makeRequest('/markets/' + marketId + "/orderbook?limit=5", (err, response, body) => {
      callback(JSON.parse(body).data);
    });
  }

  getTradeHistory = (marketID, callback) => {
    this.makeRequest('/markets/' + marketID + '/tradehistory', (err, response, body) => {
      var response = JSON.parse(body).data;
      // console.log(response);
      var trades = [];
      response.forEach(trade => {
        var side = trade.initiate_ordertype==='Buy' ? Models.Side.Ask : Models.Side.Bid;
        var mmt = moment.unix(trade.timestamp);
        var marketTrade = new Models.GatewayMarketTrade(trade.tradeprice,
                                                        trade.quantity,
                                                        moment.unix(trade.timestamp),
                                                        true,
                                                        side );
       trades.push(marketTrade);
     });
     callback(trades);
    });
  };

  getPositions = (callback) => {
    var positions = {};
      this.getCurrencyMap( (cryptsyTribecaCurrencyMap: CryptsyTribecaCurrencyMap ) => {
        this.makeRequest('/balances', (err, resp, body) => {
          var balances = JSON.parse(body).data.available;
          for(var currency in Models.Currency) {
            if (Models.Currency.hasOwnProperty(currency) && !/^\d+$/.test(currency)) {
              positions[currency] = balances[cryptsyTribecaCurrencyMap.cryptsyIdForCurrency(currency) ]
            }
          }
          callback(positions);
      });
    });
  }

  getCurrencyMap = (callback) => {
    this.makeRequest('/currencies', (err, resp, body) => {
      var cryptsy_currency_list:Array<CryptsyCurrency> = JSON.parse(body).data;
      var filtered_currency_list:Array<CryptsyCurrency> = cryptsy_currency_list.filter( (item) => {
        for(var currency in Models.Currency) {
          if (Models.Currency.hasOwnProperty(currency) && !/^\d+$/.test(currency)) {
            if(currency==item.code) return true;
          }
        }
      });
      //map cryptsy currency ids to tribeca currencies
      var cryptsyTribecaMap = new CryptsyTribecaCurrencyMap();
      for(var index in filtered_currency_list) {
        var item = filtered_currency_list[index];
        cryptsyTribecaMap[item.id] = Models.Currency[item.code];
      }
      callback(cryptsyTribecaMap);
    });
  }

  subscribeToPublicTrades = (marketID, callback) => {
    var pc = new PusherClient({key: 'cb65d0a7a72cd94adf1f', secret: ''});
    pc.on('connect', () => {
      console.log('...connected...');
      var sub = pc.subscribe('trade.' + marketID, {});
      console.log('sub created');
      sub.on('success', () => {
        console.log('successfully subscribed');
        sub.on('message', (msg) => {
          console.log("pusher message: " + msg);
          var trade = msg.trade;
          console.log("Real Time Trade: " + JSON.stringify(trade));
          var side = trade.type==='Buy' ? Models.Side.Ask : Models.Side.Bid;
          var gatewayMarketTrade = new Models.GatewayMarketTrade( trade.price,
                                                                  trade.quantity,
                                                                  moment.unix(trade.timestamp),
                                                                  false,
                                                                  side );
          callback(gatewayMarketTrade);
        });
      });

    });
    pc.connect();
  }

  createOrder = (order : Models.BrokeredOrder, callback) => {
    this.makeRequest('/order?marketid=155' + '&ordertype=' + (order.side==Models.Side.Ask ? 'SELL' : 'BUY')
                          + '&quantity=' + order.quantity + '&price=' + order.price,
                        (err, response, body) => {
                          console.log('create order response: ' + body);
                          var responseBody = JSON.parse(body);
                          var rpt: Models.OrderStatusReport = {
                              time: Utils.date()
                          };
                          if(responseBody.success) {
                            rpt.orderStatus = Models.OrderStatus.Working;
                            rpt.exchangeId = responseBody.data.orderid;
                          } else {
                            rpt.orderStatus = Models.OrderStatus.Rejected;
                            rpt.rejectMessage = responseBody.error[0];
                          }
                          callback(rpt);
                        }, 'POST');
  };

  getOrderStatus = (orderID, callback) => {
    this.makeRequest('/order/' + orderID, (err, resp, body) => {
      console.log("order status response: " + body);
      var responseBody = JSON.parse(body);
      var rpt: Models.OrderStatusReport = {
          orderStatus: Models.OrderStatus.Working,
          time: Utils.date(),
          exchangeId: responseBody.data.orderid
      };
      console.log("Order Status Report: " + JSON.stringify(rpt));
      callback(rpt);
    })
  };

  cancelOrder = (orderId : string, callback) => {
    this.makeRequest('/order/' + orderId, (err, resp, body) => {
      console.log(body);
      var response = JSON.parse(body);
      if(response.success) {
        callback(orderId);
      }
    }, 'DELETE');
  };

  getOrders = () => {
    this.makeRequest('/orders', (err, response, body) => {
      console.log('orders: ' + body);
    });
  }

  getUserTradeHistory = () => {
    this.makeRequest('/tradehistory', (err, response, body) => {
      console.log(body);
    })
  }
}




var config = new Config.ConfigProvider();
var api = new CryptsyApiClient(config);
var order = new Models.BrokeredOrder(null, Models.Side.Ask, 0.001, Models.TimeInForce.GTC, 0.09, null, null);
// api.cancelOrder('361893728');
// api.createOrder(order, (status) => {
  // console.log("WTF: " + JSON.stringify(status));
// });
// api.getOrderStatus(360734305, (info) => {
//   console.log(JSON.stringify(info));
// });
api.getUserTradeHistory();
