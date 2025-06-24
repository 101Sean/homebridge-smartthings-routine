// index.js
const axios = require('axios')

let Service, Characteristic, Bridge, Accessory, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    Bridge         = api.hap.Bridge
    Accessory      = api.hap.Accessory       // 👈 hap.Accessory 사용
    uuid           = api.hap.uuid

    api.registerPlatform(
        'homebridge-smartthings-routine',     // package.json name
        'StRoutinePlatform',                  // 플랫폼 식별자
        StRoutinePlatform,
        true
    )
}

class StRoutinePlatform {
    constructor(log, config, api) {
        this.log   = log
        this.name  = config.name  || 'SmartThings Routines'
        this.token = config.token
        this.api   = api

        if (!this.token) throw new Error('token is required')

        this.api.on('didFinishLaunching', () => this.initAccessories())
    }

    async initAccessories() {
        let scenes = []
        try {
            const res = await axios.get(
                'https://api.smartthings.com/v1/scenes',
                { headers: { Authorization: `Bearer ${this.token}` } }
            )
            scenes = res.data.items
        } catch (e) {
            this.log.error('Failed to fetch SmartThings scenes', e)
            return
        }

        // 1) child Bridge 생성
        const bridgeUUID  = uuid.generate(this.name)
        const childBridge = new Bridge(this.name, bridgeUUID)
        childBridge.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model,        'RoutineBridge')

        // 2) 각 scene → TV / Fan / Dehumidifier / Switch 액세서리로 추가
        scenes.forEach(scene => {
            const name     = (scene.sceneName||'').trim() || scene.sceneId
            const iconCode = String(scene.sceneIcon)

            let svc, category
            if (iconCode === '204') {
                svc      = new Service.Television(name)
                category = this.api.hap.Categories.TELEVISION
                svc.setCharacteristic(Characteristic.ConfiguredName, name)
                    .setCharacteristic(
                        Characteristic.SleepDiscoveryMode,
                        Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
                    )
            }
            else if (iconCode === '211') {
                svc      = new Service.Fan(name)
                category = this.api.hap.Categories.FAN
                svc.setCharacteristic(Characteristic.ConfiguredName, name)
            }
            else if (iconCode === '212') {
                svc      = new Service.HumidifierDehumidifier(name)
                category = this.api.hap.Categories.HUMIDIFIERDEHUMIDIFIER
                svc.setCharacteristic(Characteristic.ConfiguredName, name)
            }
            else {
                svc      = new Service.Switch(name)
                category = this.api.hap.Categories.SWITCH
                svc.setCharacteristic(Characteristic.ConfiguredName, name)
            }

            // 단일 전원 토글
            const isOnOff  = svc instanceof Service.Switch || svc instanceof Service.Fan
            const charType = isOnOff ? Characteristic.On : Characteristic.Active

            svc.getCharacteristic(charType)
                .onGet(() => isOnOff ? false : Characteristic.Active.INACTIVE)
                .onSet(async (v, cb) => {
                    const trig = isOnOff
                        ? v === true
                        : v === Characteristic.Active.ACTIVE

                    if (trig) {
                        try {
                            await axios.post(
                                `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,
                                {}, { headers: { Authorization: `Bearer ${this.token}` } }
                            )
                            this.log.info(`Executed scene: ${name}`)
                        } catch (err) {
                            this.log.error(`Error executing ${name}`, err)
                            return cb(new Error('SERVICE_COMMUNICATION_FAILURE'))
                        } finally {
                            svc.updateCharacteristic(
                                charType,
                                isOnOff ? false : Characteristic.Active.INACTIVE
                            )
                        }
                    }
                    cb()
                })

            // hap.Accessory 인스턴스로 생성 → linkAccessory 에러 없음
            const acc = new Accessory(name, uuid.generate(scene.sceneId))
            acc.category = category
            acc.addService(svc)
            childBridge.addBridgedAccessory(acc)
        })

        // 3) child Bridge 게시
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine',
            [ childBridge ]
        )
        this.log.info(`Published child bridge "${this.name}" with ${scenes.length} routines`)
    }

    configureAccessory() {}  // no-op
}
