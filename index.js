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
        this.log       = log;
        this.name      = config.name;       // ex. "Good Morning"
        this.routineId = config.routineId;  // SmartThings sceneId
        this.token     = config.token;
        this.api       = api;

        if (!this.name || !this.routineId || !this.token) {
            throw new Error('name, routineId, token 모두 설정해 주세요');
        }

        // Homebridge가 완전히 기동된 뒤에 호출
        this.api.on('didFinishLaunching', () => this.publishBridge());
    }

    publishBridge() {
        // 1) Bridge 생성 (HAP Bridge 객체)
        const bridgeUUID = uuid.generate(this.name);
        const bridge = new Bridge(this.name, bridgeUUID);
        bridge
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, 'RoutineBridge');

        // 2) TV 액세서리 생성
        const tvName = `${this.name} Routine`;
        const tvUUID = uuid.generate(tvName);
        const tvAccessory = new Accessory(tvName, tvUUID);
        tvAccessory.category = this.api.hap.Categories.TV;

        // 3) Television 서비스 추가
        const tvService = new Service.Television(tvName, 'tvService');
        tvService
            .setCharacteristic(Characteristic.ConfiguredName, tvName)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            );
        tvService
            .getCharacteristic(Characteristic.Active)
            .onSet(async v => {
                if (v !== Characteristic.Active.ACTIVE) return;
                try {
                    await axios.post(
                        `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                        {}, { headers: { Authorization: `Bearer ${this.token}` } }
                    );
                    this.log.info(`Executed routine: ${tvName}`);
                } catch (e) {
                    this.log.error(`Error executing ${tvName}`, e);
                    throw new this.api.hap.HapStatusError(
                        this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                    );
                } finally {
                    tvService.updateCharacteristic(
                        Characteristic.Active,
                        Characteristic.Active.INACTIVE
                    );
                }
            })
            .onGet(() => Characteristic.Active.INACTIVE);

        tvAccessory.addService(tvService);

        // 4) 브리지에 TV 액세서리 붙이기
        bridge.addBridgedAccessory(tvAccessory);

        // 5) Bridge 만 External Accessory 로 공개
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine',
            [ bridge ]
        );

        this.log.info(`Published Bridge and its TV accessory: ${this.name}`);
    }

    configureAccessory() {}
}
