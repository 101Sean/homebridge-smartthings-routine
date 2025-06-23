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
        'homebridge-smartthings-childbridge', // plugin name must match package.json
        'StRoutinePlatform',                  // platform identifier
        StRoutinePlatform,                    // constructor
        true                                  // dynamic platform
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

        // After Homebridge fully launches, publish the child bridge
        this.api.on('didFinishLaunching', () => {
            this.publishBridgeWithButton();
        });
    }

    publishBridgeWithButton() {
        // 1) Create the child Bridge
        const bridgeUUID = uuid.generate(this.name);
        const childBridge = new Bridge(this.name, bridgeUUID);
        childBridge
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, 'RoutineChildBridge');

        // 2) Create the momentary button accessory (Stateless Programmable Switch)
        const buttonUUID = uuid.generate(this.buttonName);
        const buttonAcc  = new Accessory(this.buttonName, buttonUUID);
        // Use PROGRAMMABLE_SWITCH category for proper button icon
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
                    // Push a SINGLE_PRESS event to show button animation in Home
                    buttonSvc.updateCharacteristic(
                        Characteristic.ProgrammableSwitchEvent,
                        Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS
                    );
                }
            });

        buttonAcc.addService(buttonSvc);

        // 3) Attach the button accessory to the child Bridge
        childBridge.addBridgedAccessory(buttonAcc);

        // 4) Publish only the child Bridge as an external accessory
        this.api.publishExternalAccessories(
            'homebridge-smartthings-childbridge', // plugin identifier
            [childBridge]
        );

        this.log.info(`Published child Bridge and button: ${this.name}`);
    }

    configureAccessory() {
        // no-op
    }
}