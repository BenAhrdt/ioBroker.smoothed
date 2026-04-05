'use strict';
const lodash = require('lodash');

const { DeviceManagement } = require('@iobroker/dm-utils');

/**
 * DeviceManager Class
 */
class GridVisDeviceManagement extends DeviceManagement {
    /**
     * Initialize Class with Adapter
     *
     * @param adapter Adapter Reference
     */
    constructor(adapter) {
        super(adapter);
        this.adapter = adapter;
    }

    /**
     * List all devices
     *
     * @param context Context of loadDevices
     */
    async loadDevices(context) {
        context.setTotalDevices(Object.keys(this.adapter.objectStore.devices).length);
        const sortedDevices = Object.fromEntries(
            Object.entries(this.adapter.objectStore.devices).sort(([, a], [, b]) => {
                const nameA = a.object?.common?.name?.toLowerCase() || '';
                const nameB = b.object?.common?.name?.toLowerCase() || '';
                return nameA.localeCompare(nameB);
            }),
        );
        for (const [deviceId, deviceValue] of Object.entries(sortedDevices)) {
            const identifier = deviceValue.object.common.desc;
            const channel = this.adapter.activeChannels[deviceValue.object.common.name];
            const res = {
                id: deviceId,
                identifier:
                    identifier < 27
                        ? identifier
                        : `${identifier.substring(0, 13)} ... ${identifier.substring(identifier.length - 13)}`,
                name: channel.name,
                hasDetails: true,
                color: 'white',
                backgroundColor: channel ? 'primary' : 'black',
                icon: `/adapter/${this.adapter.name}/${channel.type}.png`,
            };
            res.customInfo = {
                id: deviceId,
                schema: {
                    type: 'panel',
                    items: {},
                },
            };
            let value = deviceValue['smoothed'];
            let card = {
                name: ' Gefiltert',
            };
            card = lodash.merge(card, value.object.native?.card);
            let preLabel = card.preLabel ?? '';
            let label = '';
            if (card.name) {
                label = card.name;
            } else if (card.label) {
                label = card.label;
            } else {
                label = value.object._id.substring(value.object._id.lastIndexOf('.') + 1);
            }
            res.customInfo.schema.items[`_${value.object._id}`] = {
                type: 'state',
                oid: value.object._id,
                foreign: true,
                control: 'number',
                label: preLabel + label,
                digits: card.digits ?? 1,
            };

            card = {
                name: ' Rohwert',
            };
            card = lodash.merge(card, value.object.native?.card);
            preLabel = card.preLabel ?? '';
            label = '';
            if (card.name) {
                label = card.name;
            } else if (card.label) {
                label = card.label;
            } else {
                label = channel.id.substring(channel.id.lastIndexOf('.') + 1);
            }
            res.customInfo.schema.items[`_${channel.id}`] = {
                type: 'state',
                oid: channel.id,
                foreign: true,
                control: 'number',
                label: preLabel + label,
                digits: card.digits ?? 1,
            };

            const items = res.customInfo.schema.items;

            const sortedEntries = Object.entries(items).sort(([, a], [, b]) => {
                return a.label.localeCompare(b.label, 'de');
            });

            // 2. Array → Objekt
            res.customInfo.schema.items = Object.fromEntries(sortedEntries);
            context.addDevice(res);
        }
    }

    /**
     * @param {string} id ID from device
     * @returns {Promise<import('@iobroker/dm-utils').DeviceDetails>} return the right value
     */
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    async getDeviceDetails(id) {
        // eslint-disable-next-line jsdoc/check-tag-names
        /** @type {Record<string, import('@iobroker/dm-utils').ConfigItemAny>} */
        const sourceItems = {};
        // eslint-disable-next-line jsdoc/check-tag-names
        /** @type {Record<string, import('@iobroker/dm-utils').ConfigItemAny>} */
        const deviceObjectItems = {};
        const data = {};

        sourceItems[`Header`] = {
            newLine: true,
            type: 'header',
            text: `sourceStates`,
            size: 3,
        };
        // Replace
        const usedId = this.adapter.objectStore.devices[id].object.common.desc;
        sourceItems[`source`] = {
            newLine: true,
            type: 'state',
            control: 'number',
            label: usedId,
            oid: usedId,
            foreign: true,
        };

        // Devices Object
        deviceObjectItems['DeviceObjectHeader'] = {
            newLine: true,
            type: 'header',
            text: 'DeviceObject',
            size: 3,
        };
        deviceObjectItems['DeviceObject'] = {
            type: 'text',
            readOnly: true,
            minRows: 30,
            maxRows: 30,
        };
        data.DeviceObject = JSON.stringify(this.adapter.objectStore.devices[id], null, 2);

        // eslint-disable-next-line jsdoc/check-tag-names
        /** @type {import('@iobroker/dm-utils').JsonFormSchema} */
        const schema = {
            type: 'tabs',
            tabsStyle: {
                minWidth: 850,
            },
            items: {},
        };
        schema.items.sourceItems = {
            type: 'panel',
            label: 'sourceStates',
            items: sourceItems,
        };
        schema.items.deviceObtectItems = {
            type: 'panel',
            label: 'deviceObject',
            items: deviceObjectItems,
        };
        // return the schema
        return { id, schema, data };
    }
}

module.exports = GridVisDeviceManagement;
