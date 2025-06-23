const axios = require('axios');
let Service, Characteristic, Bridge, Accessory, uuid;

module.exports = (api) => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    Bridge         = api.hap.Bridge;
    Accessory      = api.platformAccessory;
    uuid           = api.hap.uuid;

    // Register as dynamic platform
    api.registerPlatform(
        'homebridge-smartthings-childbridge', // package.json name
        'StRoutinePlatform',                  // platform identifier
        StRoutinePlatform,
        true
    );
};

class StRoutinePlatform {
    constructor(log, config, api) {
        this.log        = log;
        this.name       = config.name;       // Bridge Name
        this.routineId  = config.routineId;  // SmartThings Scene ID
        this.token      = config.token;      // SmartThings API Token
        this.switchName = config.switchName || 'Run Routine';
        this.api        = api;

        if (!this.name || !this.routineId || !this.token) {
            throw new Error('name, routineId, token are required');
        }

        this.api.on('didFinishLaunching', () => {
            this.publishChildBridge();
        });
    }

    publishChildBridge() {
        // Create child Bridge
        const bridgeUUID = uuid.generate(this.name);
        const childBridge = new Bridge(this.name, bridgeUUID);
        childBridge
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, 'RoutineChildBridge');

        // Create Switch accessory
        const switchUUID = uuid.generate(this.switchName);
        const switchAcc = new Accessory(this.switchName, switchUUID);
        switchAcc.category = this.api.hap.Categories.SWITCH;

        const switchSvc = new Service.Switch(this.switchName);
        switchSvc
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
                    switchSvc.updateCharacteristic(Characteristic.On, false);
                }
            })
            .onGet(() => false);
        switchAcc.addService(switchSvc);

        // Attach switch to Bridge
        childBridge.addBridgedAccessory(switchAcc);

        // Publish only the child Bridge
        this.api.publishExternalAccessories(
            'homebridge-smartthings-childbridge',
            [childBridge]
        );

        this.log.info(`Published child Bridge and switch: ${this.name}`);
    }

    configureAccessory() {
        // no-op
    }
}
