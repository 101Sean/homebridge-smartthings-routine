const axios = require('axios');
let Service, Characteristic, Bridge, Accessory, uuid;

module.exports = (api) => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    Bridge         = api.hap.Bridge;
    Accessory      = api.platformAccessory;
    uuid           = api.hap.uuid;

    // dynamic platform 으로 등록(true)
    api.registerPlatform(
        'homebridge-smartthings-subbridge',
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
        this.token     = config.token;
        this.api       = api;

        if (!this.name || !this.routineId || !this.token) {
            throw new Error('name, routineId, token 모두 필수입니다');
        }

        // Homebridge 기동 완료 후 발행
        this.api.on('didFinishLaunching', () => this.publishSubBridge());
    }

    publishSubBridge() {
        // 1) 하위 브리지 객체 생성
        const bridgeUUID = uuid.generate(this.name);
        const subBridge = new Bridge(this.name, bridgeUUID);
        subBridge
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, 'RoutineSubBridge');

        // 2) 루틴용 TV 액세서리 생성
        const tvName = `${this.name} Routine`;
        const tvUUID = uuid.generate(tvName);
        const tvAccessory = new Accessory(tvName, tvUUID);
        tvAccessory.category = this.api.hap.Categories.TV;

        // Television 서비스 — 전원 버튼 UI
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

        // 4) 메인 브리지에 외부 브리지로 발행
        this.api.publishExternalAccessories(
            'homebridge-smartthings-subbridge',
            [subBridge]
        );

        this.log.info(`Published Sub-Bridge and TV accessory: ${this.name}`);
    }

    configureAccessory() {
        // no-op
    }
}
