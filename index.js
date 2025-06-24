// index.js
const axios = require('axios')

let Service, Characteristic, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    uuid           = api.hap.uuid

    // dynamic=true 로 Child-Bridge 없이 External Accessory 모드
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

        if (!this.token) throw new Error('token is required')

        this.api.on('didFinishLaunching', () => this.initAccessories())
    }

    async initAccessories() {
        // 1) SmartThings 씬 가져오기
        let scenes = []
        try {
            const res = await axios.get(
                'https://api.smartthings.com/v1/scenes',
                { headers: { Authorization: `Bearer ${this.token}` } }
            )
            scenes = res.data.items
        } catch (e) {
            this.log.error('Failed to fetch scenes', e)
            return
        }

        // 2) 씬 → 액세서리 변환
        const accessories = scenes.map(scene => {
            const name     = (scene.sceneName||'').trim() || scene.sceneId
            const iconCode = String(scene.sceneIcon)

            let svc, category

            // ── TV 씬 (204) ──
            if (iconCode === '204') {
                svc      = new Service.Television(name)
                category = this.api.hap.Categories.TELEVISION

                // 필수 특성
                svc.setCharacteristic(Characteristic.ConfiguredName, name)
                svc.setCharacteristic(
                    Characteristic.SleepDiscoveryMode,
                    Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
                )
                // ActiveIdentifier
                svc.getCharacteristic(Characteristic.ActiveIdentifier)
                    .setProps({ minValue:1, maxValue:1, validValues:[1] })
                    .onGet(() => 1)
                // RemoteKey 더미
                svc.getCharacteristic(Characteristic.RemoteKey)
                    .onSet((_, cb) => cb())
                // 더미 InputSource
                const inp = new Service.InputSource(`${name} Input`, uuid.generate(`${scene.sceneId}-in`))
                inp.setCharacteristic(Characteristic.Identifier, 1)
                    .setCharacteristic(Characteristic.ConfiguredName, name)
                    .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
                    .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.HDMI)
                    .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
                svc.addLinkedService(inp)
                svc.setPrimaryService()
                // 전원 토글
                svc.getCharacteristic(Characteristic.Active)
                    .onGet(() => Characteristic.Active.INACTIVE)
                    .onSet(async (v, cb) => {
                        if (v === Characteristic.Active.ACTIVE) {
                            try {
                                await axios.post(
                                    `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute}`,
                                    {}, { headers:{Authorization:`Bearer ${this.token}`}}
                                )
                                this.log.info(`Executed TV: ${name}`)
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
            // ── 팬 씬 (211) ──
            else if (iconCode === '211') {
                svc      = new Service.Fan(name)
                category = this.api.hap.Categories.FAN

                svc.setCharacteristic(Characteristic.ConfiguredName, name)
                svc.getCharacteristic(Characteristic.On)
                    .onGet(() => false)
                    .onSet(async (v, cb) => {
                        if (v) {
                            try {
                                await axios.post(
                                    `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute}`,
                                    {}, { headers:{Authorization:`Bearer ${this.token}`}}
                                )
                                this.log.info(`Executed Fan: ${name}`)
                            } catch (err) {
                                this.log.error(err)
                                return cb(new Error('SERVICE_COMMUNICATION_FAILURE'))
                            } finally {
                                svc.updateCharacteristic(Characteristic.On, false)
                            }
                        }
                        cb()
                    })
            }
            // ── 제습기 씬 (212) ──
            else if (iconCode === '212') {
                svc      = new Service.HumidifierDehumidifier(name)
                category = this.api.hap.Categories.HUMIDIFIERDEHUMIDIFIER

                svc.setCharacteristic(Characteristic.ConfiguredName, name)
                svc.getCharacteristic(Characteristic.Active)
                    .onGet(() => Characteristic.Active.INACTIVE)
                    .onSet(async (v, cb) => {
                        if (v === Characteristic.Active.ACTIVE) {
                            try {
                                await axios.post(
                                    `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute}`,
                                    {}, { headers:{Authorization:`Bearer ${this.token}`}}
                                )
                                this.log.info(`Executed Dehumidifier: ${name}`)
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
            // ── 기타 씬 ──
            else {
                svc      = new Service.Switch(name)
                category = this.api.hap.Categories.SWITCH

                svc.getCharacteristic(Characteristic.On)
                    .onGet(() => false)
                    .onSet(async (v, cb) => {
                        if (v) {
                            try {
                                await axios.post(
                                    `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute}`,
                                    {}, { headers:{Authorization:`Bearer ${this.token}`}}
                                )
                                this.log.info(`Executed Switch: ${name}`)
                            } catch (err) {
                                this.log.error(err)
                            } finally {
                                svc.updateCharacteristic(Characteristic.On, false)
                            }
                        }
                        cb()
                    })
            }

            // 액세서리 생성 및 서비스 연결
            const acc = new this.api.platformAccessory(name, uuid.generate(scene.sceneId))
            acc.category = category
            acc.addService(svc)
            return acc
        })

        // 3) HomeKit에 root-level External Accessory로 모두 게시
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine',
            accessories
        )
        this.log.info(`Published ${accessories.length} SmartThings routines`)
    }
}
