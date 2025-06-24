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

        // TV(204)만 제외
        scenes = scenes.filter(s => String(s.sceneIcon) !== '204')

        const accessories = scenes.map(scene => {
            const name     = (scene.sceneName || '').trim() || scene.sceneId
            const iconCode = String(scene.sceneIcon)

            let svc, category

            if (iconCode === '211') {
                // ─── Fan ───
                svc      = new Service.Fan(name)
                category = this.api.hap.Categories.FAN
                svc.setCharacteristic(Characteristic.ConfiguredName, name)

                svc.getCharacteristic(Characteristic.On)
                    .onGet(() => false)
                    .onSet(async (value) => {
                        this.log.info(`Fan onSet called (${name}):`, value)
                        if (value) {
                            try {
                                await axios.post(
                                    `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,
                                    {},
                                    { headers:{ Authorization:`Bearer ${this.token}` } }
                                )
                                this.log.info(`Executed Fan scene: ${name}`)
                            } catch (err) {
                                this.log.error(`Error executing Fan scene: ${name}`, err)
                            }
                            // 자동 Off
                            svc.updateCharacteristic(Characteristic.On, false)
                        }
                    })
            }
            else if (iconCode === '212') {
                // ─── Dehumidifier ───
                svc      = new Service.HumidifierDehumidifier(name)
                category = this.api.hap.Categories.HUMIDIFIERDEHUMIDIFIER
                svc.setCharacteristic(Characteristic.ConfiguredName, name)

                svc.getCharacteristic(Characteristic.Active)
                    .onGet(() => Characteristic.Active.INACTIVE)
                    .onSet(async (value) => {
                        this.log.info(`Dehumidifier onSet called (${name}):`, value)
                        if (value === Characteristic.Active.ACTIVE) {
                            try {
                                await axios.post(
                                    `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,
                                    {},
                                    { headers:{ Authorization:`Bearer ${this.token}` } }
                                )
                                this.log.info(`Executed Dehumidifier scene: ${name}`)
                            } catch (err) {
                                this.log.error(`Error executing Dehumidifier scene: ${name}`, err)
                            }
                            // 자동 Inactive
                            svc.updateCharacteristic(
                                Characteristic.Active,
                                Characteristic.Active.INACTIVE
                            )
                        }
                    })
            }
            else {
                // ─── Switch ───
                svc      = new Service.Switch(name)
                category = this.api.hap.Categories.SWITCH
                svc.setCharacteristic(Characteristic.ConfiguredName, name)

                svc.getCharacteristic(Characteristic.On)
                    .onGet(() => false)
                    .onSet(async (value) => {
                        this.log.info(`Switch onSet called (${name}):`, value)
                        if (value) {
                            try {
                                await axios.post(
                                    `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,
                                    {},
                                    { headers:{ Authorization:`Bearer ${this.token}` } }
                                )
                                this.log.info(`Executed Switch scene: ${name}`)
                            } catch (err) {
                                this.log.error(`Error executing Switch scene: ${name}`, err)
                            }
                            svc.updateCharacteristic(Characteristic.On, false)
                        }
                    })
            }

            const acc = new this.api.platformAccessory(
                name,
                uuid.generate(scene.sceneId)
            )
            acc.category = category
            acc.addService(svc)
            return acc
        })

        // remove old
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

        // register new
        this.api.registerPlatformAccessories(
            'homebridge-smartthings-routine',
            'StRoutinePlatform',
            accessories
        )
        this.log.info(`Registered ${accessories.length} SmartThings routines`)
    }
}
