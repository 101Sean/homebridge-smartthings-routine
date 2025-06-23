// index.js
const axios = require('axios');
let Service, Characteristic;

module.exports = (api) => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    api.registerAccessory(
        'homebridge-smartthings-routine',
        'StRoutine',
        StRoutine
    );
};

class StRoutine {
    constructor(log, config) {
        this.log       = log;
        this.name      = config.name;
        this.routineId = config.routineId;
        this.token     = config.token;

        if (!this.name || !this.routineId || !this.token) {
            throw new Error('name, routineId, token 모두 설정해 주세요');
        }

        // TV 아이콘 + 전원 버튼 UI
        this.tvService = new Service.Television(this.name, 'tvService');
        this.tvService
            .setCharacteristic(Characteristic.ConfiguredName, this.name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            );

        // Active 특성으로 단발성 실행
        this.tvService
            .getCharacteristic(Characteristic.Active)
            .onSet(async (value) => {
                if (value !== Characteristic.Active.ACTIVE) return;
                try {
                    await axios.post(
                        `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                        {},
                        { headers: { Authorization: `Bearer ${this.token}` } }
                    );
                    this.log.info(`Executed routine: ${this.name}`);
                } catch (e) {
                    this.log.error(`Error executing ${this.name}`, e);
                    throw new this.api.hap.HapStatusError(
                        this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                    );
                } finally {
                    // 다시 INACTIVE로 리셋
                    this.tvService.updateCharacteristic(
                        Characteristic.Active,
                        Characteristic.Active.INACTIVE
                    );
                }
            })
            .onGet(() => Characteristic.Active.INACTIVE);
    }

    getServices() {
        return [ this.tvService ];
    }
}