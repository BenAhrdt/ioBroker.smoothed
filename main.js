"use strict";

/*
 * Created with @iobroker/create-adapter v2.5.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const calculationtypes = require("./lib/modules/calculation");
const statehandlingtypes = require("./lib/modules/statehandling");
const schedulehandlingtypes = require("./lib/modules/schedulehandling");

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
			smoothed: "smoothed",
			lastArray : "lastArray"
		};

		// Active states / channels to smooth
		this.activeStates = {};
		this.activeChannels = {};

		//Cronjobs for refreshing
		this.cronJobs = {
			jobIdKey : "jobIdKey"
		};

		//Types of calculations
		this.calculationtype = {
			mvgavg: "mvgavg",
			lowpasspt1: "PT1"
		};

		// define externat modules
		this.calculation = new calculationtypes({adapter:this});
		this.statehandling = new statehandlingtypes({adapter:this});
		this.schedulehandling = new schedulehandlingtypes({adapter:this});
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {

		// delete not configed ids in namestapace
		await this.statehandling.delNotConfiguredIds();

		// Create internal adapter-structure
		await this.statehandling.createInternalValues();

		// crate and init schedules
		await this.schedulehandling.initSchedules();
	}

	/******************************************************************
	 * *********Called from schedules (from schedulehandling)**********
	 * ***************************************************************/

	outputAddedChannels(refreshRate){
		for(const channelName in this.cronJobs[refreshRate]){
			if(channelName !== this.cronJobs.jobIdKey){
				const channel = this.activeChannels[channelName];
				this.outputSmoothedValues(channel);
			}
		}
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	outputSmoothedValues(channel){
		this.calculateSmoothedValue(channel);
		// Output with the desired decimal places
		let smoothedOutput = channel.smoothed;
		if(channel.limitDecimalplaces){
			smoothedOutput = Math.round(smoothedOutput * channel.decimalplaces) / channel.decimalplaces;
		}
		this.setStateAsync(`${this.statehandling.generateInternalChannelString(channel.name)}.${this.internalSmoothedValues.smoothed}`,smoothedOutput,true);
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	calculateSmoothedValue(channel){
		// get act timestamp
		const timestamp = Date.now();
		channel.currentTimestamp = timestamp;

		// Select the calculationtype
		switch(channel.type){
			case this.calculationtype.lowpasspt1:
				this.calculation.lowpassPt1(channel);
				break;
			case this.calculationtype.mvgavg:
			default:
				this.calculation.movingAverage(channel);//this.calculateMovingAverage(channel);
		}

		// write lastArray to state
		this.setStateAsync(`${this.statehandling.generateInternalChannelString(channel.name)}.${this.internalSmoothedValues.lastArray}`,JSON.stringify(channel.lastArray),true);
		// assign timestamp as last changed timestampt
		channel.lastTimestamp = timestamp;
	}

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

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	async doChangeProcess(id,state){
		//Check internal channels for output, or just calculation
		for(const channelName in this.activeStates[id]){
			const channel = this.activeStates[id][channelName];

			// Check standard deviation => (only assign value in case is valid)
			if(this.calculation.valueIsValid(channel,state)){
				// Ceck for limits
				if(channel.limitInNegativeDirection && state.val < channel.negativeLimit){
					channel.currentValue = channel.negativeLimit;
					this.log.info(`State ${id} is set to value ${state.val} and would be limitted to ${channel.negativeLimit}`);
				}
				else if(channel.limitInPositiveDirection && state.val > channel.positiveLimit){
					channel.currentValue = channel.negativeLimit;
					this.log.info(`State ${id} is set to value ${state.val} and would be limitted to ${channel.positiveLimit}`);
				}
				else{
					// Assign new value, if no limit is reached
					channel.currentValue = state.val;
				}
			}
			// State is ignored by funkion => greater then allowed standard deviation
			else{
				this.log.warn(`The new value ${state.val} of the state ${id} with name ${channel.name} will be ignored. The maximal deviation is actual: ${channel.currentMaxDeviation}.`);
			}


			// Check refrehing => Output, or just calculate
			if(channel.refreshRate === 0 || channel.refreshWithStatechange){
				this.outputSmoothedValues(channel);
			}
			else{
				this.calculateSmoothedValue(channel);
			}
			// Assign current value to last value
			channel.lastValue = channel.currentValue;
		}

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
			// Clear all scheduled Cronjobs
			this.schedulehandling.cancelAllScheduledCronjobs();

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