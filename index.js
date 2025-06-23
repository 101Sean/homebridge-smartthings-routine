const axios = require('axios');
let Service, Characteristic, Bridge, Accessory, uuid;

module.exports = (api) => {
    Service        = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    Bridge         = api.hap.Bridge;
    Accessory      = api.platformAccessory;
    uuid           = api.hap.uuid;

    // Dynamic platform registration
    api.registerPlatform(
        'homebridge-smartthings-routine',  // must match package.json name
        'StRoutinePlatform',
        StRoutinePlatform,
        true
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
            throw new Error('name, routineId, token are required');
        }

        this.api.on('didFinishLaunching', () => {
            this.publishBridgeWithButton();
        });
    }

    publishBridgeWithButton() {
        // 1) Create child Bridge
        const bridgeUUID = uuid.generate(this.name);
        const childBridge = new Bridge(this.name, bridgeUUID);
        childBridge
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, 'RoutineChildBridge');

        // 2) Create Button accessory (Stateless Programmable Switch)
        const buttonUUID = uuid.generate(this.buttonName);
        const buttonAcc  = new Accessory(this.buttonName, buttonUUID);
        buttonAcc.category = this.api.hap.Categories.SWITCH;

        const buttonSvc = new Service.StatelessProgrammableSwitch(this.buttonName);
        // Only single press
        buttonSvc
            .getCharacteristic(Characteristic.ProgrammableSwitchEvent)
            .setProps({ maxValue: Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS })
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
                }
            });

        buttonAcc.addService(buttonSvc);

        // 3) Attach button to Bridge
        childBridge.addBridgedAccessory(buttonAcc);

        // 4) Publish only the child Bridge
        this.api.publishExternalAccessories(
            'homebridge-smartthings-routine', // plugin identifier
            [childBridge]
        );

        this.log.info(`Published child Bridge and button: ${this.name}`);
    }

    configureAccessory() {}
}