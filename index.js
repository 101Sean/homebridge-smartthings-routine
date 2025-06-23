const axios = require('axios');
let Service, Characteristic, Bridge, Accessory;

module.exports = (api) => {
    Service = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    Bridge = api.hap.Bridge;
    Accessory = api.platformAccessory;
    api.registerPlatform(
        'homebridge-smartthings-routine',
        'StRoutinePlatform',
        StRoutinePlatform
    );
};

class StRoutinePlatform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;

        // Create a new Bridge instance
        const bridgeName = config.name;
        const bridgeUUID = api.hap.uuid.generate(bridgeName);
        this.bridge = new Bridge(bridgeName, bridgeUUID);

        // Set Bridge information
        this.bridge
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, 'RoutineBridge');

        // Publish as external Bridge to generate its own QR/pin
        api.publishExternalAccessories(
            'homebridge-smartthings-routine',
            [this.bridge]
        );

        // Create the Routine accessory under this Bridge
        const accUUID = api.hap.uuid.generate(`${bridgeName}-${config.routineId}`);
        const accessory = new Accessory(config.name, accUUID);
        accessory.category = api.hap.Categories.TV;

        // TV-icon switch service
        const service = new Service.Switch(config.name);
        service
            .getCharacteristic(Characteristic.On)
            .onSet(async (value) => {
                if (!value) return;
                try {
                    await axios.post(
                        `https://api.smartthings.com/v1/scenes/${config.routineId}/execute`,
                        {},
                        { headers: { Authorization: `Bearer ${config.token}` } }
                    );
                    log.info(`[StRoutine] Executed routine ${config.name}`);
                } catch (err) {
                    log.error(`[StRoutine] Failed to execute routine ${config.name}`, err);
                    throw new api.hap.HapStatusError(
                        api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                    );
                } finally {
                    service.updateCharacteristic(Characteristic.On, false);
                }
            })
            .onGet(() => false);

        accessory.addService(service);

        // Attach to Bridge
        this.bridge.addBridgedAccessory(accessory);

        log.info(`[StRoutinePlatform] Published Bridge & accessory: ${bridgeName}`);
    }

    // Required for dynamic platforms
    configureAccessory() {
        // no-op
    }
}
