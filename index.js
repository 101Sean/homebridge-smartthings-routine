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

        // 1) TV(204) 씬 제외
        scenes = scenes.filter(s => String(s.sceneIcon) !== '204')

        // 2) 에어컨 씬만 뽑아서 On/Off 짝짓기
        const acScenes = scenes.filter(s => String(s.sceneIcon) === '211')
        let onScene, offScene
        for (const s of acScenes) {
            if (s.sceneName.includes('On'))  onScene  = s
            if (s.sceneName.includes('Off')) offScene = s
        }

        const accessories = []

        // 3) 에어컨 Fan 액세서리 (On/Off 토글)
        if (onScene && offScene) {
            const name = '에어컨'
            // 간단히 context 에 상태 보관
            let currentState = false

            const acc = new this.api.platformAccessory(
                name,
                uuid.generate(onScene.sceneId + offScene.sceneId)
            )
            acc.category = this.api.hap.Categories.FAN

            const svc = new Service.Fan(name)
            svc.setCharacteristic(Characteristic.ConfiguredName, name)

            svc.getCharacteristic(Characteristic.On)
                .onGet(() => {
                    this.log.debug(`Fan onGet: ${currentState}`)
                    return currentState
                })
                .onSet(async (value) => {
                    this.log.info(`Setting Fan '${name}' to`, value)
                    const sceneToRun = value ? onScene.sceneId : offScene.sceneId
                    try {
                        await axios.post(
                            `https://api.smartthings.com/v1/scenes/${sceneToRun}/execute`,
                            {},
                            { headers:{ Authorization:`Bearer ${this.token}` } }
                        )
                        this.log.info(`Executed AC ${value ? 'On' : 'Off'} scene`)
                        currentState = value
                    } catch (err) {
                        this.log.error(`Error executing AC ${value ? 'On' : 'Off'}`, err)
                        throw new this.api.hap.HapStatusError(
                            this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                        )
                    }
                })

            acc.addService(svc)
            accessories.push(acc)
        }

        // 4) 제습기(212) 씬 처리
        const dehumScenes = scenes.filter(s => String(s.sceneIcon) === '212')
        for (const scene of dehumScenes) {
            const name = scene.sceneName
            const acc  = new this.api.platformAccessory(
                name,
                uuid.generate(scene.sceneId)
            )
            acc.category = this.api.hap.Categories.HUMIDIFIERDEHUMIDIFIER

            const svc = new Service.HumidifierDehumidifier(name)
            svc.setCharacteristic(Characteristic.ConfiguredName, name)

            svc.getCharacteristic(Characteristic.Active)
                .onGet(() => Characteristic.Active.INACTIVE)
                .onSet(async (value) => {
                    this.log.info(`Dehumidifier onSet (${name}):`, value)

                    if (value === Characteristic.Active.ACTIVE) {
                        // -- 기존 제습운전 씬 실행 --
                        try {
                            await axios.post(
                                `https://api.smartthings.com/v1/scenes/${scene.sceneId}/execute`,
                                {}, { headers: { Authorization: `Bearer ${this.token}` } }
                            )
                            this.log.info(`Executed Dehumidifier scene: ${name}`)
                        } catch (err) {
                            this.log.error(`Error executing Dehumidifier: ${name}`, err)
                            throw new this.api.hap.HapStatusError(
                                this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                            )
                        } finally {
                            // 자동으로 Inactive로 리셋
                            svc.updateCharacteristic(
                                Characteristic.Active,
                                Characteristic.Active.INACTIVE
                            )
                        }
                    } else {
                        // -- 추가: value가 INACTIVE로 들어올 때 에어컨 Off 씬 실행 --
                        if (offScene) {
                            try {
                                await axios.post(
                                    `https://api.smartthings.com/v1/scenes/${offScene.sceneId}/execute`,
                                    {}, { headers: { Authorization: `Bearer ${this.token}` } }
                                )
                                this.log.info(`Executed AC Off scene: ${offScene.sceneName}`)
                            } catch (err) {
                                this.log.error(`Error executing AC Off scene: ${offScene.sceneName}`, err)
                                throw new this.api.hap.HapStatusError(
                                    this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                                )
                            }
                        }
                    }
                })

            acc.addService(svc)
            accessories.push(acc)
        }

        // 5) unregister old & register new
        const toRemove = this.cachedAccessories.filter(c =>
            !accessories.find(a => a.UUID === c.UUID)
        )
        if (toRemove.length) {
            this.api.unregisterPlatformAccessories(
                'homebridge-smartthings-routine',
                'StRoutinePlatform',
                toRemove
            )
        }
        this.api.registerPlatformAccessories(
            'homebridge-smartthings-routine',
            'StRoutinePlatform',
            accessories
        )
        this.log.info(`Registered ${accessories.length} accessories`)
    }
}
