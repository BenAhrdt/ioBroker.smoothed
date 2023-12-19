"use strict";

/*
 * Created with @iobroker/create-adapter v2.5.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const schedule = require("node-schedule");

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
			lastArrayPositive : "lastArrayPositive",
			lastArrayNegative : "lastArrayNegative"
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
			avg: "avg",
			avgArray: "avgArray"
		};
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
		await this.initSchedules();
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
				for(const stateName in this.internalSmoothedValues){
					activeString = `${this.generateInternalChannel(element.name,true)}.${stateName}`;
					delete this.AdapterObjectsAtStart[activeString];
				}
				activeString = this.generateInternalChannel(element.name,true);
				delete this.AdapterObjectsAtStart[activeString];
			}
		}
		// delete smoothedvalue folder from array
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
			const element = this.config.statesTable[elementName];
			try{
				const resultObject = await this.getForeignObjectAsync(element.id);
				const resultState = await this.getForeignStateAsync(element.id);
				if(resultObject && resultState){

					// Assign element by name (later these are the channel)
					this.activeChannels[element.name] = {
						id: element.id,
						name: element.name,
						smoothed: resultState.val,
						currentValue: resultState.val,
						currentTimestamp : Date.now(),
						lastValue: resultState.val,
						lastTimestamp: Date.now(),

						// Assigne values from object
						// @ts-ignore
						unit: resultObject.common.unit,

						// Assign values from config
						type: element.type,
						refreshRate: element.refreshRate,
						smoothtimePositive: element.smoothtimePositive * 1000,
						smoothtimeNegative: element.smoothtimeNegative * 1000
					};

					//Assign the created element by id
					if(!this.activeStates[element.id]){
						this.activeStates[element.id] = {};
					}
					this.activeStates[element.id][element.name] = this.activeChannels[element.name];
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
		for(const channelName in this.activeChannels){
			const channel = this.activeChannels[channelName];
			// create State for the name
			await this.setObjectNotExistsAsync(this.generateInternalChannel(channelName),{
				type: "channel",
				common: {
					name: channelName,
					desc: channel.sourceId
				},
				native: {},
			});

			// create last values arrays
			const stateId = `${this.generateInternalChannel(channelName)}.${this.internalSmoothedValues.lastArrayPositive}`;
			// @ts-ignore
			await this.setObjectNotExistsAsync(stateId,{
				type: "state",
				common: {
					name: "last values and times",
					type: "json",
					role: "value",
					read: true,
					write: false,
					def: JSON.stringify({})
				},
				native: {},
			});
			const lastArrayPositiveResult = await this.getStateAsync(`${stateId}`);
			// @ts-ignore
			channel.lastArrayPositive = JSON.parse(lastArrayPositiveResult.val);
			if(!channel.lastArrayPositive.smoothtimePositive || channel.smoothtimePositive !== channel.lastArrayPositive.smoothtimePositive){
				channel.lastArrayPositive = {};
				channel.lastArrayPositive.smoothed = channel.smoothed;
				channel.lastArrayPositive.smoothtimePositive = channel.smoothtimePositive;
				channel.lastArrayPositive.value = [];
				channel.lastArrayPositive.value.push({val:channel.currentValue,ts:Date.now() - (channel.smoothtimePositive)},{val:channel.currentValue,ts:Date.now()});
				this.log.info("LastArray created: " + JSON.stringify(channel.lastArrayPositive));
				this.setStateAsync(stateId,JSON.stringify(channel.lastArrayPositive),true);
			}

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
					def: channel.lastArrayPositive.smoothed
				},
				native: {},
			});
			channel.smoothed = channel.lastArrayPositive.smoothed;
			this.subscribeForeignStatesAsync(channel.id);
			this.outputSmoothedValues(channel);
		}
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	async initSchedules(){
	// Erste Schritte für die Übernahme !!!
		for(const channelName in this.activeChannels){
			const channel = this.activeChannels[channelName];
			if(!this.cronJobs[channel.refreshRate]){
				this.cronJobs[channel.refreshRate] = {};
				if(channel.refreshRate !== 60){
					this.cronJobs[channel.refreshRate][this.cronJobs.jobIdKey] = schedule.scheduleJob(`*/${channel.refreshRate} * * * * *`,this.outputAddedChannels.bind(this,channel.refreshRate));
				}
				else{
					this.cronJobs[channel.refreshRate][this.cronJobs.jobIdKey] = schedule.scheduleJob(`0 * * * * *`,this.outputAddedChannels.bind(this,channel.refreshRate));
				}
			}
			this.cronJobs[channel.refreshRate][channel.name] = {};
		}
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	async outputAddedChannels(refreshRate){
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

	generateInternalChannel(name,withNamespace = false){
		if(withNamespace){
			return `${this.namespace}.${this.internalFolder.smoothedvalues}.${name}`;
		}
		else{
			return `${this.internalFolder.smoothedvalues}.${name}`;
		}
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	async doChangeProcess(id,state){
		//Check internal channels for output, or just calculation
		for(const channelName in this.activeStates[id]){
			const channel = this.activeStates[id][channelName];

			// Value is changed => Assign new value
			channel.currentValue = state.val;

			// Hier prüfen, ob auch ausgegeben werden soll, oder nur berechnet. !!!
			this.outputSmoothedValues(channel);

			// Assign current value to last value
			channel.lastValue = channel.currentValue;
		}

	}
	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	async outputSmoothedValues(channel){
		this.calculateSmoothedValue(channel);
		this.setStateAsync(`${this.generateInternalChannel(channel.name)}.${this.internalSmoothedValues.smoothed}`,channel.smoothed,true);
		this.setStateAsync(`${this.generateInternalChannel(channel.name)}.${this.internalSmoothedValues.lastArrayPositive}`,JSON.stringify(channel.lastArrayPositive),true);
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	async calculateSmoothedValue(channel){
		// get act timestamp
		const timestamp = Date.now();
		channel.currentTimestamp = timestamp;
		/*
		let differenceTime = 0;
		let weightOldValue = 0;
		let weightCurrentValue = 0;
		let smoothtime = 0;
		*/
		// Select the calculationtype

		switch(channel.type){
			case this.calculationtype.avgArray:
				this.calculateAvgArray(channel);
				break;
			case this.calculationtype.avg:
			default:

				this.calculateAvg(channel);
				/*
				differenceTime = timestamp - channel.lastTimestamp;
				//this.log.info("difference: " + differenceTime);
				smoothtime = channel.smoothtimePositive;
				weightCurrentValue = channel.currentValue * differenceTime / smoothtime;
				for(let i = 0 ; i<= channel.lastArrayPositive.value.length; i++){
					if((channel.lastArrayPositive.value[i].ts + differenceTime) < timestamp){
						channel.lastArrayPositive.value[i].ts += differenceTime;
						weightOldValue = channel.lastArrayPositive.value[i].val * differenceTime / smoothtime;
						break;
					}
				}
				this.setStateAsync(`${this.generateInternalChannel(channel.name)}.${this.internalSmoothedValues.lastArrayPositive}`,JSON.stringify(channel.lastArrayPositive),true);
				this.log.info(`${channel.smoothed} - ${weightCurrentValue} - ${weightOldValue}`);
				channel.smoothed += weightCurrentValue - weightOldValue;*/
		}

		// assign timestamp as last changed timestampt
		channel.lastTimestamp = timestamp;
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	async calculateAvg(channel){
		this.newValueToArray(channel);
		channel.lastArrayPositive.smoothed += channel.lastArrayPositive.additionalValue - channel.lastArrayPositive.reduceValue;
		channel.smoothed = channel.lastArrayPositive.smoothed;
		this.log.debug("New value smoothed: " + channel.smoothed);
		this.log.debug("----- end cycle -----");
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	calculateAvgArray(channel){
		this.newValueToArray(channel);
		// Add all arrayelements and build the smoothed value
		const lastElementIndex = channel.lastArrayPositive.value.length - 2;
		let sum = 0;
		for(let elementIndex = 0 ; elementIndex <= lastElementIndex ; elementIndex++){
			const timedifferenceBetweenElements = channel.lastArrayPositive.value[elementIndex + 1].ts - channel.lastArrayPositive.value[elementIndex].ts;
			const weightOfElement = timedifferenceBetweenElements * channel.lastArrayPositive.value[elementIndex].val;
			sum += weightOfElement;
		}
		channel.lastArrayPositive.smoothed = sum / channel.smoothtimePositive;

		channel.smoothed = channel.lastArrayPositive.smoothed;

		this.log.debug("New value smoothed: " + channel.smoothed);
		this.log.debug("----- end cycle -----");
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	async newValueToArray(channel){
		const smoothtime = channel.smoothtimePositive;
		const lastElementIndex = channel.lastArrayPositive.value.length - 1;
		// Generate diffenrence time and additonal Value
		let differenceTimeLastValue = channel.currentTimestamp - channel.lastArrayPositive.value[lastElementIndex].ts;
		const additionalValue = differenceTimeLastValue * channel.lastArrayPositive.value[lastElementIndex].val / smoothtime;

		// Add new value
		channel.lastArrayPositive.value.push({val:channel.currentValue,ts:channel.currentTimestamp});

		// value to reduce smoothed value
		let reduceValue = 0;
		this.log.debug("");
		this.log.debug("----- start new cycle -----");
		// Change Array elements after adding newValue
		do{
			const differencetimeBetweenElements = channel.lastArrayPositive.value[1].ts - channel.lastArrayPositive.value[0].ts;
			if(differenceTimeLastValue < differencetimeBetweenElements){
				channel.lastArrayPositive.value[0].ts +=  differenceTimeLastValue;
				reduceValue += differenceTimeLastValue * channel.lastArrayPositive.value[0].val / smoothtime;
				this.log.debug("reduce " + differenceTimeLastValue + "ms with value " + channel.lastArrayPositive.value[0].val + ".");
				break;
			}
			else if(differenceTimeLastValue === differencetimeBetweenElements){
				reduceValue += differenceTimeLastValue * channel.lastArrayPositive.value[0].val / smoothtime;
				channel.lastArrayPositive.value.shift();
				this.log.debug("reduce " + differenceTimeLastValue + "ms with value " + channel.lastArrayPositive.value[0].val + " and shift array.");
				break;
			}
			else{
				reduceValue += differencetimeBetweenElements * channel.lastArrayPositive.value[0].val / smoothtime;
				differenceTimeLastValue -= differencetimeBetweenElements;
				channel.lastArrayPositive.value.shift();
				this.log.debug("reduce " + differencetimeBetweenElements + "ms with value " + channel.lastArrayPositive.value[0].val + ", shift array and check next element.");
			}
		}while(channel.lastArrayPositive.value.length !== 0);// This condition is hopefully ever true

		// Shows the hole timedifference from the oldest to the newest element in the array
		this.log.debug("Hole timedifference in the array: " +(channel.lastArrayPositive.value[channel.lastArrayPositive.value.length - 1].ts - channel.lastArrayPositive.value[0].ts) / 1000 + "s.");

		channel.lastArrayPositive.additionalValue = additionalValue;
		channel.lastArrayPositive.reduceValue = reduceValue;
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