#!/bin/sh

ALL=$(bluetoothctl devices)
PAIRED=$(bluetoothctl devices Paired)
BONDED=$(bluetoothctl devices Bonded)
TRUSTED=$(bluetoothctl devices Trusted)
CONNECTED=$(bluetoothctl devices Connected)

in_list() {
    echo "$1" | grep -q "$2"
}

echo "{"
echo '  "devices": ['

first=1

echo "$ALL" | grep "^Device" | while read -r line; do
    mac=$(echo "$line" | awk '{print $2}')
    name=$(echo "$line" | cut -d' ' -f3-)

    paired=false
    bonded=false
    trusted=false
    connected=false

    in_list "$PAIRED" "$mac" && paired=true
    in_list "$BONDED" "$mac" && bonded=true
    in_list "$TRUSTED" "$mac" && trusted=true
    in_list "$CONNECTED" "$mac" && connected=true

    if [ $first -eq 0 ]; then
        echo ","
    fi
    first=0

    printf '    {\n'
    printf '      "mac": "%s",\n' "$mac"
    printf '      "name": "%s",\n' "$name"
    printf '      "paired": %s,\n' "$paired"
    printf '      "bonded": %s,\n' "$bonded"
    printf '      "trusted": %s,\n' "$trusted"
    printf '      "connected": %s\n' "$connected"
    printf '    }'
done

echo ""
echo '  ]'
echo "}"
