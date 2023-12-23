class statehandlingtypes{
	constructor(options) {
		this.adapter = options.adapter;
		this.usersCache = {};
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	generateInternalChannelString(name,withNamespace = false){
		if(withNamespace){
			return `${this.adapter.namespace}.${this.adapter.internalFolder.smoothedvalues}.${name}`;
		}
		else{
			return `${this.adapter.internalFolder.smoothedvalues}.${name}`;
		}
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	// delete not configured states
	async delNotConfiguredIds()
	{
		// Get all objects in the adapter
		this.AdapterObjectsAtStart = await this.adapter.getAdapterObjectsAsync();
		let activeString = "";
		for(const elementName in this.adapter.config.statesAccordion){
			const element = this.adapter.config.statesAccordion[elementName];
			if(element.name && element.name !== ""){
				for(const stateName in this.adapter.internalSmoothedValues){
					activeString = `${this.generateInternalChannelString(element.name,true)}.${stateName}`;
					delete this.AdapterObjectsAtStart[activeString];
				}
				activeString = this.generateInternalChannelString(element.name,true);
				delete this.AdapterObjectsAtStart[activeString];
			}
		}
		// delete smoothedvalue folder from array
		activeString = `${this.adapter.namespace}.${this.adapter.internalFolder.smoothedvalues}`;
		delete this.AdapterObjectsAtStart[activeString];

		// delete the remaining states
		for(const state in this.AdapterObjectsAtStart){
			this.adapter.delObjectAsync(state);
		}
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	// Create internal folders and states
	async createInternalValues(){
		for(const elementName in this.adapter.config.statesAccordion){
			const element = this.adapter.config.statesAccordion[elementName];
			try{
				const resultObject = await this.adapter.getForeignObjectAsync(element.id);
				const resultState = await this.adapter.getForeignStateAsync(element.id);
				if(resultObject && resultState){

					// Assign element by name (later these are the channel)
					this.adapter.activeChannels[element.name] = {
						smoothed: resultState.val,
						currentValue: resultState.val,
						currentTimestamp : Date.now(),
						lastValue: resultState.val,
						lastTimestamp: Date.now(),
						currentAverage: 0,
						currentStandardDeviation: 0,
						currentMaxDeviation: 0,

						// Assigne values from object
						// @ts-ignore
						unit: resultObject.common.unit,

						// Assign values from config
						name: element.name,
						id: element.id,
						refreshRate: element.refreshRate,
						refreshWithStatechange: element.refreshWithStatechange,
						type: element.type,
						smoothtime: element.smoothtime * 1000,
						separateSmoothtimeForNegativeDifference: element.separateSmoothtimeForNegativeDifference,
						smoothtimeNegative: element.smoothtimeNegative * 1000,
						limitInNegativeDirection: element.limitInNegativeDirection,
						negativeLimit: element.negativeLimit,
						limitInPositiveDirection: element.limitInPositiveDirection,
						positiveLimit: element.positiveLimit,
						limitDecimalplaces: element.limitDecimalplaces,
						decimalplaces: element.decimalplaces,
						ignoreAboveStandardDeviation: element.ignoreAboveStandardDeviation,
						standardDeviationLimit: element.standardDeviationLimit
					};

					//Assign the created element by id
					if(!this.adapter.activeStates[element.id]){
						this.adapter.activeStates[element.id] = {};
					}
					this.adapter.activeStates[element.id][element.name] = this.adapter.activeChannels[element.name];
				}
			}
			catch{
				const message = `The configured value: ${element.name} with the id: ${element.id} is not able to read.`;
				this.adapter.log.warn(message);
			}
		}

		// Generate internal folder for the smoothed values values
		await this.adapter.setObjectNotExistsAsync(`${this.adapter.internalFolder.smoothedvalues}`,{
			"type": "folder",
			"common": {
				"name": "smoothed values"
			},
			native : {},
		});

		// Create the states of configed values
		for(const channelName in this.adapter.activeChannels){
			const channel = this.adapter.activeChannels[channelName];
			// create State for the name
			await this.adapter.setObjectNotExistsAsync(this.generateInternalChannelString(channelName),{
				type: "channel",
				common: {
					name: channelName,
					desc: channel.sourceId
				},
				native: {},
			});

			// create last values arrays
			const stateId = `${this.generateInternalChannelString(channelName)}.${this.adapter.internalSmoothedValues.lastArray}`;
			// @ts-ignore
			await this.adapter.setObjectNotExistsAsync(stateId,{
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
			const lastArrayResult = await this.adapter.getStateAsync(`${stateId}`);
			// @ts-ignore
			channel.lastArray = JSON.parse(lastArrayResult.val);
			if((!channel.lastArray.smoothtime || channel.smoothtime !== channel.lastArray.smoothtime) ||
				(!channel.lastArray.smoothtimeNegative || channel.smoothtimeNegative !== channel.lastArray.smoothtimeNegative)){
				channel.lastArray = {};
				channel.lastArray.smoothtime = channel.smoothtime;
				channel.lastArray.smoothtimeNegative = channel.smoothtimeNegative;
				channel.lastArray.value = [];
				channel.lastArray.value.push({val:channel.currentValue,ts:Date.now() - (channel.smoothtime)},{val:channel.currentValue,ts:Date.now()});
				this.adapter.log.debug("LastArray created: " + JSON.stringify(channel.lastArray));
				this.adapter.setStateAsync(stateId,JSON.stringify(channel.lastArray),true);
			}

			// create State for the name
			await this.adapter.setObjectNotExistsAsync(`${this.generateInternalChannelString(channelName)}.${this.adapter.internalSmoothedValues.smoothed}`,{
				type: "state",
				common: {
					name: "smoothed value",
					type: "number",
					role: "value",
					read: true,
					write: false,
					unit: channel.unit,
					def: channel.smoothed
				},
				native: {},
			});
			this.adapter.subscribeForeignStatesAsync(channel.id);
			this.adapter.outputSmoothedValues(channel);
		}
	}
}

module.exports = statehandlingtypes;