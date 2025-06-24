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
        StRoutinePlatform
    )
}

class StRoutinePlatform {
    constructor(log, config, api) {
        this.log   = log
        this.token = config.token
        this.api   = api

        if (!this.token) throw new Error('token is required')
        this.cachedAccessories = []
        this.api.on('didFinishLaunching', () => this.initAccessories())
    }

    configureAccessory(accessory) {
        this.cachedAccessories.push(accessory)
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
            const name     = (scene.sceneName||'').trim() || scene.sceneId
            const iconCode = String(scene.sceneIcon)

            let svc, category

            // 1) TV 전원: Television 서비스
            if (iconCode === '204') {
                svc      = new Service.Television(name)
                category = this.api.hap.Categories.TELEVISION

                // 필수 특성: ConfiguredName, SleepDiscoveryMode
                svc.setCharacteristic(Characteristic.ConfiguredName, name)
                    .setCharacteristic(
                        Characteristic.SleepDiscoveryMode,
                        Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
                    )

                // 필수 ActiveIdentifier
                svc.getCharacteristic(Characteristic.ActiveIdentifier)
                    .setProps({ minValue:1, maxValue:1, validValues:[1] })
                    .onGet(() => 1)

                // 더미 InputSource 하나 링크
                const input = new Service.InputSource(`${name} Input`, uuid.generate(`${scene.sceneId}-inp`))
                input
                    .setCharacteristic(Characteristic.Identifier,             1)
                    .setCharacteristic(Characteristic.ConfiguredName,         name)
                    .setCharacteristic(Characteristic.IsConfigured,           Characteristic.IsConfigured.CONFIGURED)
                    .setCharacteristic(Characteristic.InputSourceType,        Characteristic.InputSourceType.HDMI)
                    .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
                svc.addLinkedService(input)

                // 전원 토글만
                svc.getCharacteristic(Characteristic.Active)
                    .onGet(() => Characteristic.Active.INACTIVE)
                    .onSet(async (v, cb) => {
                        if (v === Characteristic.Active.ACTIVE) {
                            try {
                                await axios.post(
                                    `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`, {},
                                    { headers:{Authorization:`Bearer ${this.token}`}}
                                )
                                this.log.info(`Executed TV scene: ${name}`)
                            } catch (err) {
                                this.log.error(err)
                                return cb(new Error('SERVICE_COMMUNICATION_FAILURE'))
                            } finally {
                                svc.updateCharacteristic(Characteristic.Active, Characteristic.Active.INACTIVE)
                            }
                        }
                        cb()
                    })
            }
            // 2) 에어컨·제습: StatelessProgrammableSwitch(단일 버튼)
            else if (iconCode === '211' || iconCode === '212') {
                svc      = new Service.StatelessProgrammableSwitch(name)
                category = this.api.hap.Categories.SWITCH

                svc.getCharacteristic(Characteristic.ProgrammableSwitchEvent)
                    .onSet(async (_, cb) => {
                        try {
                            await axios.post(
                                `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,{},
                                { headers:{Authorization:`Bearer ${this.token}`}}
                            )
                            this.log.info(`Executed button scene: ${name}`)
                        } catch (err) {
                            this.log.error(err)
                        }
                        // 이벤트는 자동 리셋
                        cb()
                    })
            }
            // 3) 나머지 씬: 일반 Switch
            else {
                svc      = new Service.Switch(name)
                category = this.api.hap.Categories.SWITCH

                svc.getCharacteristic(Characteristic.On)
                    .onGet(() => false)
                    .onSet(async (v, cb) => {
                        if (v) {
                            try {
                                await axios.post(
                                    `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,{},
                                    { headers:{Authorization:`Bearer ${this.token}`}}
                                )
                                this.log.info(`Executed switch scene: ${name}`)
                            } catch (err) {
                                this.log.error(err)
                            } finally {
                                svc.updateCharacteristic(Characteristic.On, false)
                            }
                        }
                        cb()
                    })
            }

            // 4) Accessory 생성 & 서비스 추가
            const acc = new this.api.platformAccessory(name, uuid.generate(scene.sceneId))
            acc.category = category
            acc.addService(svc)
            return acc
        })

        // 기존 액세서리 정리
        const toRemove = this.cachedAccessories.filter(cached =>
            !accessories.find(acc => acc.UUID === cached.UUID)
        )
        if (toRemove.length) {
            this.api.unregisterPlatformAccessories(
                'homebridge-smartthings-routine',
                'StRoutinePlatform',
                toRemove
            )
        }

        // 새로운 액세서리 등록
        this.api.registerPlatformAccessories(
            'homebridge-smartthings-routine',
            'StRoutinePlatform',
            accessories
        )
        this.log.info(`Registered ${accessories.length} SmartThings routines`)
    }
}
