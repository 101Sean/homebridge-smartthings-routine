// index.js
const axios = require('axios')

let Service, Characteristic, Bridge, Accessory, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    Bridge         = api.hap.Bridge
    Accessory      = api.hap.Accessory         // ← 변경: platformAccessory → hap.Accessory
    uuid           = api.hap.uuid

    api.registerPlatform(
        'homebridge-smartthings-routine',       // package.json name
        'StRoutinePlatform',                    // platform identifier
        StRoutinePlatform,
        true
    )
}

class StRoutinePlatform {
    constructor(log, config, api) {
        this.log   = log
        this.name  = config.name       // Child Bridge 이름
        this.token = config.token      // SmartThings API 토큰
        this.api   = api

        if (!this.name || !this.token) {
            throw new Error('name, token are required')
        }

        this.api.on('didFinishLaunching', () => {
            this.initAccessories()
        })
    }

    async initAccessories() {
        let scenes
        try {
            const res = await axios.get(
                'https://api.smartthings.com/v1/scenes',
                { headers: { Authorization: `Bearer ${this.token}` } }
            )
            scenes = res.data.items
        } catch (err) {
            this.log.error('Failed to fetch SmartThings scenes', err)
            return
        }

        // 1) Child Bridge 생성
        const bridgeUUID  = uuid.generate(this.name)
        const childBridge = new Bridge(this.name, bridgeUUID)
        childBridge.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model,        'RoutineBridge')

        // 2) 모든 Scene → TV 액세서리로 추가
        scenes.forEach(scene => {
            // 빈 이름은 ID로 대체
            const displayName = (scene.name || '').trim() || `Routine ${scene.sceneId}`
            const accUUID     = uuid.generate(scene.sceneId)

            // 여기서 꼭 api.hap.Accessory 사용
            const tvAcc = new Accessory(displayName, accUUID)
            tvAcc.category = this.api.hap.Categories.TELEVISION

            const tvSvc = new Service.Television(displayName)
            tvSvc
                .setCharacteristic(Characteristic.ConfiguredName, displayName)
                .setCharacteristic(
                    Characteristic.SleepDiscoveryMode,
                    Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
                )

            tvSvc.getCharacteristic(Characteristic.Active)
                .onGet(() => Characteristic.Active.INACTIVE)
                .onSet(async (value, cb) => {
                    if (value === Characteristic.Active.ACTIVE) {
                        try {
                            await axios.post(
                                `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,
                                {},
                                { headers: { Authorization: `Bearer ${this.token}` } }
                            )
                            this.log.info(`Executed scene: ${displayName}`)
                        } catch (err) {
                            this.log.error(`Error executing ${displayName}`, err)
                            throw new this.api.hap.HapStatusError(
                                this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                            )
                        } finally {
                            // 눌렀다 떼는 버튼처럼 리셋
                            tvSvc.updateCharacteristic(
                                Characteristic.Active,
                                Characteristic.Active.INACTIVE
                            )
                        }
                    }
                    cb()
                })

            tvAcc.addService(tvSvc)
            childBridge.addBridgedAccessory(tvAcc)   // ← 이제 에러 없이 동작합니다
        })

        // 3) HomeKit에 Child Bridge로 게시
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine',       // package.json name
            [ childBridge ]
        )
        this.log.info(
            `Published child bridge "${this.name}" with ${scenes.length} TV routines`
        )
    }

    configureAccessory() {}  // no-op
}
