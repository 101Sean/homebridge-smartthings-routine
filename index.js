// index.js
const axios = require('axios');
let Service, Characteristic, Bridge, Accessory, uuid;

module.exports = (api) => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    Bridge         = api.hap.Bridge;
    Accessory      = api.platformAccessory;
    uuid           = api.hap.uuid;

    // pluginIdentifier를 package.json name과 동일하게!
    api.registerPlatform(
        'homebridge-smartthings-routine',  // ← package.json name
        'StRoutinePlatform',
        StRoutinePlatform,
        true
    );
};

class StRoutinePlatform {
    constructor(log, config, api) {
        this.log       = log;
        this.name      = config.name;       // ex. "Good Morning Bridge"
        this.routineId = config.routineId;  // SmartThings sceneId
        this.token     = config.token;      // SmartThings token
        this.api       = api;

        if (!this.name || !this.routineId || !this.token) {
            throw new Error('name, routineId, token 모두 설정해 주세요');
        }

        // Homebridge 완전 기동 후 발행
        this.api.on('didFinishLaunching', () => this.publishSubBridge());
    }

    publishSubBridge() {
        // 1) 하위 브리지 생성
        const bridgeUUID = uuid.generate(this.name);
        const subBridge  = new Bridge(this.name, bridgeUUID);
        subBridge
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, 'RoutineBridge');

        // 2) TV 액세서리 생성 (전원 버튼)
        const tvName      = `${this.name} Routine`;
        const tvUUID      = uuid.generate(tvName);
        const tvAccessory = new Accessory(tvName, tvUUID);
        tvAccessory.category = this.api.hap.Categories.TV;

        const tvService = new Service.Television(tvName, 'tvService');
        tvService
            .setCharacteristic(Characteristic.ConfiguredName, tvName)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            );

        tvService.getCharacteristic(Characteristic.Active)
            .onSet(async (v) => {
                if (v !== Characteristic.Active.ACTIVE) return;
                try {
                    await axios.post(
                        `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                        {}, { headers: { Authorization: `Bearer ${this.token}` } }
                    );
                    this.log.info(`Executed routine: ${tvName}`);
                } catch (e) {
                    this.log.error(`Error executing: ${tvName}`, e);
                    throw new this.api.hap.HapStatusError(
                        this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                    );
                } finally {
                    // 버튼처럼 매번 누를 수 있도록 자동 reset
                    tvService.updateCharacteristic(
                        Characteristic.Active,
                        Characteristic.Active.INACTIVE
                    );
                }
            })
            .onGet(() => Characteristic.Active.INACTIVE);

        tvAccessory.addService(tvService);

        // 3) TV 액세서리를 하위 브리지에 붙이기
        subBridge.addBridgedAccessory(tvAccessory);

        // 4) 오직 하위 브리지(Child Bridge)만 External Accessory로 공개
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine',  // ← pluginIdentifier
            [ subBridge ]
        );

        this.log.info(`Published Sub-Bridge and its TV accessory: ${this.name}`);
    }

    configureAccessory() {
        // no-op
    }
}
