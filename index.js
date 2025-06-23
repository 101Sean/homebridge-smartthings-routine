// index.js
const axios = require('axios')

let Service, Characteristic, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    uuid           = api.hap.uuid

    api.registerPlatform(
        'homebridge-smartthings-routine',  // package.json name
        'StRoutinePlatform',               // platform identifier
        StRoutinePlatform,
        true
    )
}

class StRoutinePlatform {
    constructor(log, config, api) {
        this.log    = log
        this.token  = config.token   // SmartThings API 토큰
        this.api    = api

        if (!this.token) {
            throw new Error('token is required')
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

        const accessories = scenes.map(scene => {
            // 빈 이름이면 ID 사용
            const displayName = (scene.name||'').trim() || `Routine ${scene.sceneId}`
            const acc = new this.api.platformAccessory(
                displayName,
                uuid.generate(scene.sceneId)
            )
            acc.category = this.api.hap.Categories.TELEVISION

            const tvSvc = new Service.Television(displayName)
            tvSvc
                .setCharacteristic(Characteristic.ConfiguredName, displayName)
                .setCharacteristic(
                    Characteristic.SleepDiscoveryMode,
                    Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
                )

            tvSvc.getCharacteristic(Characteristic.Active)
                .onGet(() => Characteristic.Active.INACTIVE)
                .onSet(async (value, callback) => {
                    if (value === Characteristic.Active.ACTIVE) {
                        try {
                            await axios.post(
                                `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,
                                {},
                                { headers: { Authorization: `Bearer ${this.token}` } }
                            )
                            this.log.info(`Executed scene: ${displayName}`)
                        } catch (e) {
                            this.log.error(`Error executing ${displayName}`, e)
                            // HomeKit에 에러 표시
                            return callback(new Error('SERVICE_COMMUNICATION_FAILURE'))
                        } finally {
                            tvSvc.updateCharacteristic(
                                Characteristic.Active,
                                Characteristic.Active.INACTIVE
                            )
                        }
                    }
                    callback()
                })

            acc.addService(tvSvc)
            return acc
        })

        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine',
            accessories
        )
        this.log.info(`Published ${accessories.length} TV routines`)
    }

    configureAccessory() {}  // no-op
}
