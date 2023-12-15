"use strict";

/*
 * Created with @iobroker/create-adapter v2.5.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");


class Smoothed extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "smoothed",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));

		// Name of internal folder for smoothed values
		this.internalFolder = {
			smoothedvalues: "values"
		};

		// Name of internal states of smoothed values
		this.internalSmoothedValues = {
			smoothed: "smoothed"
		};

		// Active states to smooth
		this.activeStates = {};
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// delete not configed ids in namestapace
		await this.delNotConfiguredIds();

		// Create internal adapter-structure
		await this.createInternalValues();

		// crate and init schedules

	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	// delete not configured states
	async delNotConfiguredIds()
	{
		// Get all objects in the adapter
		this.AdapterObjectsAtStart = await this.getAdapterObjectsAsync();
		let activeString = "";
		for(const elementName in this.config.statesTable){
			const element = this.config.statesTable[elementName];
			if(element.name && element.name !== ""){
				activeString = `${this.generateInternalChannel(element.name)}.${this.internalSmoothedValues.smoothed}`;
				delete this.AdapterObjectsAtStart[activeString];
				activeString = this.generateInternalChannel(element.name);
				delete this.AdapterObjectsAtStart[activeString];
			}
		}
		// delete mothedvalue folder from array
		activeString = `${this.namespace}.${this.internalFolder.smoothedvalues}`;
		delete this.AdapterObjectsAtStart[activeString];

		// delete the remaining states
		for(const state in this.AdapterObjectsAtStart){
			this.delObjectAsync(state);
		}
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	// Create internal folders and states
	async createInternalValues(){
		for(const elementName in this.config.statesTable){
			// Assign element with the key
			const element = this.config.statesTable[elementName];
			// ckeck the id of the element
			try{
				const resultObject = await this.getForeignObjectAsync(element.id);
				const resultState = await this.getForeignStateAsync(element.id);
				if(resultObject && resultState){
					if(!this.activeStates[element.id]){
						this.activeStates[element.id] = {};
					}
					// Assigne values from state
					this.activeStates[element.id][element.name] = {};
					this.activeStates[element.id][element.name].smoothed = resultState.val;
					this.activeStates[element.id][element.name].sourceId = element.id;
					this.activeStates[element.id][element.name].currentValue = resultState.val;
					this.activeStates[element.id][element.name].lastValue = resultState.val;
					this.activeStates[element.id][element.name].channelName = element.name;
					this.activeStates[element.id][element.name].lastChangeTimestamp = resultState.ts;

					// Assigne values from object
					// @ts-ignore
					this.activeStates[element.id][element.name].unit = resultObject.common.unit;

					// Assign values from config
					this.activeStates[element.id][element.name].type = element.type;
					this.activeStates[element.id][element.name].refreshRate = element.refreshRate;
					this.activeStates[element.id][element.name].smoothtimePositive = element.smoothtimePositive;
					this.activeStates[element.id][element.name].smoothtimeNegative = element.smoothtimeNegative;
				}
			}
			catch{
				const message = `The configured value: ${element.name} with the id: ${element.id} is not able to read.`;
				this.log.warn(message);
			}
		}

		// Generate internal folder for the smoothed values values
		await this.setObjectNotExistsAsync(`${this.internalFolder.smoothedvalues}`,{
			"type": "folder",
			"common": {
				"name": "smoothed values"
			},
			native : {},
		});

		// Create the states of configed values
		for(const idName in this.activeStates){
			const id = this.activeStates[idName];
			for(const channelName in id){
				const channel = id[channelName];
				// create State for the name
				await this.setObjectNotExistsAsync(this.generateInternalChannel(channelName),{
					type: "channel",
					common: {
						name: channelName,
						desc: channel.sourceId
					},
					native: {},
				});

				// create State for the name
				await this.setObjectNotExistsAsync(`${this.generateInternalChannel(channelName)}.${this.internalSmoothedValues.smoothed}`,{
					type: "state",
					common: {
						name: "smoothed value",
						type: "number",
						role: "value",
						read: true,
						write: false,
						unit: channel.unit,
						def: channel.lastValue
					},
					native: {},
				});
			}
			this.subscribeForeignStatesAsync(idName);
		}
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	generateInternalChannel(name){
		return `${this.namespace}.${this.internalFolder.smoothedvalues}.${name}`;
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	async doChangeProcess(id,state){
		//Check internal channels for output, or just calculation
		for(const channelName in this.activeStates[id]){
			const channel = this.activeStates[id][channelName];
			channel.currentValue = state.val;
			channel.currentTimestamp = state.ts;
// Hier prüfen, ob auch ausgegeben werden soll, oder nur berechnet.
			this.outputSmoothedValues(channel);

			channel.lastValue = state.val;
			channel.lastTimestamp = state.ts;
		}

	}
	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	async outputSmoothedValues(channel){
		this.calculateSmoothedValue(channel);
		this.setState(`${this.generateInternalChannel(channel.channelName)}.${this.internalSmoothedValues.smoothed}`,channel.smoothed,true);
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	async calculateSmoothedValue(channel){
		channel.smoothed = channel.currentValue;
	}
	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);

			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			this.doChangeProcess(id,state);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }

}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Smoothed(options);
} else {
	// otherwise start the instance directly
	new Smoothed();
}