const axios = require('axios');
let Service, Characteristic, Bridge, Accessory, uuid;

module.exports = (api) => {
    Service = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    Bridge = api.hap.Bridge;
    Accessory = api.platformAccessory;
    uuid = api.hap.uuid;

    // Register as dynamic (true) platform
    api.registerPlatform(
        'homebridge-smartthings-routine',
        'StRoutinePlatform',
        StRoutinePlatform,
        true
    );
};

class StRoutinePlatform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.name = config.name;
        this.routineId = config.routineId;
        this.token = config.token;

        if (!this.token || this.token.trim() === '') {
            throw new Error('SmartThings API token is required in config');
        }

        // Delay publishing until Homebridge is fully launched
        this.api.on('didFinishLaunching', () => {
            this.publishBridge();
        });
    }

    publishBridge() {
        const bridgeName = this.name;
        const bridgeUUID = uuid.generate(bridgeName);
        this.bridge = new Bridge(bridgeName, bridgeUUID);

        // Set Bridge information
        this.bridge
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, 'RoutineBridge');

        // External Bridge publishing
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine',
            [this.bridge]
        );

        // Create Routine accessory under Bridge
        const accUUID = uuid.generate(`${bridgeName}-${this.routineId}`);
        const accessory = new Accessory(bridgeName, accUUID);
        accessory.category = this.api.hap.Categories.TV;

        // TV-icon switch service
        const service = new Service.Switch(this.name);
        service
            .getCharacteristic(Characteristic.On)
            .onSet(this.handleOnSet.bind(this, service))
            .onGet(() => false);

        accessory.addService(service);

        // Attach accessory to Bridge
        this.bridge.addBridgedAccessory(accessory);

        this.log.info(`[StRoutinePlatform] Published Bridge & accessory: ${bridgeName}`);
    }

    async handleOnSet(service, value) {
        if (!value) return;
        try {
            await axios.post(
                `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                {},
                { headers: { Authorization: `Bearer ${this.token}` } }
            );
            this.log.info(`[StRoutinePlatform] Executed routine ${this.name}`);
        } catch (err) {
            this.log.error(`[StRoutinePlatform] Failed to execute routine ${this.name}`, err);
            throw new this.api.hap.HapStatusError(
                this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
            );
        } finally {
            // reset switch
            service.updateCharacteristic(Characteristic.On, false);
        }
    }

    configureAccessory() {
        // no-op for dynamic platform
    }
}