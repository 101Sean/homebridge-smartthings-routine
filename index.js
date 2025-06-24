// index.js
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
            // 서비스 타입과 카테고리 결정
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
                svc      = new Service.HeaterCooler(name)
                category = this.api.hap.Categories.HEATERCOOLER
                svc
                    .setCharacteristic(Characteristic.ConfiguredName, name)
            }
            else if (iconCode === '212') {
                svc      = new Service.HumidifierDehumidifier(name)
                category = this.api.hap.Categories.HUMIDIFIERDEHUMIDIFIER
                svc
                    .setCharacteristic(Characteristic.ConfiguredName, name)
            }
            else {
                // 그 외에는 일반 Switch 로 대체
                svc      = new Service.Switch(name)
                category = this.api.hap.Categories.SWITCH
            }

            // Active (전원) 토글만 구현
            svc.getCharacteristic(Characteristic.Active || Characteristic.On)
                .onGet(() => {
                    // 항상 OFF 상태로 보여줌
                    return Characteristic.Active ? Characteristic.Active.INACTIVE : false
                })
                .onSet(async (value, cb) => {
                    if (
                        (Characteristic.Active && value === Characteristic.Active.ACTIVE) ||
                        (!Characteristic.Active && value === true)
                    ) {
                        try {
                            await axios.post(
                                `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,
                                {},
                                { headers: { Authorization: `Bearer ${this.token}` } }
                            )
                            this.log.info(`Executed scene: ${name}`)
                        } catch (err) {
                            this.log.error(`Error executing ${name}`, err)
                            return cb(new Error('SERVICE_COMMUNICATION_FAILURE'))
                        } finally {
                            // 눌렀다 떼는 버튼처럼 리셋
                            if (Characteristic.Active) {
                                svc.updateCharacteristic(
                                    Characteristic.Active,
                                    Characteristic.Active.INACTIVE
                                )
                            } else {
                                svc.updateCharacteristic(Characteristic.On, false)
                            }
                        }
                    }
                    cb()
                })

            // 액세서리 인스턴스 생성 & 서비스 추가
            const acc = new this.api.platformAccessory(name, uuid.generate(scene.sceneId))
            acc.category = category
            acc.addService(svc)
            return acc
        })

        // HomeKit에 모두 노출
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine',
            accessories
        )
        this.log.info(`Published ${accessories.length} routines with appropriate icons`)
    }

    configureAccessory() {}  // no-op
}
