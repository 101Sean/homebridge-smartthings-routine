const axios = require('axios');
let Service, Characteristic, Accessory, uuid;

module.exports = (api) => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    Accessory      = api.platformAccessory;
    uuid           = api.hap.uuid;

    // Dynamic platform registration
    api.registerPlatform(
        'homebridge-smartthings-routine',  // must match package.json name
        'StRoutinePlatform',
        StRoutinePlatform,
        true
    );
};

class StRoutinePlatform {
    constructor(log, config, api) {
        this.log        = log;
        this.name       = config.name;
        this.routineId  = config.routineId;
        this.token      = config.token;
        this.switchName = config.switchName || 'Run Routine';
        this.api        = api;

        if (!this.name || !this.routineId || !this.token) {
            throw new Error('name, routineId, token are required');
        }

        this.api.on('didFinishLaunching', () => {
            this.publishBridgeAndSwitch();
        });
    }

    publishBridgeAndSwitch() {
        // Create a Bridge accessory
        const bridgeUUID = uuid.generate(this.name);
        const bridgeAcc  = new Accessory(this.name, bridgeUUID);
        bridgeAcc.category = this.api.hap.Categories.BRIDGE;
        bridgeAcc
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, 'RoutineBridge');

        // Create a Switch accessory for the routine
        const switchUUID = uuid.generate(this.switchName);
        const switchAcc  = new Accessory(this.switchName, switchUUID);
        switchAcc.category = this.api.hap.Categories.SWITCH;

        const svc = new Service.Switch(this.switchName);
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
                    this.log.info(`Executed routine: ${this.switchName}`);
                } catch (err) {
                    this.log.error(`Error executing ${this.switchName}`, err);
                    throw new this.api.hap.HapStatusError(
                        this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                    );
                } finally {
                    svc.updateCharacteristic(Characteristic.On, false);
                }
            })
            .onGet(() => false);
        switchAcc.addService(svc);

        // Publish both bridge and switch as External Accessories
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine',
            [bridgeAcc, switchAcc]
        );

        this.log.info(`Published bridge and switch: ${this.name}`);
    }

    configureAccessory() {}
}