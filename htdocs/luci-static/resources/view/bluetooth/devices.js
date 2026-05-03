'use strict';
'require view';
'require ui';
'require rpc';
'require poll';
'require dom';

const getStatus = rpc.declare({
	object: 'luci.bluetooth',
	method: 'get_status',
	expect: { '': {} }
});

const getDevices = rpc.declare({
	object: 'luci.bluetooth',
	method: 'get_devices',
	expect: { '': {} }
});

const setPower = rpc.declare({
	object: 'luci.bluetooth',
	method: 'set_power',
	params: [ 'on' ]
});

const startScan = rpc.declare({
	object: 'luci.bluetooth',
	method: 'start_scan',
	params: [ 'on' ]
});

const pairDevice = rpc.declare({
	object: 'luci.bluetooth',
	method: 'pair',
	params: [ 'mac' ]
});

const connectDevice = rpc.declare({
	object: 'luci.bluetooth',
	method: 'connect',
	params: [ 'mac' ]
});

const disconnectDevice = rpc.declare({
	object: 'luci.bluetooth',
	method: 'disconnect',
	params: [ 'mac' ]
});

const removeDevice = rpc.declare({
	object: 'luci.bluetooth',
	method: 'remove_device',
	params: [ 'mac' ]
});

const setAlias = rpc.declare({
	object: 'luci.bluetooth',
	method: 'set_alias',
	params: [ 'alias' ]
});

const setCodec = rpc.declare({
	object: 'luci.bluetooth',
	method: 'set_codec',
	params: [ 'data' ]
});

const setVolume = rpc.declare({
	object: 'luci.bluetooth',
	method: 'set_volume',
	params: [ 'data' ]
});

function renderStatus(status) {
	const spanTemp = '<em><span style="color:%s"><strong>%s</strong></span></em>';
	let renderHTML;
	if (status.powered) {
		renderHTML = spanTemp.format('green', _('Bluetooth is enabled'));
	} else {
		renderHTML = spanTemp.format('red', _('Bluetooth is disabled'));
	}
	return renderHTML;
}

function renderBluealsaTooltip(bluealsa) {
	const entries = [];
	if (!bluealsa) {
		return E('div', {});
	}

	const keyToLabel = {
		'sequence': _('Sequence'),
		'transport': _('Transport'),
		'mode': _('Mode'),
		'running': _('Running'),
		'format': _('Audio Format'),
		'channels': _('Channels'),
		'channelMap': _('Channel Map'),
		'rate': _('Rate'),
		'availableCodecs': _('Available Codecs'),
		'selectedCodec': _('Selected Codec'),
		'delay': _('Delay'),
		'clientDelay': _('Client Delay'),
		'softVolume': _('Soft Volume'),
		'volume': _('Volume'),
		'mute': _('Mute')
	};

	for (const key in bluealsa) {
		if (keyToLabel.hasOwnProperty(key)) {
			let val = bluealsa[key];
			if (typeof(val) === 'boolean') {
				val = val ? _('Yes') : _('No');
			}
			entries.push(E('div', {}, `${keyToLabel[key]}: ${val}`));
		}
	}
	return E('div', {}, entries);
}

function renderDevices(devices, view) {
	if (!devices || devices.length === 0) {
		return E('em', {}, _('No devices found.'));
	}

	const head = E('tr', { 'class': 'tr cbi-section-table-titles anonymous' }, [
		E('th', { 'class': 'th cbi-section-table-cell' }, _('Name')),
		E('th', { 'class': 'th cbi-section-table-cell' }, _('MAC Address')),
		E('th', { 'class': 'th cbi-section-table-cell' }, _('Paired')),
		E('th', { 'class': 'th cbi-section-table-cell' }, _('Bonded')),
		E('th', { 'class': 'th cbi-section-table-cell' }, _('Connected')),
		E('th', { 'class': 'th cbi-section-table-cell cbi-section-actions' }, _('Actions'))
	]);

	const rows = devices.map(dev => {
		const pairBtn = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'click': ui.createHandlerFn(view, () => {
				ui.showModal(_('Pairing...'), E('p', _('Attempting to pair with %s. Please check your device to confirm the pairing request.').format(dev.mac)));

				return pairDevice(dev.mac).then(() => {
					ui.hideModal();
					ui.addNotification(null, E('p', _('Pairing request sent. The device list will refresh automatically.')));
				}).catch(err => {
					ui.hideModal();
					ui.addNotification(null, E('p', _('Failed to send pairing request: %s').format(err.message)), 'error');
				});
			})
		}, _('Pair'));

		const connectBtn = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'click': ui.createHandlerFn(view, () => connectDevice(dev.mac))
		}, _('Connect'));

		const disconnectBtn = E('button', {
			'class': 'btn cbi-button cbi-button-remove',
			'click': ui.createHandlerFn(view, () => disconnectDevice(dev.mac))
		}, _('Disconnect'));

		const removeBtn = E('button', {
			'class': 'btn cbi-button cbi-button-remove',
			'style': 'margin-left: 8px;',
			'click': ui.createHandlerFn(view, () => removeDevice(dev.mac))
		}, _('Remove'));

		const buttons = [];
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

		let macCell;
		if (dev.connected && dev.bluealsa) {
			macCell = E('td', { 'class': 'td cbi-value-field cbi-tooltip-container' }, [
				dev.mac,
				E('span', { 'class': 'cbi-tooltip' }, renderBluealsaTooltip(dev.bluealsa))
			]);
		} else {
			macCell = E('td', { 'class': 'td cbi-value-field' }, dev.mac);
		}

		const connectedCell = E('td', { 'class': 'td cbi-value-field' }, dev.connected ? _('Yes') : _('No'));

		return E('tr', { 'class': 'tr cbi-section-table-row' }, [
			E('td', { 'class': 'td cbi-value-field' }, dev.name || dev.mac),
			macCell,
			E('td', { 'class': 'td cbi-value-field' }, dev.paired ? _('Yes') : _('No')),
			E('td', { 'class': 'td cbi-value-field' }, dev.bonded ? _('Yes') : _('No')),
			connectedCell,
			E('td', { 'class': 'td cbi-section-table-cell nowrap cbi-section-actions' }, E('div', {}, buttons))
		]);
	});

	return E('table', { 'class': 'table cbi-section-table' }, [
		E('thead', { 'class': 'thead cbi-section-thead' }, [ head ]),
		E('tbody', { 'class': 'tbody cbi-section-tbody' }, rows)
	]);
}

function renderAudioDevices(devices, view) {
	const audioDevices = devices.filter(dev => dev.connected && dev.bluealsa);

	if (audioDevices.length === 0) {
		return E('em', {}, _('No audio devices connected.'));
	}

	const head = E('tr', { 'class': 'tr cbi-section-table-titles anonymous' }, [
		E('th', { 'class': 'th cbi-section-table-cell' }, _('Name')),
		E('th', { 'class': 'th cbi-section-table-cell' }, _('MAC Address')),
		E('th', { 'class': 'th cbi-section-table-cell' }, _('Codec')),
		E('th', { 'class': 'th cbi-section-table-cell' }, _('Volume')),
		E('th', { 'class': 'th cbi-section-table-cell' }, _('Delay'))
	]);

	const rows = audioDevices.map(dev => {
		const codecId = `codec-${dev.mac}`;
		const volumeId = `volume-${dev.mac}`;

		const codecSelect = E('select', { 'id': codecId, 'style': 'width: 70px;' });
		if (dev.bluealsa.availableCodecs) {
			dev.bluealsa.availableCodecs.split(' ').forEach(codec => {
				const option = E('option', { 'value': codec }, codec);
				if (codec === dev.bluealsa.selectedCodec) {
					option.selected = 'selected';
				}
				codecSelect.appendChild(option);
			});
		}

		const codecBtn = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'style': 'margin-left: 8px;',
			'click': ui.createHandlerFn(view, () => {
				const selectedCodec = document.getElementById(codecId).value;
				return setCodec({ mac: dev.mac, codec: selectedCodec });
			})
		}, _('Set'));

		const volumeMap = Array.from({ length: 11 }, (_, i) => {
			const p = i * 10;
			return { percent: `${p}%`, value: Math.round(p * 1.27) };
		});

		const findClosestVolumeStep = (currentValue, map) => {
			return map.reduce((prev, curr) => {
				return (Math.abs(curr.value - currentValue) < Math.abs(prev.value - currentValue) ? curr : prev);
			});
		};

		const volumeSelect = E('select', { 'id': volumeId, 'style': 'width: 70px;' });
		const currentVolume = parseInt(dev.bluealsa.volume.split(' ')[0], 10);
		const closestStep = findClosestVolumeStep(currentVolume, volumeMap);

		volumeMap.forEach(step => {
			const option = E('option', { 'value': step.value }, step.percent);
			if (step.value === closestStep.value) {
				option.selected = 'selected';
			}
			volumeSelect.appendChild(option);
		});

		const volumeBtn = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'style': 'margin-left: 8px;',
			'click': ui.createHandlerFn(view, () => {
				const newVolume = document.getElementById(volumeId).value;
				return setVolume({ mac: dev.mac, volume: parseInt(newVolume, 10) });
			})
		}, _('Set'));

		return E('tr', { 'class': 'tr cbi-section-table-row' }, [
			E('td', { 'class': 'td cbi-value-field' }, dev.name || dev.mac),
			E('td', { 'class': 'td cbi-value-field' }, dev.mac),
			E('td', { 'class': 'td cbi-value-field' }, [ codecSelect, codecBtn ]),
			E('td', { 'class': 'td cbi-value-field' }, [ volumeSelect, volumeBtn ]),
			E('td', { 'class': 'td cbi-value-field' }, dev.bluealsa.delay ? (dev.bluealsa.delay) : '-')
		]);
	});

	return E('table', { 'class': 'table cbi-section-table' }, [
		E('thead', { 'class': 'thead cbi-section-thead' }, [ head ]),
		E('tbody', { 'class': 'tbody cbi-section-tbody' }, rows)
	]);
}

return view.extend({
	__status: {},

	render(data) {
		const devices = data[0].devices || [];
		const view = this;

		poll.add(() => {
			return Promise.all([
				getStatus(),
				getDevices()
			]).then(res => {
				const status = res[0];
				const devices = res[1].devices || [];

				view.__status = status;
				const statusEl = document.getElementById('service_status');
				if (statusEl) {
					statusEl.innerHTML = renderStatus(status);
				}

				const powerButtonEl = document.getElementById('power_button');
				if (powerButtonEl) {
					powerButtonEl.className = `cbi-button ${status.powered ? 'cbi-button-apply' : 'cbi-button-remove'}`;
					powerButtonEl.innerText = status.powered ? _('Turn Off') : _('Turn On');
				}

				const aliasEl = document.getElementById('adapter_alias');
				if (aliasEl) {
					aliasEl.innerText = `${_('Adapter Alias:')} ${status.alias}`;
				}

				const devicesEl = document.getElementById('devices_list');
				if (devicesEl) {
					dom.content(devicesEl, renderDevices(devices, view));
				}

				const audioDevicesEl = document.getElementById('audio_devices_list');
				if (audioDevicesEl) {
					dom.content(audioDevicesEl, renderAudioDevices(devices, view));
				}
			});
		});

		const powerButton = E('button', {
			'id': 'power_button',
			'class': 'cbi-button',
			'style': 'margin-right: 8px;',
			'click': ui.createHandlerFn(this, () => setPower(!view.__status.powered ? 1 : 0))
		}, _('Collecting data...'));

		const scanButton = E('button', {
			'class': 'cbi-button cbi-button-action',
			'click': ui.createHandlerFn(this, () => {
				ui.showModal(_('Scanning...'), E('p', _('Scanning for devices. This may take a few moments.')));
				return startScan(1).then(() => {
					setTimeout(() => {
						startScan(0).then(() => {
							ui.hideModal();
							return view.load().then(view.render.bind(view));
						});
					}, 5000); // Wait scan for 5 seconds
				});
			})
		}, _('Scan for Devices'));

		const aliasField = E('input', { 'type': 'text', 'id': 'bt_alias', 'style': 'margin-right: 8px;' });
		const aliasButton = E('button', {
			'class': 'cbi-button',
			'click': ui.createHandlerFn(this, () => {
				const newAlias = document.getElementById('bt_alias').value;
				return setAlias(newAlias).then(() => {
					return view.load().then(view.render.bind(view));
				});
			})
		}, _('Rename Adapter'));

		const deviceTable = E('div', { 'id': 'devices_list' }, E('em', {}, _('Collecting data...')));
		const audioDeviceTable = E('div', { 'id': 'audio_devices_list' }, E('em', {}, _('Collecting data...')));

		return E([], [
			E('h2', {}, _('Bluetooth Management')),
			E('div', { 'class': 'cbi-section' }, [
				E('p', { id: 'adapter_alias' }, _('Adapter Alias: ...')),
				E('p', { id: 'service_status' }, _('Collecting data...')),
				E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center; margin-top: 12px;' }, [
					E('div', {}, [
						powerButton,
						scanButton
					]),
					E('div', {}, [
						aliasField,
						aliasButton
					])
				])
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Discovered & Paired Devices')),
				deviceTable
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Connected Audio Devices')),
				audioDeviceTable
			])
		]);
	},

	load() {
		return Promise.all([
			getDevices()
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
