// index.js
const axios = require('axios')

let Service, Characteristic, uuid

module.exports = (api) => {
    Service        = api.hap.Service
    Characteristic = api.hap.Characteristic
    uuid           = api.hap.uuid

    // dynamic=true 제거 → 메인 프로세스에서 실행
    api.registerPlatform(
        'homebridge-smartthings-routine',  // package.json name
        'StRoutinePlatform',               // platform identifier
        StRoutinePlatform                  // dynamic 인자 없음
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

        // configureAccessory 로 처음 주입된 캐시, 다 등록 후 호출
        this.cachedAccessories = []
        this.api.on('didFinishLaunching', () => this.initAccessories())
    }

    configureAccessory(accessory) {
        // Homebridge 재시작 시 기존 액세서리 캐시
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

        // 새로 등록할 액세서리 목록
        const accessories = scenes.map(scene => {
            const name     = (scene.sceneName||'').trim() || scene.sceneId
            const iconCode = String(scene.sceneIcon)

            // 서비스·카테고리 결정
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

            // 단일 전원 토글만
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

            // PlatformAccessory 생성
            const acc = new this.api.platformAccessory(
                name,
                uuid.generate(scene.sceneId)
            )
            acc.category = category
            acc.addService(svc)
            return acc
        })

        // 기존 캐시에서 제거된 액세서리는 unregister
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
