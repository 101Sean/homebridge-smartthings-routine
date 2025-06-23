const axios = require('axios');
let Service, Characteristic;

module.exports = (api) => {
    Service = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    api.registerAccessory('homebridge-smartthings-routine','StRoutine',StRoutine);
};

class StRoutine {
    constructor(log, config, api) {
        this.log       = log;
        this.name      = config.name;
        this.routineId = config.routineId;
        this.token     = config.token;

        if (!this.token || this.token.trim() === '') {
            throw new Error('SmartThings API token is required in config');
        }

        this.api       = api;

        // TV icon switch service
        this.service = new Service.Switch(this.name);
        this.service
            .getCharacteristic(Characteristic.On)
            .onSet(this.handleOnSet.bind(this))
            .onGet(() => false);

        this.log.info(`[StRoutine] Initialized accessory: ${this.name}`);
    }

    getAccessoryCategory() {
        return this.api.hap.Categories.TV;
    }

    getServices() {
        return [this.service];
    }

    async handleOnSet(value) {
        if (!value) return;
        try {
            await axios.post(
                `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                {},
                { headers: { Authorization: `Bearer ${this.token}` } }
            );
            this.log.info(`[StRoutine] Executed routine: ${this.name}`);
        } catch (err) {
            this.log.error(`[StRoutine] Failed to execute routine: ${this.name}`, err);
            throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        } finally {
            // reset switch to off
            this.service.updateCharacteristic(Characteristic.On, false);
        }
    }
}
