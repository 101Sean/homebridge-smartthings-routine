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
        this.name      = config.name;
        this.routineId = config.routineId;
        this.token     = config.token;
        this.api       = api;

        if (!this.name || !this.routineId || !this.token) {
            throw new Error('name, routineId, token은 필수 항목입니다.');
        }

        this.api.on('didFinishLaunching', () => {
            this.publishBridgeWithTelevision();
        });
    }

    publishBridgeWithTelevision() {
        const bridgeName = this.name;
        const bridgeUUID = uuid.generate(bridgeName);

        // 1) Bridge 액세서리 생성
        const bridgeAccessory = new Bridge(bridgeName, bridgeUUID);
        bridgeAccessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, 'RoutineBridge');

        // 2) Routine용 TV 액세서리 생성
        const tvName = `${bridgeName} Routine`;
        const tvUUID = uuid.generate(tvName);
        const tvAccessory = new Accessory(tvName, tvUUID);
        tvAccessory.category = this.api.hap.Categories.TELEVISION;

        // Television 서비스 추가
        const tvService = new Service.Television(tvName, 'tvService');
        tvService
            .setCharacteristic(Characteristic.ConfiguredName, tvName)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            );

        // 전원 버튼(Active) 핸들러
        tvService.getCharacteristic(Characteristic.Active)
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
                    this.log.error(`Error executing routine: ${tvName}`, err);
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

        // 3) Bridge에 TV 액세서리 연결
        bridgeAccessory.addBridgedAccessory(tvAccessory);

        // 4) External Bridge 퍼블리시
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine',
            [bridgeAccessory]
        );

        this.log.info(`Published Bridge and TV accessory: ${bridgeName}`);
    }

    configureAccessory() {
        // no-op
    }
}
