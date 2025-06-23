const axios = require('axios');
let Service, Characteristic;

module.exports = (api) => {
    Service = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    api.registerAccessory('homebridge-smartthings-routine', 'StRoutine', StRoutine);
};

class StRoutine {
    constructor(log, config, api) {
        this.log       = log;
        this.name      = config.name;
        this.routineId = config.routineId;
        // Token from config or environment
        this.token     = config.token && config.token.trim() !== ''
            ? config.token
            : process.env.SMARTTHINGS_TOKEN;
        if (!this.token) throw new Error('SmartThings API token must be provided');

        this.api       = api;

        // TV category switch
        this.service = new Service.Switch(this.name);
        this.service
            .getCharacteristic(Characteristic.On)
            .onSet(this.handleOnSet.bind(this))
            .onGet(() => false);

        log.info(`[StRoutineTv] ${this.name} initialized`);
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
            this.log.info(`[StRoutineTv] Executed routine ${this.name}`);
        } catch (err) {
            this.log.error(`[StRoutineTv] Failed to execute routine ${this.name}`, err);
            throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        } finally {
            // reset switch
            this.service.updateCharacteristic(Characteristic.On, false);
        }
    }
}` `