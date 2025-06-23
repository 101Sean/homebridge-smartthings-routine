// index.js
const axios = require('axios')
let Service, Characteristic, Accessory, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    Accessory      = api.platformAccessory
    uuid           = api.hap.uuid

    api.registerPlatform(
        'homebridge-smartthings-routine', // package.json name
        'StRoutinePlatform',              // platform identifier
        StRoutinePlatform,
        true
    )
}

class StRoutinePlatform {
    constructor(log, config, api) {
        this.log        = log
        this.name       = config.name       // 홈브릿지 상 표시 이름
        this.routineId  = config.routineId  // SmartThings Scene ID
        this.token      = config.token      // SmartThings API Token
        this.switchName = config.switchName || 'Run Routine'
        this.api        = api

        if (!this.name || !this.routineId || !this.token) {
            throw new Error('name, routineId, token are required')
        }

        this.api.on('didFinishLaunching', () => {
            this.publishAccessory()
        })
    }

    publishAccessory() {
        // 1) PlatformAccessory 생성
        const uuidVal = uuid.generate(this.name)
        const tvAcc   = new Accessory(this.name, uuidVal)

        // 2) 카테고리 TV 로 설정 (아이콘)
        tvAcc.category = this.api.hap.Categories.TELEVISION

        // 3) AccessoryInformation 서비스 설정
        tvAcc.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model,        'RoutineTV')

        // 4) TV 서비스(전원만) 설정
        const tvSvc = new Service.Television(this.name)
        tvSvc
            .setCharacteristic(Characteristic.ConfiguredName, this.name)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            )

        tvSvc.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.INACTIVE)
            .onSet(async (value, callback) => {
                if (value === Characteristic.Active.ACTIVE) {
                    try {
                        await axios.post(
                            `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                            {},
                            { headers: { Authorization: `Bearer ${this.token}` } }
                        )
                        this.log.info(`Executed TV routine: ${this.name}`)
                    } catch (err) {
                        this.log.error(`Error executing TV routine`, err)
                        throw new this.api.hap.HapStatusError(
                            this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                        )
                    } finally {
                        // 버튼 리셋
                        tvSvc.updateCharacteristic(
                            Characteristic.Active,
                            Characteristic.Active.INACTIVE
                        )
                    }
                }
                callback()
            })

        tvAcc.addService(tvSvc)

        // 5) 외부 액세서리로 게시
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine',
            [ tvAcc ]
        )
        this.log.info(`Published TV accessory: ${this.name}`)
    }

    configureAccessory() {
        // no-op
    }
}
