const axios = require('axios');
let Service, Characteristic, Bridge, Accessory, uuid;

module.exports = (api) => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    Bridge         = api.hap.Bridge;
    Accessory      = api.platformAccessory;
    uuid           = api.hap.uuid;

    api.registerPlatform(
        'homebridge-smartthings-routine',
        'StRoutinePlatform',
        StRoutinePlatform,
        true
    );
};

class StRoutinePlatform {
    constructor(log, config, api) {
        this.log       = log;
        this.name      = config.name;
        this.routineId = config.routineId;
        this.token     = config.token;
        this.api       = api;

        if (!this.name || !this.routineId || !this.token) {
            throw new Error('Missing required config: name, routineId, token');
        }

        this.api.on('didFinishLaunching', () => {
            this.publishBridgeWithRoutine();
        });
    }

    publishBridgeWithRoutine() {
        const bridgeName = this.name;
        const bridgeUUID = uuid.generate(bridgeName);

        // 1) Create actual HAP Bridge
        const bridge = new Bridge(bridgeName, bridgeUUID);
        bridge
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, 'RoutineBridge');

        // 2) Create TV accessory for the routine
        const routineName = `${bridgeName} Routine`;
        const routineUUID = uuid.generate(routineName);
        const tvAccessory = new Accessory(routineName, routineUUID);
        tvAccessory.category = this.api.hap.Categories.TV;

        // Television service for routine execution
        const tvService = new Service.Television(routineName, 'tvService');
        tvService.setCharacteristic(Characteristic.ConfiguredName, routineName)
            .setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

        tvService.getCharacteristic(Characteristic.Active)
            .onSet(async (value) => {
                if (value !== Characteristic.Active.ACTIVE) return;
                try {
                    await axios.post(
                        `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                        {},
                        { headers: { Authorization: `Bearer ${this.token}` } }
                    );
                    this.log.info(`Executed routine: ${routineName}`);
                } catch (err) {
                    this.log.error(`Error executing routine: ${routineName}`, err);
                    throw new this.api.hap.HapStatusError(
                        this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                    );
                } finally {
                    tvService.updateCharacteristic(Characteristic.Active, Characteristic.Active.INACTIVE);
                }
            })
            .onGet(() => Characteristic.Active.INACTIVE);

        // Optional: add speaker for volume UI
        /*
        const speakerService = new Service.TelevisionSpeaker(routineName + ' Speaker', 'tvSpeaker');
        speakerService.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
            .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
        speakerService.getCharacteristic(Characteristic.VolumeSelector)
            .onSet((direction) => {
                // volume up or down, implement if needed
            });

        tvAccessory.addService(tvService);
        tvAccessory.addService(speakerService);
         */

        // 3) Attach routine accessory to bridge
        bridge.addBridgedAccessory(tvAccessory);

        // 4) Publish external Bridge (which includes the routine accessory)
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine',
            [bridge]
        );

        this.log.info(`Published Bridge and Routine accessory: ${bridgeName}`);
    }

    configureAccessory() {
        // no-op
    }
}