'use strict';
'require view';
'require ui';
'require rpc';
'require poll';
'require dom';

// 统一管理断点
const MOBILE_BREAKPOINT = 640;

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

function getDeviceButtons(dev, view) {
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

	return buttons;
}

// --- 桌面端渲染 (表格) ---
function renderDevicesDesktop(devices, view) {
	const head = E('tr', { 'class': 'tr cbi-section-table-titles anonymous' }, [
		E('th', { 'class': 'th cbi-section-table-cell' }, _('Name')),
		E('th', { 'class': 'th cbi-section-table-cell' }, _('MAC Address')),
		E('th', { 'class': 'th cbi-section-table-cell' }, _('Paired')),
		E('th', { 'class': 'th cbi-section-table-cell' }, _('Bonded')),
		E('th', { 'class': 'th cbi-section-table-cell' }, _('Connected')),
		E('th', { 'class': 'th cbi-section-table-cell cbi-section-actions' }, _('Actions'))
	]);

	const rows = devices.map(dev => {
		const buttons = getDeviceButtons(dev, view);
		let macCell = E('td', { 'class': 'td cbi-value-field cbi-tooltip-container' }, [ dev.mac ]);
		if (dev.connected && dev.bluealsa) {
			macCell.appendChild(E('span', { 'class': 'cbi-tooltip' }, renderBluealsaTooltip(dev.bluealsa)));
		}

		return E('tr', { 'class': 'tr cbi-section-table-row' }, [
			E('td', { 'class': 'td cbi-value-field' }, dev.name || dev.mac),
			macCell,
			E('td', { 'class': 'td cbi-value-field' }, dev.paired ? _('Yes') : _('No')),
			E('td', { 'class': 'td cbi-value-field' }, dev.bonded ? _('Yes') : _('No')),
			E('td', { 'class': 'td cbi-value-field' }, dev.connected ? _('Yes') : _('No')),
			E('td', { 'class': 'td cbi-section-table-cell nowrap cbi-section-actions' }, E('div', {}, buttons))
		]);
	});

	return E('table', { 'class': 'table cbi-section-table' }, [
		E('thead', { 'class': 'thead cbi-section-thead' }, [ head ]),
		E('tbody', { 'class': 'tbody cbi-section-tbody' }, rows)
	]);
}

function renderAudioDevicesDesktop(devices, view) {
	const head = E('tr', { 'class': 'tr cbi-section-table-titles anonymous' }, [
		E('th', { 'class': 'th cbi-section-table-cell' }, _('Name')),
		E('th', { 'class': 'th cbi-section-table-cell' }, _('MAC Address')),
		E('th', { 'class': 'th cbi-section-table-cell' }, _('Codec')),
		E('th', { 'class': 'th cbi-section-table-cell' }, _('Volume')),
		E('th', { 'class': 'th cbi-section-table-cell' }, _('Delay'))
	]);

	const rows = devices.map(dev => {
		const codecId = `codec-${dev.mac}`;
		const volumeId = `volume-${dev.mac}`;
		const codecSelect = E('select', { 'id': codecId, 'style': 'width: 70px;' });
		if (dev.bluealsa.availableCodecs) {
			dev.bluealsa.availableCodecs.split(' ').forEach(codec => {
				const option = E('option', { 'value': codec }, codec);
				if (codec === dev.bluealsa.selectedCodec) option.selected = 'selected';
				codecSelect.appendChild(option);
			});
		}
		const codecBtn = E('button', { 'class': 'btn cbi-button cbi-button-action', 'style': 'margin-left: 8px;', 'click': ui.createHandlerFn(view, () => setCodec({ mac: dev.mac, codec: document.getElementById(codecId).value })) }, _('Set'));

		const volumeMap = Array.from({ length: 11 }, (_, i) => ({ percent: `${i * 10}%`, value: Math.round(i * 10 * 1.27) }));
		const currentVolume = parseInt(dev.bluealsa.volume.split(' ')[0], 10);
		const closestStep = volumeMap.reduce((prev, curr) => (Math.abs(curr.value - currentVolume) < Math.abs(prev.value - currentVolume) ? curr : prev));
		const volumeSelect = E('select', { 'id': volumeId, 'style': 'width: 70px;' });
		volumeMap.forEach(step => {
			const option = E('option', { 'value': step.value }, step.percent);
			if (step.value === closestStep.value) option.selected = 'selected';
			volumeSelect.appendChild(option);
		});
		const volumeBtn = E('button', { 'class': 'btn cbi-button cbi-button-action', 'style': 'margin-left: 8px;', 'click': ui.createHandlerFn(view, () => setVolume({ mac: dev.mac, volume: parseInt(document.getElementById(volumeId).value, 10) })) }, _('Set'));

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

// --- 移动端渲染 (纯 DIV 卡片) ---
function renderDevicesMobile(devices, view) {
	if (!devices || devices.length === 0) return E('em', {}, _('No devices found.'));

	return E('div', { 'class': 'bt-mobile-cards' }, devices.map(dev => {
		const buttons = getDeviceButtons(dev, view);
		const row = (label, content) => E('div', { 'class': 'bt-card-row' }, [
			E('span', { 'class': 'bt-card-label' }, label),
			E('span', { 'class': 'bt-card-value' }, content)
		]);

		return E('div', { 'class': 'bt-card' }, [
			row(_('Name'), dev.name || dev.mac),
			row(_('MAC Address'), dev.mac),
			row(_('Paired'), dev.paired ? _('Yes') : _('No')),
			row(_('Bonded'), dev.bonded ? _('Yes') : _('No')),
			row(_('Connected'), dev.connected ? _('Yes') : _('No')),
			E('div', { 'class': 'bt-card-actions' }, E('div', { 'class': 'bt-card-btn-group' }, buttons))
		]);
	}));
}

function renderAudioDevicesMobile(devices, view) {
	if (!devices || devices.length === 0) return E('em', {}, _('No audio devices connected.'));

	return E('div', { 'class': 'bt-mobile-cards' }, devices.map(dev => {
		const codecId = `codec-${dev.mac}`;
		const volumeId = `volume-${dev.mac}`;
		
		const codecSelect = E('select', { 'id': codecId });
		if (dev.bluealsa.availableCodecs) {
			dev.bluealsa.availableCodecs.split(' ').forEach(codec => {
				const option = E('option', { 'value': codec }, codec);
				if (codec === dev.bluealsa.selectedCodec) option.selected = 'selected';
				codecSelect.appendChild(option);
			});
		}
		const codecBtn = E('button', { 'class': 'btn cbi-button cbi-button-action', 'click': ui.createHandlerFn(view, () => setCodec({ mac: dev.mac, codec: document.getElementById(codecId).value })) }, _('Set'));

		const volumeMap = Array.from({ length: 11 }, (_, i) => ({ percent: `${i * 10}%`, value: Math.round(i * 10 * 1.27) }));
		const currentVolume = parseInt(dev.bluealsa.volume.split(' ')[0], 10);
		const closestStep = volumeMap.reduce((prev, curr) => (Math.abs(curr.value - currentVolume) < Math.abs(prev.value - currentVolume) ? curr : prev));
		const volumeSelect = E('select', { 'id': volumeId });
		volumeMap.forEach(step => {
			const option = E('option', { 'value': step.value }, step.percent);
			if (step.value === closestStep.value) option.selected = 'selected';
			volumeSelect.appendChild(option);
		});
		const volumeBtn = E('button', { 'class': 'btn cbi-button cbi-button-action', 'click': ui.createHandlerFn(view, () => setVolume({ mac: dev.mac, volume: parseInt(document.getElementById(volumeId).value, 10) })) }, _('Set'));

		const row = (label, content) => E('div', { 'class': 'bt-card-row' }, [
			E('span', { 'class': 'bt-card-label' }, label),
			E('span', { 'class': 'bt-card-value' }, content)
		]);

		return E('div', { 'class': 'bt-card' }, [
			row(_('Name'), dev.name || dev.mac),
			row(_('MAC Address'), dev.mac),
			E('div', { 'class': 'bt-card-section' }, [
				E('div', { 'class': 'bt-card-label' }, _('Codec')),
				E('div', { 'class': 'bt-card-form' }, [ codecSelect, codecBtn ])
			]),
			E('div', { 'class': 'bt-card-section' }, [
				E('div', { 'class': 'bt-card-label' }, _('Volume')),
				E('div', { 'class': 'bt-card-form' }, [ volumeSelect, volumeBtn ])
			]),
			row(_('Delay'), dev.bluealsa.delay ? (dev.bluealsa.delay) : '-')
		]);
	}));
}

return view.extend({
	__status: {},
	_lastDevices: [], 
	_isMobile: false,
	_mediaQueryList: null,

	handleMediaChange(e) {
		this._isMobile = e.matches;
		
		// 局部刷新页面上的列表内容，不再重新渲染整个页面
		const devicesEl = document.getElementById('devices_list');
		if (devicesEl) {
			if (this._isMobile) {
				dom.content(devicesEl, this._lastDevices.length ? renderDevicesMobile(this._lastDevices, this) : E('em', {}, _('No devices found.')));
			} else {
				dom.content(devicesEl, this._lastDevices.length ? renderDevicesDesktop(this._lastDevices, this) : E('em', {}, _('No devices found.')));
			}
		}

		const audioDevicesEl = document.getElementById('audio_devices_list');
		if (audioDevicesEl) {
			const audioDevs = this._lastDevices.filter(dev => dev.connected && dev.bluealsa);
			if (this._isMobile) {
				dom.content(audioDevicesEl, audioDevs.length ? renderAudioDevicesMobile(audioDevs, this) : E('em', {}, _('No audio devices connected.')));
			} else {
				dom.content(audioDevicesEl, audioDevs.length ? renderAudioDevicesDesktop(audioDevs, this) : E('em', {}, _('No audio devices connected.')));
			}
		}
	},

	render(data) {
		const devices = data[0].devices || [];
		this._lastDevices = devices;
		const view = this;

		// 动态创建 link 标签加载外部 CSS
		if (!document.getElementById('bt-custom-css')) {
			const link = document.createElement('link');
			link.id = 'bt-custom-css';
			link.rel = 'stylesheet';
			link.type = 'text/css';
			link.href = L.resource('view/bluetooth/bluetooth.css');
			document.head.appendChild(link);
		}

		// 使用 matchMedia 监听断点，而不是监听 resize
		if (!this._mediaQueryList) {
			this._mediaQueryList = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
			this._isMobile = this._mediaQueryList.matches;
			
			// 兼容旧版浏览器的监听方式
			const listener = (e) => this.handleMediaChange(e);
			if (this._mediaQueryList.addEventListener) {
				this._mediaQueryList.addEventListener('change', listener);
			} else if (this._mediaQueryList.addListener) {
				this._mediaQueryList.addListener(listener);
			}
		}

		poll.add(() => {
			return Promise.all([ getStatus(), getDevices() ]).then(res => {
				const status = res[0];
				const devices = res[1].devices || [];
				view._lastDevices = devices; 

				view.__status = status;
				const statusEl = document.getElementById('service_status');
				if (statusEl) statusEl.innerHTML = renderStatus(status);

				const powerButtonEl = document.getElementById('power_button');
				if (powerButtonEl) {
					powerButtonEl.className = `cbi-button ${status.powered ? 'cbi-button-apply' : 'cbi-button-remove'}`;
					powerButtonEl.innerText = status.powered ? _('Turn Off') : _('Turn On');
				}

				const aliasEl = document.getElementById('adapter_alias');
				if (aliasEl) aliasEl.innerText = `${_('Adapter Alias:')} ${status.alias}`;

				const devicesEl = document.getElementById('devices_list');
				if (devicesEl) {
					if (view._isMobile) {
						dom.content(devicesEl, devices.length ? renderDevicesMobile(devices, view) : E('em', {}, _('No devices found.')));
					} else {
						dom.content(devicesEl, devices.length ? renderDevicesDesktop(devices, view) : E('em', {}, _('No devices found.')));
					}
				}

				const audioDevicesEl = document.getElementById('audio_devices_list');
				if (audioDevicesEl) {
					const audioDevs = devices.filter(dev => dev.connected && dev.bluealsa);
					if (view._isMobile) {
						dom.content(audioDevicesEl, audioDevs.length ? renderAudioDevicesMobile(audioDevs, view) : E('em', {}, _('No audio devices connected.')));
					} else {
						dom.content(audioDevicesEl, audioDevs.length ? renderAudioDevicesDesktop(audioDevs, view) : E('em', {}, _('No audio devices connected.')));
					}
				}
			});
		});

		const powerButton = E('button', {
			'id': 'power_button', 'class': 'cbi-button', 'style': 'margin-right: 8px;',
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
					}, 5000);
				});
			})
		}, _('Scan for Devices'));

		const aliasField = E('input', { 'type': 'text', 'id': 'bt_alias', 'style': 'margin-right: 8px;' });
		const aliasButton = E('button', {
			'class': 'cbi-button',
			'click': ui.createHandlerFn(this, () => {
				const newAlias = document.getElementById('bt_alias').value;
				return setAlias(newAlias).then(() => { return view.load().then(view.render.bind(view)); });
			})
		}, _('Rename Adapter'));

		const deviceTable = E('div', { 'id': 'devices_list' }, E('em', {}, _('Collecting data...')));
		const audioDeviceTable = E('div', { 'id': 'audio_devices_list' }, E('em', {}, _('Collecting data...')));

		return E([], [
			E('h2', {}, _('Bluetooth Management')),
			E('div', { 'class': 'cbi-section' }, [
				E('p', { id: 'adapter_alias' }, _('Adapter Alias: ...')),
				E('p', { id: 'service_status' }, _('Collecting data...')),
				E('div', { 'class': 'bt-header-toolbar', 'style': 'display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; align-items: center; margin-top: 12px;' }, [
					E('div', { 'style': 'white-space: nowrap;' }, [ powerButton, scanButton ]),
					E('div', { 'style': 'display: flex;' }, [ aliasField, aliasButton ])
				])
			]),
			E('div', { 'class': 'cbi-section' }, [ E('h3', {}, _('Discovered & Paired Devices')), deviceTable ]),
			E('div', { 'class': 'cbi-section' }, [ E('h3', {}, _('Connected Audio Devices')), audioDeviceTable ])
		]);
	},

	load() { return Promise.all([ getDevices() ]); },
	handleSaveApply: null, handleSave: null, handleReset: null
});