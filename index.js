// index.js
const axios = require('axios')

let Service, Characteristic, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    uuid           = api.hap.uuid

    // dynamic=true 제거 → 메인 프로세스에서 동작하는 Platform 플러그인
    api.registerPlatform(
        'homebridge-smartthings-routine',  // package.json name
        'StRoutinePlatform',               // platform identifier
        StRoutinePlatform
    )
}

class StRoutinePlatform {
    constructor(log, config, api) {
        this.log   = log
        this.token = config.token
        this.api   = api

        if (!this.token) throw new Error('token is required')

        // 재시작 시 기존 액세서리 캐시
        this.cachedAccessories = []
        this.api.on('didFinishLaunching', () => this.initAccessories())
    }

    configureAccessory(accessory) {
        // 홈브릿지 재시작 후 기존에 등록된 액세서리 수집
        this.cachedAccessories.push(accessory)
    }

    async initAccessories() {
        // 1) SmartThings Scene 목록 가져오기
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

        // 2) 각 scene → HomeKit 액세서리로 변환
        const accessories = scenes.map(scene => {
            const name     = (scene.sceneName||'').trim() || scene.sceneId
            const iconCode = String(scene.sceneIcon)

            let svc, category

            // ─── TV 전원 (단일 버튼 UI) ───
            if (iconCode === '204') {
                svc      = new Service.Television(name)
                category = this.api.hap.Categories.TELEVISION

                // 필수 특성
                svc.setCharacteristic(Characteristic.ConfiguredName, name)
                    .setCharacteristic(
                        Characteristic.SleepDiscoveryMode,
                        Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
                    )

                // ActiveIdentifier (TV 서비스로 인식시키기 위해)
                svc.getCharacteristic(Characteristic.ActiveIdentifier)
                    .setProps({ minValue:1, maxValue:1, validValues:[1] })
                    .onGet(() => 1)

                // 더미 InputSource 1개 링크
                const inp = new Service.InputSource(
                    `${name} Input`,
                    uuid.generate(`${scene.sceneId}-input`)
                )
                inp
                    .setCharacteristic(Characteristic.Identifier,             1)
                    .setCharacteristic(Characteristic.ConfiguredName,         name)
                    .setCharacteristic(Characteristic.IsConfigured,           Characteristic.IsConfigured.CONFIGURED)
                    .setCharacteristic(Characteristic.InputSourceType,        Characteristic.InputSourceType.HDMI)
                    .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
                svc.addLinkedService(inp)

                // 전원 토글만
                svc.getCharacteristic(Characteristic.Active)
                    .onGet(() => Characteristic.Active.INACTIVE)
                    .onSet(async (v, cb) => {
                        if (v === Characteristic.Active.ACTIVE) {
                            try {
                                await axios.post(
                                    `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,
                                    {},
                                    { headers:{Authorization:`Bearer ${this.token}`}}
                                )
                                this.log.info(`Executed TV scene: ${name}`)
                            } catch (err) {
                                this.log.error(`Error executing ${name}`, err)
                                return cb(new Error('SERVICE_COMMUNICATION_FAILURE'))
                            } finally {
                                svc.updateCharacteristic(Characteristic.Active, Characteristic.Active.INACTIVE)
                            }
                        }
                        cb()
                    })
            }
            // ─── 팬 (IR 켜기만) ───
            else if (iconCode === '211') {
                svc      = new Service.Fan(name)
                category = this.api.hap.Categories.FAN

                svc.setCharacteristic(Characteristic.ConfiguredName, name)

                // On 토글만
                svc.getCharacteristic(Characteristic.On)
                    .onGet(() => false)
                    .onSet(async (v, cb) => {
                        if (v) {
                            try {
                                await axios.post(
                                    `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,
                                    {},
                                    { headers:{Authorization:`Bearer ${this.token}`}}
                                )
                                this.log.info(`Executed Fan scene: ${name}`)
                            } catch (err) {
                                this.log.error(`Error executing ${name}`, err)
                                return cb(new Error('SERVICE_COMMUNICATION_FAILURE'))
                            } finally {
                                svc.updateCharacteristic(Characteristic.On, false)
                            }
                        }
                        cb()
                    })
            }
            // ─── 제습기 (IR 켜기만) ───
            else if (iconCode === '212') {
                svc      = new Service.HumidifierDehumidifier(name)
                category = this.api.hap.Categories.HUMIDIFIERDEHUMIDIFIER

                svc.setCharacteristic(Characteristic.ConfiguredName, name)

                // Active 토글만
                svc.getCharacteristic(Characteristic.Active)
                    .onGet(() => Characteristic.Active.INACTIVE)
                    .onSet(async (v, cb) => {
                        if (v === Characteristic.Active.ACTIVE) {
                            try {
                                await axios.post(
                                    `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,
                                    {},
                                    { headers:{Authorization:`Bearer ${this.token}`}}
                                )
                                this.log.info(`Executed Dehumidifier scene: ${name}`)
                            } catch (err) {
                                this.log.error(`Error executing ${name}`, err)
                                return cb(new Error('SERVICE_COMMUNICATION_FAILURE'))
                            } finally {
                                svc.updateCharacteristic(Characteristic.Active, Characteristic.Active.INACTIVE)
                            }
                        }
                        cb()
                    })
            }
            // ─── 기본 Switch ───
            else {
                svc      = new Service.Switch(name)
                category = this.api.hap.Categories.SWITCH

                svc.getCharacteristic(Characteristic.On)
                    .onGet(() => false)
                    .onSet(async (v, cb) => {
                        if (v) {
                            try {
                                await axios.post(
                                    `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,
                                    {},
                                    { headers:{Authorization:`Bearer ${this.token}`}}
                                )
                                this.log.info(`Executed Switch scene: ${name}`)
                            } catch (err) {
                                this.log.error(`Error executing ${name}`, err)
                            } finally {
                                svc.updateCharacteristic(Characteristic.On, false)
                            }
                        }
                        cb()
                    })
            }

            // 3) PlatformAccessory 생성 & 서비스 연결
            const acc = new this.api.platformAccessory(name, uuid.generate(scene.sceneId))
            acc.category = category
            acc.addService(svc)
            return acc
        })

        // 4) 캐시되지 않고 제거된 액세서리 unregister
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

        // 5) 새 액세서리 등록
        this.api.registerPlatformAccessories(
            'homebridge-smartthings-routine',
            'StRoutinePlatform',
            accessories
        )
        this.log.info(`Registered ${accessories.length} SmartThings routines`)
    }
}
