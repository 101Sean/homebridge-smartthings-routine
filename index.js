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
            throw new Error('name, routineId, token 모두 설정이 필요합니다.');
        }

        // Publish after Homebridge startup
        this.api.on('didFinishLaunching', () => this.publishAccessory());
    }

    publishAccessory() {
        const tvName = this.name;
        const tvUUID = uuid.generate(tvName);

        // Create a real TV accessory
        const tvAccessory = new Accessory(tvName, tvUUID);
        tvAccessory.category = this.api.hap.Categories.TV;

        // Set accessory info
        tvAccessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, 'RoutineButton');

        // Add Television service for power button
        const tvService = new Service.Television(tvName, 'tvService');
        tvService
            .setCharacteristic(Characteristic.ConfiguredName, tvName)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            );

        // Handle power (Active)
        tvService
            .getCharacteristic(Characteristic.Active)
            .onSet(async (value) => {
                if (value !== Characteristic.Active.ACTIVE) return;
                try {
                    await axios.post(
                        `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                        {},
                        { headers: { Authorization: `Bearer ${this.token}` } }
                    );
                    this.log.info(`Executed routine: ${tvName}`);
                } catch (err) {
                    this.log.error(`Routine 실행 오류: ${tvName}`, err);
                    throw new this.api.hap.HapStatusError(
                        this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                    );
                } finally {
                    // reset to inactive so button can be pressed again
                    tvService.updateCharacteristic(
                        Characteristic.Active,
                        Characteristic.Active.INACTIVE
                    );
                }
            })
            .onGet(() => Characteristic.Active.INACTIVE);

        tvAccessory.addService(tvService);

        // Publish as a standalone external accessory (Bridge wrapper not needed)
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine',
            [tvAccessory]
        );

        this.log.info(`Published TV-accessory: ${tvName}`);
    }

    configureAccessory() {}
}
