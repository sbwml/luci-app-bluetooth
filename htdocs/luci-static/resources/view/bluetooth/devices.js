'use strict';
'require view';
'require ui';
'require rpc';
'require poll';
'require dom';

var getStatus = rpc.declare({
    object: 'luci.bluetooth',
    method: 'get_status',
    expect: { '': {} }
});

var getDevices = rpc.declare({
    object: 'luci.bluetooth',
    method: 'get_devices',
    expect: { '': {} }
});

var setPower = rpc.declare({
    object: 'luci.bluetooth',
    method: 'set_power',
    params: [ 'on' ]
});

var startScan = rpc.declare({
    object: 'luci.bluetooth',
    method: 'start_scan',
    params: [ 'on' ]
});

var pairDevice = rpc.declare({
    object: 'luci.bluetooth',
    method: 'pair',
    params: [ 'mac' ]
});

var connectDevice = rpc.declare({
    object: 'luci.bluetooth',
    method: 'connect',
    params: [ 'mac' ]
});

var disconnectDevice = rpc.declare({
    object: 'luci.bluetooth',
    method: 'disconnect',
    params: [ 'mac' ]
});

var removeDevice = rpc.declare({
    object: 'luci.bluetooth',
    method: 'remove_device',
    params: [ 'mac' ]
});

var setAlias = rpc.declare({
    object: 'luci.bluetooth',
    method: 'set_alias',
    params: [ 'alias' ]
});

function renderStatus(status) {
    var spanTemp = '<em><span style="color:%s"><strong>%s</strong></span></em>';
    var renderHTML;
    if (status.powered) {
        renderHTML = spanTemp.format('green', _('RUNNING'));
    } else {
        renderHTML = spanTemp.format('red', _('NOT RUNNING'));
    }
    return renderHTML;
}

function renderDevices(devices, view) {
    if (!devices || devices.length === 0) {
        return E('em', {}, _('No devices found.'));
    }

    var head = E('tr', { 'class': 'tr cbi-section-table-titles anonymous' }, [
        E('th', { 'class': 'th cbi-section-table-cell' }, _('Name')),
        E('th', { 'class': 'th cbi-section-table-cell' }, _('MAC Address')),
        E('th', { 'class': 'th cbi-section-table-cell' }, _('Paired')),
        E('th', { 'class': 'th cbi-section-table-cell' }, _('Bonded')),
        E('th', { 'class': 'th cbi-section-table-cell' }, _('Trusted')),
        E('th', { 'class': 'th cbi-section-table-cell' }, _('Connected')),
        E('th', { 'class': 'th cbi-section-table-cell cbi-section-actions' }, _('Actions'))
    ]);

    var rows = devices.map(function(dev) {
        var pairBtn = E('button', {
            'class': 'btn cbi-button cbi-button-action',
            'click': ui.createHandlerFn(view, function() {
                ui.showModal(_('Pairing...'), E('p', _('Attempting to pair with %s. Please check your device to confirm the pairing request.').format(dev.mac)));

                return pairDevice(dev.mac).then(function(response) {
                    ui.hideModal();
                    ui.addNotification(null, E('p', _('Pairing request sent. The device list will refresh automatically.')));
                }).catch(function(err) {
                    ui.hideModal();
                    ui.addNotification(null, E('p', _('Failed to send pairing request: %s').format(err.message)), 'error');
                });
            })
        }, _('Pair'));

        var connectBtn = E('button', {
            'class': 'btn cbi-button cbi-button-action',
            'click': ui.createHandlerFn(view, function() {
                return connectDevice(dev.mac);
            })
        }, _('Connect'));

        var disconnectBtn = E('button', {
            'class': 'btn cbi-button cbi-button-remove',
            'click': ui.createHandlerFn(view, function() {
                return disconnectDevice(dev.mac);
            })
        }, _('Disconnect'));

        var removeBtn = E('button', {
            'class': 'btn cbi-button cbi-button-remove',
            'style': 'margin-left: 8px;',
            'click': ui.createHandlerFn(view, function() {
                return removeDevice(dev.mac);
            })
        }, _('Remove'));

        var buttons = [];
        if (dev.connected) {
            buttons.push(disconnectBtn);
        } else if (dev.paired) {
            buttons.push(connectBtn);
        } else {
            buttons.push(pairBtn);
        }

        if (dev.paired) {
            buttons.push(removeBtn);
        }

        return E('tr', { 'class': 'tr cbi-section-table-row' }, [
            E('td', { 'class': 'td cbi-value-field' }, dev.name || dev.mac),
            E('td', { 'class': 'td cbi-value-field' }, dev.mac),
            E('td', { 'class': 'td cbi-value-field' }, dev.paired ? _('Yes') : _('No')),
            E('td', { 'class': 'td cbi-value-field' }, dev.bonded ? _('Yes') : _('No')),
            E('td', { 'class': 'td cbi-value-field' }, dev.trusted ? _('Yes') : _('No')),
            E('td', { 'class': 'td cbi-value-field' }, dev.connected ? _('Yes') : _('No')),
            E('td', { 'class': 'td cbi-section-table-cell nowrap cbi-section-actions' }, E('div', {}, buttons))
        ]);
    });

    return E('table', { 'class': 'table cbi-section-table' }, [
        E('thead', { 'class': 'thead cbi-section-thead' }, [ head ]),
        E('tbody', { 'class': 'tbody cbi-section-tbody' }, rows)
    ]);
}

return view.extend({
    __status: {},
    render: function(data) {
        var devices = data[0].devices || [];
        var view = this;

        poll.add(function () {
            return Promise.all([
                getStatus(),
                getDevices()
            ]).then(function(res) {
                var status = res[0];
                var devices = res[1].devices || [];

                view.__status = status;
                var statusEl = document.getElementById('service_status');
                if (statusEl) {
                    statusEl.innerHTML = renderStatus(status);
                }

                var powerButtonEl = document.getElementById('power_button');
                if (powerButtonEl) {
                    powerButtonEl.className = 'cbi-button ' + (status.powered ? 'cbi-button-apply' : 'cbi-button-remove');
                    powerButtonEl.innerText = status.powered ? _('Turn Off') : _('Turn On');
                }

                var aliasEl = document.getElementById('adapter_alias');
                if (aliasEl) {
                    aliasEl.innerText = _('Adapter Alias:') + ' ' + status.alias
                }

                var devicesEl = document.getElementById('devices_list');
                if (devicesEl) {
                    dom.content(devicesEl, renderDevices(devices, view));
                }
            });
        });

        var powerButton = E('button', {
            'id': 'power_button',
            'class': 'cbi-button',
            'style': 'margin-right: 8px;',
            'click': ui.createHandlerFn(this, function() {
                return setPower(!view.__status.powered ? 1 : 0);
            })
        }, _('Collecting data...'));

        var scanButton = E('button', {
            'class': 'cbi-button cbi-button-action',
            'click': ui.createHandlerFn(this, function() {
                ui.showModal(_('Scanning...'), E('p', _('Scanning for devices. This may take a few moments.')));
                return startScan(1).then(function() {
                    setTimeout(function() {
                        startScan(0).then(function() {
                            ui.hideModal();
                            return view.load().then(view.render.bind(view));
                        });
                    }, 10000); // Wait scan for 10 seconds
                });
            })
        }, _('Scan for Devices'));

        var aliasField = E('input', { 'type': 'text', 'id': 'bt_alias', 'style': 'margin-right: 8px;' });
        var aliasButton = E('button', {
            'class': 'cbi-button',
            'click': ui.createHandlerFn(this, function() {
                var newAlias = document.getElementById('bt_alias').value;
                return setAlias(newAlias).then(function() {
                    return view.load().then(view.render.bind(view));
                });
            })
        }, _('Rename Adapter'));

        var deviceTable = E('div', { 'id': 'devices_list' }, E('em', {}, _('Collecting data...')));

        return E([], [
            E('h2', {}, _('Bluetooth Management')),
            E('div', { 'class': 'cbi-section' }, [
                E('p', { id: 'adapter_alias' }, _('Adapter Alias: ...')),
                E('p', { id: 'service_status' }, _('Collecting data...')),
                E('div', { 'style': 'margin-top: 12px;' }, [
                    powerButton,
                    scanButton
                ]),
                E('div', { 'style': 'margin-top: 12px;' }, [
                    aliasField,
                    aliasButton
                ])
            ]),
            E('div', { 'class': 'cbi-section' }, [
                E('h3', {}, _('Discovered & Paired Devices')),
                deviceTable
            ])
        ]);
    },

    load: function() {
        return Promise.all([
            getDevices()
        ]);
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
