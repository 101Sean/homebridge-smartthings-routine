const axios = require('axios')

let Service, Characteristic, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
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
        this.token = config.token
        this.api   = api

        if (!this.token) {
            throw new Error('token is required')
        }

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

        const accessories = scenes.map(scene => {
            const name     = (scene.sceneName || '').trim() || scene.sceneId
            const iconCode = String(scene.sceneIcon)

            // 1) 서비스·카테고리 결정
            let svc, category
            if (iconCode === '204') {
                svc      = new Service.Television(name)
                category = this.api.hap.Categories.TELEVISION
                svc
                    .setCharacteristic(Characteristic.ConfiguredName, name)
                    .setCharacteristic(
                        Characteristic.SleepDiscoveryMode,
                        Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
                    )
            }
            else if (iconCode === '211') {
                svc      = new Service.Fan(name)
                category = this.api.hap.Categories.FAN
                svc.setCharacteristic(Characteristic.Name, name)
            }
            else if (iconCode === '212') {
                svc      = new Service.HumidifierDehumidifier(name)
                category = this.api.hap.Categories.HUMIDIFIERDEHUMIDIFIER
                svc.setCharacteristic(Characteristic.ConfiguredName, name)
            }
            else {
                svc      = new Service.Switch(name)
                category = this.api.hap.Categories.SWITCH
            }

            // 2) 단일 토글(전원) 구현
            const isOnOff  = svc instanceof Service.Switch || svc instanceof Service.Fan
            const charType = isOnOff ? Characteristic.On : Characteristic.Active

            svc.getCharacteristic(charType)
                .onGet(() => isOnOff ? false : Characteristic.Active.INACTIVE)
                .onSet(async (value, callback) => {
                    const triggered = isOnOff
                        ? value === true
                        : value === Characteristic.Active.ACTIVE

                    if (triggered) {
                        try {
                            await axios.post(
                                `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,
                                {},
                                { headers: { Authorization: `Bearer ${this.token}` } }
                            )
                            this.log.info(`Executed scene: ${name}`)
                        } catch (err) {
                            this.log.error(`Error executing ${name}`, err)
                            return callback(new Error('SERVICE_COMMUNICATION_FAILURE'))
                        } finally {
                            svc.updateCharacteristic(
                                charType,
                                isOnOff ? false : Characteristic.Active.INACTIVE
                            )
                        }
                    }
                    callback()
                })

            // 3) 액세서리 생성 & 서비스 연결
            const acc = new this.api.platformAccessory(
                name,
                uuid.generate(scene.sceneId)
            )
            acc.category = category
            acc.addService(svc)

            return acc
        })

        // 4) HomeKit에 모두 게시
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine',
            accessories
        )
        this.log.info(`Published ${accessories.length} SmartThings routines`)
    }

    configureAccessory() {}  // no-op
}
