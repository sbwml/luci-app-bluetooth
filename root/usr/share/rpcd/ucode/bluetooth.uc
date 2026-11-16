#!/usr/bin/env ucode

'use strict';

import { chmod, chown, dirname, glob, open, popen, readfile, realpath, rename, rmdir, stat, unlink } from 'fs';
import { task } from 'uloop';

const shellquote = (s) => {
	return `'${replace(s, "'", "'\\''")}'`;
};

const run_btctl = (command) => {
	try {
		const cmd_str = `bluetoothctl ${command} 2>&1`;
		const handle = popen(cmd_str, 'r');
		if (!handle) return null;

		let output = handle.read("all");
		handle.close();

		return output;
	}
	catch (e) {
		return null;
	}
};

const power_policy = (config, is_on) => {
	const setting = `AutoEnable=${is_on ? 'true' : 'false'}`;
	const updated = [];
	let in_policy = false;
	let policy_start = -1;
	let replaced = false;

	for (let line in split(config, '\n')) {
		const section = match(line, /^\s*\[([^]]+)\]\s*$/);
		if (section) {
			in_policy = section[1] === 'Policy';
			if (in_policy && policy_start < 0)
				policy_start = length(updated) + 1;
		}

		if (in_policy && match(line, /^\s*AutoEnable\s*=/)) {
			if (!replaced)
				push(updated, setting);
			replaced = true;
		} else {
			push(updated, line);
		}
	}

	if (!replaced) {
		if (policy_start >= 0)
			splice(updated, policy_start, 0, setting);
		else
			push(updated, '[Policy]', setting, '');
	}

	return join('\n', updated);
};

const save_power_policy = (is_on) => {
	const config = realpath('/etc/bluetooth/main.conf');
	const metadata = config && stat(config);
	if (!metadata)
		return false;

	const original = readfile(config);
	if (original === null)
		return false;

	const updated = power_policy(original, is_on);
	if (updated === original)
		return true;

	const mktemp = popen(`mktemp -d ${shellquote(dirname(config) + '/.luci-bluetooth-XXXXXX')}`, 'r');
	if (!mktemp)
		return false;

	const directory = trim(mktemp.read('all') ?? '');
	if (mktemp.close() !== 0 || !directory)
		return false;

	const temporary = `${directory}/main.conf`;
	const file = open(temporary, 'w');
	const written = file?.write(updated);
	const closed = file?.close();
	const saved = written === length(updated) && closed &&
		chown(temporary, metadata.uid, metadata.gid) && chmod(temporary, metadata.mode) &&
		rename(temporary, config);

	if (!saved)
		unlink(temporary);
	rmdir(directory);

	return !!saved;
};

let power_pending = false;

const methods = {
	get_status: {
		call: function() {
			const output = run_btctl('show');
			if (!output) {
				return {
					controller: 'Unknown',
					powered: false,
					name: 'Unknown',
					alias: 'Unknown',
					discoverable: false,
					pairable: false,
					discovering: false
				};
			}

			const parse_value = (regex) => {
				const m = match(output, regex);
				return m ? trim(m[1]) : null;
			};

			const parse_bool = (regex) => {
				const val = parse_value(regex);
				return val === 'yes';
			};

			return {
				controller: parse_value(/Controller\s+([0-9A-F:]+)/) || 'Unknown',
				powered: parse_bool(/Powered:\s*([a-z]+)/),
				name: parse_value(/Name:\s*([^\n]+)/) || 'Unknown',
				alias: parse_value(/Alias:\s*([^\n]+)/) || 'Unknown',
				discoverable: parse_bool(/Discoverable:\s*([a-z]+)/),
				pairable: parse_bool(/Pairable:\s*([a-z]+)/),
				discovering: parse_bool(/Discovering:\s*([a-z]+)/)
			};
		}
	},

	get_devices: {
		call: function() {
			try {
				const handle = popen('/usr/libexec/bluetooth/bt_device.sh', 'r');
				if (!handle) {
					return { devices: [] };
				}

				const output = handle.read('all');
				handle.close();

				if (!output) {
					return { devices: [] };
				}

				try {
					const result = json(output);

					if (result && result.devices) {
						return result;
					} else {
						return { devices: [] };
					}
				} catch (e) {
					return { devices: [] };
				}
			}
			catch (e) {
				return { devices: [] };
			}
		}
	},

	set_power: {
		args: { on: 0, remember: false },
		call: function(req) {
			if (power_pending)
				return { success: false };

			const val = req.args.on;
			const is_on = (val === true || val === 1 || val === "1" || val === "true" || val === "on");
			const remember = req.args.remember;
			const worker = task(() => {
				if (system(['/usr/bin/bluetoothctl', 'power', is_on ? 'on' : 'off'], 3000) !== 0)
					return { success: false };

				// BlueZ applies AutoEnable to every controller.
				if (remember) {
					const adapters = filter(glob('/sys/class/bluetooth/hci[0-9]*') ?? [],
						path => match(path, /\/hci[0-9]+$/));
					if (length(adapters) === 1)
						return { success: true, saved: save_power_policy(is_on) };
				}

				return { success: true };
			}, result => {
				power_pending = false;
				req.reply(result ?? { success: false });
			});

			power_pending = !!worker;
			return worker ? req.defer() : { success: false };
		}
	},

	start_scan: {
		args: { on: 0 },
		call: function(req) {
			const val = req.args.on;
			const is_on = (val === true || val === 1 || val === "1" || val === "true" || val === "on");
			const cmd = is_on ? '--timeout 5 scan on' : 'scan off';
			run_btctl(cmd);
			return { success: true };
		}
	},

	pair: {
		args: { mac: 'string' },
		call: function(req) {
			if (!req.args.mac) {
				return { success: false, error: 'MAC address required' };
			}

			const cmd = `unbuffer /usr/libexec/bluetooth/bt_pair_exp.sh ${shellquote(req.args.mac)}`;

			try {
				const handle = popen(cmd, 'r');
				if (!handle) {
					return { success: false, error: 'Failed to execute pairing script.' };
				}

				handle.read('all');
				handle.close();

				return { success: true };

			} catch (e) {
				return { success: false, error: 'Exception while running pairing script.', details: e.message };
			}
		}
	},

	connect: {
		args: { mac: 'string' },
		call: function(req) {
			if (!req.args.mac) return { success: false, error: 'MAC address required' };
			run_btctl(`connect ${shellquote(req.args.mac)}`);
			return { success: true };
		}
	},

	disconnect: {
		args: { mac: 'string' },
		call: function(req) {
			if (!req.args.mac) return { success: false, error: 'MAC address required' };
			run_btctl(`disconnect ${shellquote(req.args.mac)}`);
			return { success: true };
		}
	},

	remove_device: {
		args: { mac: 'string' },
		call: function(req) {
			try {
				if (!req.args.mac) {
					return { success: false, error: 'MAC address required' };
				}

				run_btctl(`remove ${shellquote(req.args.mac)}`);

				return { success: true };

			} catch (e) {
				return { success: false, error: 'Exception while removing device.', details: e };
			}
		}
	},

	set_alias: {
		args: { alias: 'string' },
		call: function(req) {
			if (!req.args.alias) return { success: false, error: 'Alias required' };
			run_btctl(`system-alias ${shellquote(req.args.alias)}`);
			return { success: true };
		}
	},

	set_codec: {
		args: { data: {} },
		call: function(req) {
			try {
				if (!req.args.data) {
					return { success: false, error: 'Invalid request: "data" object is missing.' };
				}

				const mac = req.args.data.mac;
				const codec = req.args.data.codec;

				if (!mac) return { success: false, error: 'MAC address required in data object.' };
				if (!codec) return { success: false, error: 'Codec required in data object.' };

				const bluealsa_mac = replace(mac, /:/g, '_');
				const bluealsa_path = `/org/bluealsa/hci0/dev_${bluealsa_mac}/a2dpsrc/sink`;
				const cmd = `bluealsactl codec ${shellquote(bluealsa_path)} ${shellquote(codec)} 2>&1`;

				const handle = popen(cmd, 'r');
				if (!handle) {
					return { success: false, error: 'Failed to execute command via popen.' };
				}

				const output = handle.read('all');
				handle.close();

				if (output && trim(output).length > 0) {
					return { success: false, error: 'Command execution failed.', details: trim(output) };
				}

				return { success: true };
			} catch (e) {
				return { success: false, error: 'An unexpected exception occurred.', details: e.message };
			}
		}
	},

	set_volume: {
		args: { data: {} },
		call: function(req) {
			try {
				if (!req.args.data) {
					return { success: false, error: 'Invalid request: "data" object is missing.' };
				}

				const mac = req.args.data.mac;
				const volume = req.args.data.volume;

				if (!mac) {
					return { success: false, error: 'MAC address required in data object.' };
				}

				if (volume == null) {
					return { success: false, error: 'Volume required in data object.' };
				}

				const bluealsa_mac = replace(mac, /:/g, '_');
				const bluealsa_path = `/org/bluealsa/hci0/dev_${bluealsa_mac}/a2dpsrc/sink`;
				const cmd = `bluealsactl volume ${shellquote(bluealsa_path)} ${volume} 2>&1`;

				const handle = popen(cmd, 'r');
				if (!handle) {
					return { success: false, error: 'Failed to execute command via popen.' };
				}

				const output = handle.read('all');
				handle.close();

				if (output && trim(output).length > 0) {
					return { success: false, error: 'Command execution failed.', details: trim(output) };
				}

				return { success: true };
			} catch (e) {
				return { success: false, error: 'An unexpected exception occurred.', details: e.message };
			}
		}
	}
};

return { 'luci.bluetooth': methods };
