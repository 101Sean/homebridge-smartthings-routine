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

        scenes = scenes.filter(scene => String(scene.sceneIcon) !== '204')

        const accessories = scenes.map(scene => {
            const name     = (scene.sceneName || '').trim() || scene.sceneId
            const iconCode = String(scene.sceneIcon)

            let svc, category

            // ─── Fan (IR 켜기만) ───
            if (iconCode === '211') {
                svc      = new Service.Fan(name)
                category = this.api.hap.Categories.FAN

                svc.setCharacteristic(Characteristic.ConfiguredName, name)

                svc.getCharacteristic(Characteristic.On)
                    .onGet(() => false)
                    .onSet(async (v, cb) => {
                        if (v) {
                            try {
                                await axios.post(
                                    `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,
                                    {},
                                    { headers: { Authorization: `Bearer ${this.token}` } }
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

                svc.getCharacteristic(Characteristic.Active)
                    .onGet(() => Characteristic.Active.INACTIVE)
                    .onSet(async (v, cb) => {
                        if (v === Characteristic.Active.ACTIVE) {
                            try {
                                await axios.post(
                                    `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,
                                    {},
                                    { headers: { Authorization: `Bearer ${this.token}` } }
                                )
                                this.log.info(`Executed Dehumidifier scene: ${name}`)
                            } catch (err) {
                                this.log.error(`Error executing ${name}`, err)
                                return cb(new Error('SERVICE_COMMUNICATION_FAILURE'))
                            } finally {
                                svc.updateCharacteristic(
                                    Characteristic.Active,
                                    Characteristic.Active.INACTIVE
                                )
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
                                    { headers: { Authorization: `Bearer ${this.token}` } }
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

            // PlatformAccessory 생성 & 서비스 연결
            const acc = new this.api.platformAccessory(name, uuid.generate(scene.sceneId))
            acc.category = category
            acc.addService(svc)
            return acc
        })

        // 제거된 액세서리 unregister
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

        // 새 액세서리 register
        this.api.registerPlatformAccessories(
            'homebridge-smartthings-routine',
            'StRoutinePlatform',
            accessories
        )
        this.log.info(`Registered ${accessories.length} SmartThings routines`)
    }
}
