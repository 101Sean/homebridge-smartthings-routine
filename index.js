// index.js
const axios = require('axios')

let Service, Characteristic, uuid

module.exports = (homebridge) => {
    Service        = homebridge.hap.Service
    Characteristic = homebridge.hap.Characteristic
    uuid           = homebridge.hap.uuid

    homebridge.registerAccessory(
        'homebridge-smartthings-routine',
        'TVRoutineAccessory',
        TVRoutineAccessory
    )
}

class TVRoutineAccessory {
    constructor(log, config) {
        this.log       = log
        this.name      = config.name
        this.routineId = config.routineId
        this.token     = config.token

        if (!this.name || !this.routineId || !this.token) {
            throw new Error('name, routineId, token are required')
        }

        // 정보 서비스
        this.infoService = new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model,        'TVRoutineAccessory')

        // TV 서비스: 오직 전원(Active)만
        this.tvService = new Service.Television(this.name)
        this.tvService
            .setCharacteristic(Characteristic.ConfiguredName, this.name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            )
            .getCharacteristic(Characteristic.Active)
            .on('get', this.handleGetActive.bind(this))
            .on('set', this.handleSetActive.bind(this))
    }

    handleGetActive(callback) {
        // 항상 OFF로 보여줌 (토글 후 자동 리셋)
        callback(null, Characteristic.Active.INACTIVE)
    }

    async handleSetActive(value, callback) {
        if (value === Characteristic.Active.ACTIVE) {
            try {
                await axios.post(
                    `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                    {},
                    { headers: { Authorization: `Bearer ${this.token}` } }
                )
                this.log.info(`Executed TV routine: ${this.name}`)
            } catch (err) {
                this.log.error('Error executing TV routine', err)
                return callback(new Error('SERVICE_COMMUNICATION_FAILURE'))
            } finally {
                // HomeKit 버튼 리셋
                this.tvService.updateCharacteristic(
                    Characteristic.Active,
                    Characteristic.Active.INACTIVE
                )
            }
        }
        callback()
    }

    getServices() {
        return [ this.infoService, this.tvService ]
    }
}
