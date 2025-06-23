const axios = require('axios');
let Service, Characteristic, Bridge, Accessory, uuid;

module.exports = (api) => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    Bridge         = api.hap.Bridge;
    Accessory      = api.platformAccessory;
    uuid           = api.hap.uuid;

    // Dynamic platform registration (plugin name must match package.json "name")
    api.registerPlatform(
        'homebridge-smartthings-routine', // pluginIdentifier
        'StRoutinePlatform',                  // platform name
        StRoutinePlatform,                    // constructor
        true                                  // dynamic
    );
};

class StRoutinePlatform {
    constructor(log, config, api) {
        this.log        = log;
        this.name       = config.name;
        this.routineId  = config.routineId;
        this.token      = config.token;
        this.buttonName = config.buttonName || 'Run Routine';
        this.api        = api;

        if (!this.name || !this.routineId || !this.token) {
            throw new Error('name, routineId, and token are required');
        }

        this.api.on('didFinishLaunching', () => {
            this.publishBridgeWithButton();
        });
    }

    publishBridgeWithButton() {
        // 1) Child Bridge
        const bridgeUUID = uuid.generate(this.name);
        const childBridge = new Bridge(this.name, bridgeUUID);
        childBridge
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, 'RoutineChildBridge');

        // 2) Momentary Button accessory
        const buttonUUID = uuid.generate(this.buttonName);
        const buttonAcc  = new Accessory(this.buttonName, buttonUUID);
        buttonAcc.category = this.api.hap.Categories.PROGRAMMABLE_SWITCH;

        const buttonSvc = new Service.StatelessProgrammableSwitch(this.buttonName);
        buttonSvc
            .getCharacteristic(Characteristic.ProgrammableSwitchEvent)
            .onSet(async () => {
                try {
                    await axios.post(
                        `https://api.smartthings.com/v1/scenes/${this.routineId}/execute`,
                        {},
                        { headers: { Authorization: `Bearer ${this.token}` } }
                    );
                    this.log.info(`Executed routine: ${this.buttonName}`);
                } catch (err) {
                    this.log.error(`Error executing ${this.buttonName}`, err);
                    throw new this.api.hap.HapStatusError(
                        this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
                    );
                } finally {
                    // Show press animation in HomeKit
                    buttonSvc.updateCharacteristic(
                        Characteristic.ProgrammableSwitchEvent,
                        Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS
                    );
                }
            });
        buttonAcc.addService(buttonSvc);

        // 3) Attach button to Bridge
        childBridge.addBridgedAccessory(buttonAcc);

        // 4) Publish only the child Bridge
        this.api.publishExternalAccessories(
            'homebridge-smartthings-childbridge',
            [childBridge]
        );

        this.log.info(`Published child Bridge and button: ${this.name}`);
    }

    configureAccessory() {
        // no-op
    }
}