// Do not run this plugin with the queue/smtp_proxy plugin.
// Place this plugin before rcpt_to.in_host_list in config/plugins file.
// This plugin must be the last rcpt_to plugin in the config/plugins list (except for rcpt_to.in_host_list and haraka-plugin-domain-limit).
const Address = require('../haraka-necessary-helper-plugins/address-rfc2821').Address;

const { Etcd3 } = require('../haraka-necessary-helper-plugins/etcd3');

const etcdSourceAddress = process.env.ETCD_ADDR || '127.0.0.1:2379';
const client = new Etcd3({hosts:etcdSourceAddress});


exports.register = function () {
  this.inherits('queue/discard');

  this.load_aliases();

  this.register_hook('rcpt', 'aliases');
};

exports.load_aliases = function () {
  const plugin = this;

  var tempConfig = {}
  plugin.cfg = tempConfig;
  

  client.get('config/mta/alias').string()
  .then(list => {
    if (list) {
      tempConfig = JSON.parse(list);
      plugin.cfg = tempConfig;
    }
    else console.log("Something went wrong while reading config/mta/alias from Etcd");
  });

  client.watch()
  .key('config/mta/alias')
  .create()
  .then(watcher => {
    watcher
      .on('disconnected', () => console.log('disconnected...'))
      .on('connected', () => console.log('successfully reconnected!'))
      .on('put', res => {
        tempConfig = JSON.parse(res.value.toString());
        plugin.cfg = tempConfig;
        console.log("Aliases are updated!");
      });
  });

}

exports.aliases = function (next, connection, params) {
  const plugin = this;
  const cfg = plugin.cfg;
  const rcpt_to = connection.transaction.rcpt_to[connection.transaction.rcpt_to.length-1];
  const rcpt_to_original = rcpt_to.original;

  const rcpt = rcpt_to_original.substring(1, rcpt_to_original.length-1);
  const user = rcpt_to.user;
  const host = rcpt_to.host;

  var match;
  try{
    match = user.split(/[+-]/, 1);
  }
  catch(err){
    console.log("Something went wrong while finding a match in domain aliases.");
    next(DENYSOFT);
  }

  let action = "<missing>";

  function onMatch(match1, action1) {
    switch (action.toLowerCase()) {
      case 'drop':
        _drop(plugin, connection, match1);
        break;
      case 'alias':
        _alias(plugin, connection, match1, cfg[match1], host, next);
        break;
      case 'domain-alias':
        _domain_alias(plugin, connection, match1, cfg[match1], host, next);
        break;
      default:
        connection.loginfo(plugin, "unknown action: " + action1);
    }
  }

  // full email address match
  if (cfg[rcpt]) {
    if (cfg[rcpt].action) action = cfg[rcpt].action;
    return onMatch(rcpt, action);
  }

  // user only match
  if (cfg[user]) {
    if (cfg[user].action) action = cfg[user].action;
    onMatch(user, action);
  }
  // user prefix match
  else if (cfg[match[0]]) {
    if (cfg[match[0]].action) action = cfg[match[0]].action;
    onMatch(match[0], action);
  }

  // user prefix + domain match
  const prefix_dom = `${match[0]}@${host}`;
  if (cfg[prefix_dom]) {
    if (cfg[prefix_dom].action) action = cfg[prefix_dom].action;
    onMatch(prefix_dom, action);
  }

  // @domain match
  const dom_match = `@${host}`;
  if (cfg[`@${host}`]) {
    if (cfg[dom_match].action) action = cfg[dom_match].action;
    match = dom_match;
    onMatch(dom_match, action);
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

  connection.notes.aliased = new Address(`<${to}>`);

  return;
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

  connection.notes.aliased = new Address(`<${to}>`);

  return;
}
