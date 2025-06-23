const axios = require('axios');
let Service, Characteristic, Bridge, Accessory, uuid;

module.exports = (api) => {
    Service = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    Bridge = api.hap.Bridge;
    Accessory = api.platformAccessory;
    uuid = api.hap.uuid;

    api.registerPlatform('homebridge-smartthings-routine', 'StRoutinePlatform', StRoutinePlatform, true);
};

class StRoutinePlatform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;

        this.name = config.name;
        this.routineId = config.routineId;
        this.token = config.token;

        if (!this.name || !this.routineId || !this.token) {
            throw new Error('name, routineId, token must be provided in config');
        }

        // Delay until Homebridge fully launches
        this.api.on('didFinishLaunching', () => this.publish());
    }

    publish() {
        const name = this.name;
        const bridgeUUID = uuid.generate(name);

        // Create PlatformAccessory to act as VPN Bridge
        const bridgeAccessory = new Accessory(name, bridgeUUID);
        bridgeAccessory.category = this.api.hap.Categories.BRIDGE;
        bridgeAccessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, 'RoutineBridge');

        // Publish this accessory as an external Bridge
        this.api.publishExternalAccessories('homebridge-smartthings-routine', [bridgeAccessory]);

        // Create child accessory under the Bridge
        const childUUID = uuid.generate(`${name}-${this.routineId}`);
        const childAccessory = new Accessory(name, childUUID);
        childAccessory.category = this.api.hap.Categories.TV;

        // Add TV-icon switch service
        const svc = new Service.Switch(name);
        svc
            .getCharacteristic(Characteristic.On)
            .onSet(async (value) => {
                if (!value) return;
                try {
                    await axios.post(
                        `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                        {},
                        { headers: { Authorization: `Bearer ${this.token}` } }
                    );
                    this.log.info(`Executed ${name}`);
                } catch (e) {
                    this.log.error(`Error executing ${name}`, e);
                    throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
                } finally {
                    svc.updateCharacteristic(Characteristic.On, false);
                }
            })
            .onGet(() => false);
        childAccessory.addService(svc);

        // Attach child to the published Bridge
        bridgeAccessory.addBridgedAccessory(childAccessory);
        this.log.info(`Published Bridge and accessory: ${name}`);
    }

    configureAccessory() {}
}
