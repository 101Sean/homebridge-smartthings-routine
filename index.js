// index.js
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
            this.publishChildBridge();
        });
    }

    publishChildBridge() {
        const bridgeUUID  = uuid.generate(this.name);
        const childBridge = new Bridge(this.name, bridgeUUID);
        childBridge.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model,        'RoutineTVBridge');

        const tvUUID = uuid.generate(this.switchName);
        const tvAcc  = new Accessory(this.switchName, tvUUID);
        tvAcc.category = this.api.hap.Categories.TELEVISION;

        const tvSvc = new Service.Television(this.switchName);
        tvSvc
            .setCharacteristic(Characteristic.ConfiguredName, this.switchName)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            );

        tvSvc.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.INACTIVE)
            .onSet(async (value, callback) => {
                if (value === Characteristic.Active.ACTIVE) {
                    try {
                        await axios.post(
                            `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                            {},
                            { headers: { Authorization: `Bearer ${this.token}` } }
                        );
                        this.log.info(`Executed TV routine: ${this.switchName}`);
                    } catch (err) {
                        this.log.error(`Error executing TV routine`, err);
                        throw new this.api.hap.HapStatusError(
                            this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                        );
                    } finally {
                        tvSvc.updateCharacteristic(
                            Characteristic.Active,
                            Characteristic.Active.INACTIVE
                        );
                    }
                }
                callback();
            });

        tvAcc.addService(tvSvc);
        childBridge.addBridgedAccessory(tvAcc);

        this.api.publishExternalAccessories(
            'homebridge-smartthings-childbridge',
            [ childBridge ]
        );
        this.log.info(`Published child bridge and TV: ${this.name}`);
    }

    configureAccessory() { /* no-op */ }
}
