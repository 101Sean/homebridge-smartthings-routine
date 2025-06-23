const axios = require('axios');
let Service, Characteristic, Bridge, Accessory, uuid;

module.exports = (api) => {
    Service = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    Bridge = api.hap.Bridge;
    Accessory = api.platformAccessory;
    uuid = api.hap.uuid;

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
        this.name = config.name;
        this.routineId = config.routineId;
        this.token = config.token;
        this.api = api;

        if (!this.name || !this.routineId || !this.token) {
            throw new Error('Missing required config: name, routineId, token');
        }

        this.api.on('didFinishLaunching', () => {
            this.publishBridgeAndAccessory();
        });
    }

    publishBridgeAndAccessory() {
        const name = this.name;
        const bridgeUUID = uuid.generate(name);

        // Create external Bridge as a PlatformAccessory
        const bridgeAccessory = new Accessory(name, bridgeUUID);
        bridgeAccessory.category = this.api.hap.Categories.BRIDGE;
        bridgeAccessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, 'RoutineBridge');

        // Create Routine switch accessory
        const accUUID = uuid.generate(`${name}-${this.routineId}`);
        const routineAccessory = new Accessory(name, accUUID);
        routineAccessory.category = this.api.hap.Categories.TV;

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
                    this.log.info(`Executed routine: ${name}`);
                } catch (err) {
                    this.log.error(`Error executing routine: ${name}`, err);
                    throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
                } finally {
                    svc.updateValue(false);
                }
            })
            .onGet(() => false);
        routineAccessory.addService(svc);

        // Publish both bridge and routine accessory
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine',
            [bridgeAccessory, routineAccessory]
        );

        this.log.info(`Published Bridge and Routine accessory: ${name}`);
    }

    configureAccessory() {}
}
