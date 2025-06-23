// index.js
const axios = require('axios');
let Service, Characteristic;

module.exports = (api) => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    api.registerAccessory(
        'homebridge-smartthings-routine',  // package.json name 과 일치
        'StRoutine',                       // config.json 의 accessory: "StRoutine"
        StRoutine
    );
};

class StRoutine {
    constructor(log, config, api) {
        this.log       = log;
        this.name      = config.name;
        this.routineId = config.routineId;
        this.token     = config.token;
        this.api       = api;

        if (!this.name || !this.routineId || !this.token) {
            throw new Error('name, routineId, token은 필수입니다.');
        }

        // Television 서비스 하나만 노출
        this.tvService = new Service.Television(this.name, 'tvService');
        this.tvService
            .setCharacteristic(Characteristic.ConfiguredName, this.name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            );

        this.tvService
            .getCharacteristic(Characteristic.Active)
            .onSet(async (value) => {
                if (value !== Characteristic.Active.ACTIVE) return;
                try {
                    await axios.post(
                        `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                        {}, { headers: { Authorization: `Bearer ${this.token}` } }
                    );
                    this.log.info(`Executed routine: ${this.name}`);
                } catch (e) {
                    this.log.error(`Error executing routine ${this.name}`, e);
                    throw new this.api.hap.HapStatusError(
                        this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                    );
                } finally {
                    // 버튼처럼 누를 수 있게 다시 끔
                    this.tvService.updateCharacteristic(
                        Characteristic.Active,
                        Characteristic.Active.INACTIVE
                    );
                }
            })
            .onGet(() => Characteristic.Active.INACTIVE);
    }

    getServices() {
        return [this.tvService];
    }
}
