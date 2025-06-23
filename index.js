// index.js
const axios = require('axios')

let Service, Characteristic, Bridge, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    Bridge         = api.hap.Bridge
    uuid           = api.hap.uuid

    api.registerPlatform(
        'homebridge-smartthings-routine',
        'StRoutinePlatform',
        StRoutinePlatform,
        true
    )
}

class StRoutinePlatform {
    constructor(log, config, api) {
        this.log   = log
        this.name  = config.name
        this.token = config.token
        this.api   = api

        if (!this.name || !this.token) {
            throw new Error('name, token are required')
        }

        this.api.on('didFinishLaunching', () => this.initAccessories())
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

        // 2) 모든 Scene → TV 아이콘 액세서리로 추가
        scenes.forEach(scene => {
            const displayName = (scene.name || '').trim() || `Routine ${scene.sceneId}`
            const accUUID     = uuid.generate(scene.sceneId)

            // 반드시 this.api.platformAccessory 사용
            const tvAcc = new this.api.platformAccessory(displayName, accUUID)
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
                            tvSvc.updateCharacteristic(
                                Characteristic.Active,
                                Characteristic.Active.INACTIVE
                            )
                        }
                    }
                    cb()
                })

            tvAcc.addService(tvSvc)
            childBridge.addBridgedAccessory(tvAcc)
        })

        // 3) HomeKit에 child bridge 게시
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine',
            [ childBridge ]
        )
        this.log.info(
            `Published child bridge "${this.name}" with ${scenes.length} TV routines`
        )
    }

    configureAccessory() {}  // no-op
}
