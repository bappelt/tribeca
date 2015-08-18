var crypto = require('crypto');
var request = require('request');
var Models = require("../../common/models");
var CryptsyTribecaCurrencyMap = (function () {
    function CryptsyTribecaCurrencyMap() {
        var _this = this;
        this.cryptsyIdForCurrency = function (currency) {
            for (var tribecaId in _this) {
                if (_this[tribecaId] === Models.Currency[currency])
                    return tribecaId;
            }
        };
    }
    return CryptsyTribecaCurrencyMap;
})();
var CryptsyApiClient = (function () {
    function CryptsyApiClient(config) {
        var _this = this;
        this.makeRequest = function (path, callback) {
            var query = "nonce=" + Date.now();
            var hmac = crypto.createHmac('sha512', _this.privateKey);
            hmac.update(query);
            var sign = hmac.digest('hex');
            var options = {
                url: _this.apiHost + _this.basePath + path + "?" + query,
                headers: { 'Sign': sign, 'Key': _this.publicKey }
            };
            request(options, callback);
        };
        this.getPositions = function (callback) {
            var positions = {};
            _this.getCurrencyMap(function (cryptsyTribecaCurrencyMap) {
                _this.makeRequest('/balances', function (err, resp, body) {
                    var balances = JSON.parse(body).data.available;
                    for (var currency in Models.Currency) {
                        if (Models.Currency.hasOwnProperty(currency) && !/^\d+$/.test(currency)) {
                            positions[currency] = balances[cryptsyTribecaCurrencyMap.cryptsyIdForCurrency(currency)];
                        }
                    }
                    callback(positions);
                });
            });
        };
        this.getCurrencyMap = function (callback) {
            _this.makeRequest('/currencies', function (err, resp, body) {
                var cryptsy_currency_list = JSON.parse(body).data;
                var filtered_currency_list = cryptsy_currency_list.filter(function (item) {
                    for (var currency in Models.Currency) {
                        if (Models.Currency.hasOwnProperty(currency) && !/^\d+$/.test(currency)) {
                            if (currency == item.code)
                                return true;
                        }
                    }
                });
                var cryptsyTribecaMap = new CryptsyTribecaCurrencyMap();
                for (var index in filtered_currency_list) {
                    var item = filtered_currency_list[index];
                    cryptsyTribecaMap[item.id] = Models.Currency[item.code];
                }
                callback(cryptsyTribecaMap);
            });
        };
        this.apiHost = config.GetString('CryptsyApiURL');
        this.basePath = "/api/v2";
        this.publicKey = config.GetString('CryptsyApiPublicKey');
        this.privateKey = config.GetString('CryptsyApiPrivateKey');
    }
    return CryptsyApiClient;
})();
exports.CryptsyApiClient = CryptsyApiClient;
console.log(Models.Currency[0]);
