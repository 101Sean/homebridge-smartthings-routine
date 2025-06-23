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

        // Accessory 정보 서비스
        this.infoService = new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model,        'TVRoutineAccessory')

        // TV 서비스: 오직 Active 특성만 구현
        this.tvService = new Service.Television(this.name)
        this.tvService
            .setCharacteristic(Characteristic.ConfiguredName, this.name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            )

        this.tvService.getCharacteristic(Characteristic.Active)
            .onGet(this.handleGetActive.bind(this))
            .onSet(this.handleSetActive.bind(this))
    }

    handleGetActive() {
        // 항상 INACTIVE 로 반환 → 버튼처럼 동작
        return Characteristic.Active.INACTIVE
    }

    async handleSetActive(value) {
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
                // HomeKit에 오류 상태 전파
                throw new Error('SERVICE_COMMUNICATION_FAILURE')
            } finally {
                // 토글 후 즉시 INACTIVE 로 리셋
                this.tvService.updateCharacteristic(
                    Characteristic.Active,
                    Characteristic.Active.INACTIVE
                )
            }
        }
    }

    getServices() {
        return [ this.infoService, this.tvService ]
    }
}
