// Do not run this plugin with the queue/smtp_proxy plugin.
// Place this plugin before rcpt_to.in_host_list in config/plugins file.
// This plugin must be the last rcpt_to plugin in the config/plugins list (except for rcpt_to.in_host_list and haraka-plugin-domain-limit).
const Address = require('../haraka-necessary-helper-plugins/address-rfc2821').Address;

const { Etcd3 } = require('../haraka-necessary-helper-plugins/etcd3');
const client = new Etcd3();

exports.register = function () {
  this.inherits('queue/discard');

  this.load_aliases();

  this.register_hook('rcpt', 'aliases');
};

exports.load_aliases = function () {
  const plugin = this;

  var tempConfig = {}
  plugin.cfg = tempConfig;

  (async () => {
      const list = await client.getAll().prefix('config_alias').strings();
      
      tempConfig = {};
      for (var key in list) {
        if (list.hasOwnProperty(key)) {
          var from = list[key].substr(0, list[key].indexOf(":"));
          var to = list[key].substr(list[key].indexOf(":") + 1);
          tempConfig[JSON.parse(from)] = JSON.parse(to);
        }
      }

      plugin.cfg = tempConfig;
    })();

    client.watch()
    .prefix('config_alias')
    .create()
    .then(watcher => {
      watcher
        .on('disconnected', () => console.log('disconnected...'))
        .on('connected', () => console.log('successfully reconnected!'))
        .on('put', res => {
          var from = res.value.toString().substr(1, res.value.toString().indexOf(":")-2);
          var to = res.value.toString().substr(res.value.toString().indexOf(":") + 2);

          tempConfig[from] = JSON.parse(to);
          plugin.cfg = tempConfig;
        });
    });

}

exports.aliases = function (next, connection, params) {
  const plugin = this;
  const cfg = plugin.cfg;
  const rcpt = params[0].address();
  const user = params[0].user;
  const host = params[0].host;

  let match = user.split(/[+-]/, 1);
  let action = "<missing>";

  function onMatch(match1, action1) {
    switch (action.toLowerCase()) {
      case 'drop':
        _drop(plugin, connection, match1);
        break;
      case 'alias':
        _alias(plugin, connection, match1, cfg[match1], host, next);
        return;
      case 'domain-alias':
        _domain_alias(plugin, connection, match1, cfg[match1], host, next);
        return;
      default:
        connection.loginfo(plugin, "unknown action: " + action1);
    }
    next();
  }

  // full email address match
  if (cfg[rcpt]) {
    if (cfg[rcpt].action) action = cfg[rcpt].action;
    return onMatch(rcpt, action);
  }

  // user only match
  if (cfg[user]) {
    if (cfg[user].action) action = cfg[user].action;
    return onMatch(user, action);
  }

  // user prefix match
  if (cfg[match[0]]) {
    if (cfg[match[0]].action) action = cfg[match[0]].action;
    return onMatch(match[0], action);
  }

  // user prefix + domain match
  const prefix_dom = `${match[0]}@${host}`;
  if (cfg[prefix_dom]) {
    if (cfg[prefix_dom].action) action = cfg[prefix_dom].action;
    return onMatch(prefix_dom, action);
  }

  // @domain match
  const dom_match = `@${host}`;
  if (cfg[`@${host}`]) {
    if (cfg[dom_match].action) action = cfg[dom_match].action;
    match = dom_match;
    return onMatch(dom_match, action);
  }

  next();
};

function _drop(plugin, connection, rcpt) {
  connection.logdebug(plugin, "marking " + rcpt + " for drop");
  connection.transaction.notes.discard = true;
}

function _alias(plugin, connection, key, config, host, next) {
  const txn = connection.transaction;

  if (!config.to) {
    connection.loginfo(plugin, `alias failed for ${key}, no "to" field in alias config`);
    return next();
  }

  if (Array.isArray(config.to)) {
    connection.logdebug(plugin, `aliasing ${txn.rcpt_to} to ${config.to}`);
    txn.rcpt_to.pop();
    config.to.forEach((addr) => {
      txn.rcpt_to.push(new Address(`<${addr}>`));
    })
    return next();
  }

  let to = config.to;
  if (to.search("@") === -1) {
    to = config.to + '@' + host;
  }

  connection.logdebug(plugin, "aliasing " + txn.rcpt_to + " to " + to);
  const original_rcpt = txn.rcpt_to.pop();
  txn.rcpt_to.push(new Address(`<${to}>`));

  return next(OK, `recipient ${original_rcpt} OK`);
}


function _domain_alias(plugin, connection, key, config, host, next) {
  const txn = connection.transaction;

  if (!config.to) {
    connection.loginfo(plugin, `domain alias failed for ${key}, no "to" field in config`);
    return next();
  }
  

  let to = config.to;
  if (to.search("@") !== 0 || key.search("@") !== 0) {
    connection.loginfo(plugin, `domain-alias failed for ${key}, domain field is not accepted! Please fix the config file of the plugin.
    Correct form: "@example.com" : { "action" : "domain-alias", "to" : "@domain.test" }
    Continuing  without changing domain.`);
    // throw new Error('');
    return next();
  }

  
  connection.logdebug(plugin, "domain-aliasing " + txn.rcpt_to + " to " + to);
  const original_rcpt = txn.rcpt_to.pop();
  to = original_rcpt.user + to;
  
  txn.rcpt_to.push(new Address(`<${to}>`));

  return next(OK, `recipient ${original_rcpt} OK`);
}
