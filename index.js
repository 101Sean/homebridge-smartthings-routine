const axios = require('axios')
let Service, Characteristic, Bridge, Accessory, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    Bridge         = api.hap.Bridge
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
        this.name       = config.name       // Bridge Name
        this.routineId  = config.routineId  // SmartThings Scene ID
        this.token      = config.token      // SmartThings API Token
        this.switchName = config.switchName || 'Run Routine'
        this.api        = api

        if (!this.name || !this.routineId || !this.token) {
            throw new Error('name, routineId, token are required')
        }

        this.api.on('didFinishLaunching', () => {
            this.publishChildBridge()
        })
    }

    publishChildBridge() {
        // 1) Child Bridge 생성
        const bridgeUUID  = uuid.generate(this.name)
        const childBridge = new Bridge(this.name, bridgeUUID)
        childBridge
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, 'RoutineTVBridge')

        // 2) TV 액세서리 생성
        const tvUUID = uuid.generate(this.switchName)
        const tvAcc  = new Accessory(this.switchName, tvUUID)
        tvAcc.category = this.api.hap.Categories.TELEVISION

        // 3) TV 서비스 설정
        const tvSvc = new Service.Television(this.switchName)
        tvSvc
            .setCharacteristic(Characteristic.ConfiguredName, this.switchName)
            .setCharacteristic(
                Characteristic.SleepDiscoveryMode,
                Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
            )

        // Active 특성(on/off)만 구현
        tvSvc.getCharacteristic(Characteristic.Active)
            .onGet(() => {
                // 항상 OFF로 보여줌 (토글 후 자동 리셋)
                return Characteristic.Active.INACTIVE
            })
            .onSet(async (value, callback) => {
                if (value === Characteristic.Active.ACTIVE) {
                    try {
                        await axios.post(
                            `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                            {},
                            { headers: { Authorization: `Bearer ${this.token}` } }
                        )
                        this.log.info(`Executed TV power routine: ${this.switchName}`)
                    } catch (err) {
                        this.log.error(`Error executing TV routine`, err)
                        throw new this.api.hap.HapStatusError(
                            this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                        )
                    } finally {
                        // 버튼 상태 리셋
                        tvSvc.updateCharacteristic(
                            Characteristic.Active,
                            Characteristic.Active.INACTIVE
                        )
                    }
                }
                callback()
            })

        tvAcc.addService(tvSvc)
        childBridge.addBridgedAccessory(tvAcc)

        // 4) 외부 브릿지로 게시
        this.api.publishExternalAccessories(
            'homebridge-smartthings-childbridge',
            [childBridge]
        )
        this.log.info(`Published child Bridge and TV: ${this.name}`)
    }

    configureAccessory() {
        // no-op
    }
}