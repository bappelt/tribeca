var crypto = require('crypto');
var request = require('request');
import Config = require("../config");
import Models = require("../../common/models");

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



  private makeRequest = (path: string, callback) => {
    var query = "nonce=" + Date.now();
    var hmac = crypto.createHmac('sha512', this.privateKey);
    hmac.update(query);
    var sign = hmac.digest('hex');
    var options = {
      url: this.apiHost + this.basePath + path + "?" + query,
      headers: {'Sign': sign, 'Key': this.publicKey}
    }
    request(options, callback);
  }

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
  };

}
