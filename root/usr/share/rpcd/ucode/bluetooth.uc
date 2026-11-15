#!/usr/bin/env ucode

'use strict';

import { popen } from 'fs';
import { task } from 'uloop';

const shellquote = (s) => {
	return `'${replace(s, "'", "'\\''")}'`;
};

const operation_result = (result) => {
	if (result?.code == 0)
		return { success: true };

	return {
		success: false,
		error: result?.code == 124 || result?.code == -9 ? 'Bluetooth command timed out.' : 'Bluetooth command failed.',
		details: trim(result?.stdout || '')
	};
};

const run_command = (req, seconds, command, args, response) => {
	const format = response ?? operation_result;
	// Wait for the command in a child process so the shared rpcd loop can keep serving LuCI.
	const worker = task(() => {
		const argv = join(' ', map([command, ...args], shellquote));
		const handle = popen(`exec /usr/libexec/timeout-coreutils -k 1 ${seconds} ${argv}`, 'r');
		if (!handle)
			return null;
		const stdout = handle.read('all');
		return { stdout, code: handle.close() };
	}, (result) => req.reply(format(result)));

	return worker ? req.defer() : format(null);
};

const run_btctl = (req, args, seconds, response) =>
	run_command(req, seconds ?? 3, '/usr/bin/bluetoothctl', args, response);

const methods = {
	get_status: {
		call: function(req) {
			return run_btctl(req, ['show'], 3, (result) => {
				const output = result?.code == 0 ? result.stdout || '' : '';
				const parse_value = (regex) => {
					const found = match(output, regex);
					return found ? trim(found[1]) : null;
				};

				return {
					controller: parse_value(/Controller\s+([0-9A-F:]+)/) || 'Unknown',
					powered: parse_value(/Powered:\s*([a-z]+)/) === 'yes',
					name: parse_value(/Name:\s*([^\n]+)/) || 'Unknown',
					alias: parse_value(/Alias:\s*([^\n]+)/) || 'Unknown',
					discoverable: parse_value(/Discoverable:\s*([a-z]+)/) === 'yes',
					pairable: parse_value(/Pairable:\s*([a-z]+)/) === 'yes',
					discovering: parse_value(/Discovering:\s*([a-z]+)/) === 'yes'
				};
			});
		}
	},

	get_devices: {
		call: function(req) {
			return run_command(req, 3, '/usr/libexec/bluetooth/bt_device.sh', [], (result) => {
				if (result?.code == 0 && result.stdout) {
					try {
						const parsed = json(result.stdout);
						if (parsed?.devices)
							return parsed;
					} catch (e) {}
				}

				return { devices: [] };
			});
		}
	},

	set_power: {
		args: { on: 0 },
		call: function(req) {
			const val = req.args.on;
			const is_on = (val === true || val === 1 || val === '1' || val === 'true' || val === 'on');
			return run_btctl(req, ['power', is_on ? 'on' : 'off']);
		}
	},

	start_scan: {
		args: { on: 0 },
		call: function(req) {
			const val = req.args.on;
			const is_on = (val === true || val === 1 || val === '1' || val === 'true' || val === 'on');
			return is_on ? run_btctl(req, ['--timeout', '5', 'scan', 'on'], 7) : run_btctl(req, ['scan', 'off']);
		}
	},

	pair: {
		args: { mac: 'string' },
		call: function(req) {
			if (!req.args.mac)
				return { success: false, error: 'MAC address required' };
			return run_command(req, 25, '/usr/bin/expect', ['/usr/libexec/bluetooth/bt_pair_exp.sh', req.args.mac]);
		}
	},

	connect: {
		args: { mac: 'string' },
		call: function(req) {
			if (!req.args.mac)
				return { success: false, error: 'MAC address required' };
			return run_btctl(req, ['connect', req.args.mac], 15);
		}
	},

	disconnect: {
		args: { mac: 'string' },
		call: function(req) {
			if (!req.args.mac)
				return { success: false, error: 'MAC address required' };
			return run_btctl(req, ['disconnect', req.args.mac]);
		}
	},

	remove_device: {
		args: { mac: 'string' },
		call: function(req) {
			if (!req.args.mac)
				return { success: false, error: 'MAC address required' };
			return run_btctl(req, ['remove', req.args.mac]);
		}
	},

	set_alias: {
		args: { alias: 'string' },
		call: function(req) {
			if (!req.args.alias)
				return { success: false, error: 'Alias required' };
			return run_btctl(req, ['system-alias', req.args.alias]);
		}
	},

	set_codec: {
		args: { data: {} },
		call: function(req) {
			const mac = req.args.data?.mac;
			const codec = req.args.data?.codec;
			if (!mac || !codec)
				return { success: false, error: 'MAC and codec required' };
			const path = `/org/bluealsa/hci0/dev_${replace(mac, /:/g, '_')}/a2dpsrc/sink`;
			return run_command(req, 3, '/usr/bin/bluealsactl', ['codec', path, `${codec}`]);
		}
	},

	set_volume: {
		args: { data: {} },
		call: function(req) {
			const mac = req.args.data?.mac;
			const volume = req.args.data?.volume;
			if (!mac || volume == null)
				return { success: false, error: 'MAC and volume required' };
			const path = `/org/bluealsa/hci0/dev_${replace(mac, /:/g, '_')}/a2dpsrc/sink`;
			return run_command(req, 3, '/usr/bin/bluealsactl', ['volume', path, `${volume}`]);
		}
	}
};

return { 'luci.bluetooth': methods };
