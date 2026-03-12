# luci-app-bluetooth

A LuCI application for managing Bluetooth devices on OpenWrt.

## Features

This application provides a web interface within LuCI to manage your device's Bluetooth adapter and connected devices.

- **Adapter Control**:
  - Turn the Bluetooth adapter on or off.
  - View and change the adapter's alias.

- **Device Management**:
  - Scan for nearby Bluetooth devices.
  - View a list of available and paired devices, including their MAC address, name, and status (Paired, Bonded, Trusted, Connected).
  - Pair with new devices.
  - Connect to and disconnect from paired devices.
  - Remove (unpair) existing devices.

## Dependencies

The device pairing functionality, handled by the `root/usr/libexec/bluetooth/bt_pair_exp.sh` script, requires the `expect` package to automate interactions with the `bluetoothctl` utility. 

For OpenWrt, the `expect` package can be obtained from [this repository](https://github.com/sbwml/package_new_expect).

## Technical Overview

-   **Frontend**: The user interface is a single-page application built with JavaScript, located under `htdocs/luci-static/resources/view/bluetooth/`.
-   **Backend**: The backend logic is implemented in `ucode` and is located at `root/usr/share/rpcd/ucode/bluetooth.uc`. It exposes RPC methods that the frontend consumes.
-   **Core Logic**: The backend primarily acts as a wrapper around the standard `bluetoothctl` command-line tool to perform Bluetooth operations. Helper scripts in `root/usr/libexec/bluetooth/` are used for more complex tasks like device enumeration and pairing.
