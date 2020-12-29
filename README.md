[![Unix Build Status][ci-img]][ci-url]
[![Windows Build Status][ci-win-img]][ci-win-url]
[![Code Climate][clim-img]][clim-url]
[![NPM][npm-img]][npm-url]

# haraka-plugin-domain-aliases-etcd-config

This plugin recieves its config from etcd. Other than that, works the same way as domain-aliases plugin: https://github.com/PartyPancakess/haraka-plugin-domain-aliases


& WARNING: DO NOT USE THIS PLUGIN WITH queue/smtp_proxy.
& WARNING: This plugin must be the last rcpt_to plugin in the config/plugins list (except for rcpt_to.in_host_list and haraka-plugin-domain-limit).

## Configuration
#### Available actions:
- drop
- alias
	- to (required)
- domain-alias
	- to (required)



### Example etcd Configuration
```
etcdctl put config_alias_1 '{"test1": { "action": "drop" },"test2": { "action": "alias", "to": "non-test2" },"@domain.com": { "action" : "domain-alias", "to" : "@example.com" }}'
```


<!-- leave these buried at the bottom of the document -->
[ci-img]: https://github.com/haraka/haraka-plugin-domain-aliases-etcd-config/workflows/Plugin%20Tests/badge.svg
[ci-url]: https://github.com/haraka/haraka-plugin-domain-aliases-etcd-config/actions?query=workflow%3A%22Plugin+Tests%22
[ci-win-img]: https://github.com/haraka/haraka-plugin-domain-aliases-etcd-config/workflows/Plugin%20Tests%20-%20Windows/badge.svg
[ci-win-url]: https://github.com/haraka/haraka-plugin-domain-aliases-etcd-config/actions?query=workflow%3A%22Plugin+Tests+-+Windows%22
[clim-img]: https://codeclimate.com/github/haraka/haraka-plugin-domain-aliases-etcd-config/badges/gpa.svg
[clim-url]: https://codeclimate.com/github/haraka/haraka-plugin-domain-aliases-etcd-config
[npm-img]: https://nodei.co/npm/haraka-plugin-domain-aliases-etcd-config.png
[npm-url]: https://www.npmjs.com/package/haraka-plugin-domain-aliases-etcd-config
