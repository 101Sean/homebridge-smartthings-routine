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

        // Create Routine TV accessory (전원 버튼만)
        const accUUID = uuid.generate(`${name}-${this.routineId}`);
        const tvAccessory = new Accessory(name, accUUID);
        tvAccessory.category = this.api.hap.Categories.TELEVISION;
        // TV 서비스
        const tvService = new Service.Television(name, 'tvService');
        // 이름 설정
        tvService.setCharacteristic(Characteristic.ConfiguredName, name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            );
        // 전원 버튼(Active) 핸들러
        tvService.getCharacteristic(Characteristic.Active)
            .onSet(async (value) => {
                if (value !== Characteristic.Active.ACTIVE) return;
                // 루틴 실행
                await axios.post(
                    `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                    {}, { headers: { Authorization: `Bearer ${this.token}` } }
                );
                // 버튼 누른 뒤에는 다시 Inactive 로 리셋
                tvService.updateCharacteristic(Characteristic.Active, Characteristic.Active.INACTIVE);
            }).onGet(() => Characteristic.Active.INACTIVE);
        tvAccessory.addService(tvService);

        // Publish both bridge and routine accessory
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine',
            [bridgeAccessory, tvAccessory]
        );

        this.log.info(`Published Bridge and Routine accessory: ${name}`);
    }

    configureAccessory() {}
}
