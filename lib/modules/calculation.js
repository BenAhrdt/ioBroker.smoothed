class calculationtypes{
	constructor(options) {
		this.adapter = options.adapter;
		this.usersCache = {};
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	valueIsValid(channel,state){
		if(channel.ignoreAboveStandardDeviation){
			if(channel.currentMaxDeviation === 0 || (Math.abs(state.val - channel.lastValue) < channel.currentMaxDeviation)){
				return true;
			}
		}
		else{
			return true;
		}
	}

	calculateStandardDeviation(channel){
		//get average
		this.calculateAverage(channel);
		const lastElementIndex = channel.lastArray.value.length - 2;
		const differenceHoleTime = channel.lastArray.value[lastElementIndex + 1].ts - channel.lastArray.value[0].ts;
		let sum = 0;
		for(let elementIndex = 0 ; elementIndex <= lastElementIndex ; elementIndex++){
			const timedifferenceBetweenElements = channel.lastArray.value[elementIndex + 1].ts - channel.lastArray.value[elementIndex].ts;
			const squareOfValueDifference = Math.pow(channel.lastArray.value[elementIndex].val - channel.currentAverage,2);
			const weightOfElement = timedifferenceBetweenElements * squareOfValueDifference;
			sum += weightOfElement;
		}
		// STandard deviaton 0 if time = 0 (Check later)
		if(differenceHoleTime >0){
			channel.currentStandardDeviation = Math.sqrt(sum / differenceHoleTime);
		}
		else{
			channel.currentStandardDeviation = 0;
		}
		this.adapter.log.debug(`Channel ${channel.name}: New standard deviation:  ${channel.currentStandardDeviation}`);
		channel.currentMaxDeviation = channel.currentStandardDeviation * channel.standardDeviationLimit;

		// assign values to lastArray
		channel.lastArray.currentStandardDeviation = channel.currentStandardDeviation;
		channel.lastArray.currentMaxDeviation = channel.currentMaxDeviation;
		return channel.currentStandardDeviation;
	}

	calculateAverage(channel){
		// Add all arrayelements and build the smoothed value
		const lastElementIndex = channel.lastArray.value.length - 2;
		const differenceWholeTime = channel.lastArray.value[lastElementIndex + 1].ts - channel.lastArray.value[0].ts;
		let sum = 0;
		for(let elementIndex = 0 ; elementIndex <= lastElementIndex ; elementIndex++){
			const timedifferenceBetweenElements = channel.lastArray.value[elementIndex + 1].ts - channel.lastArray.value[elementIndex].ts;
			const weightOfElement = timedifferenceBetweenElements * channel.lastArray.value[elementIndex].val;
			sum += weightOfElement;
		}
		channel.currentAverage = sum / differenceWholeTime;
		return channel.currentAverage;
	}

	movingAverage(channel){
		this.adapter.log.debug(`Channel ${channel.name}: ----- start calculation moving average -----`);
		this.newValueToArray(channel);
		if(channel.smoothtime !== 0){
			channel.smoothed = this.calculateAverage(channel);
		}
		else{
			channel.smoothed = channel.currentValue;
		}
		this.adapter.log.debug(`Channel ${channel.name}: New value smoothed: " + ${channel.smoothed}`);
		this.adapter.log.debug(`Channel ${channel.name}: ----- end calculation moving average -----`);
		this.calculateStandardDeviation(channel);
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	lowpassPt1(channel){
		this.adapter.log.debug(`Channel ${channel.name}: ----- start calculation Pt1 -----`);
		this.newValueToArray(channel);
		let smoothtime = 0;
		if(channel.currentValue >= channel.smoothed || !channel.separateSmoothtimeForNegativeDifference){
			smoothtime = channel.smoothtime;
		}
		else{
			smoothtime = channel.smoothtimeNegative;
		}
		const tau = 1/5;
		if(smoothtime !== 0){
			channel.smoothed += (channel.lastValue - channel.smoothed) *
										(1 - Math.exp(-(channel.currentTimestamp - channel.lastTimestamp)/(smoothtime  * tau)));
		}
		else{
			channel.smoothed = channel.currentValue;
		}
		this.adapter.log.debug(`Channel ${channel.name}: ----- end calculation Pt1 -----`);
		this.calculateStandardDeviation(channel);
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	newValueToArray(channel){
		this.adapter.log.debug(`Channel ${channel.name}: ----- start new value to array -----`);
		const lastElementIndex = channel.lastArray.value.length - 1;

		// Generate diffenrence time and additonal Value
		let differenceTimeLastValue = channel.currentTimestamp - channel.lastArray.value[lastElementIndex].ts;

		// Add new value
		channel.lastArray.value.push({val:channel.currentValue,ts:channel.currentTimestamp});

		// Change Array elements after adding newValue
		do{
			const differencetimeBetweenElements = channel.lastArray.value[1].ts - channel.lastArray.value[0].ts;
			if(differenceTimeLastValue < differencetimeBetweenElements){
				channel.lastArray.value[0].ts +=  differenceTimeLastValue;
				this.adapter.log.debug(`Channel ${channel.name}: reduce ${differenceTimeLastValue} ms with value ${channel.lastArray.value[0].val}.`);
				break;
			}
			else if(differenceTimeLastValue === differencetimeBetweenElements){
				channel.lastArray.value.shift();
				this.adapter.log.debug(`Channel ${channel.name}: reduce ${differenceTimeLastValue} ms with value ${channel.lastArray.value[0].val} and shift array.`);
				break;
			}
			else{
				differenceTimeLastValue -= differencetimeBetweenElements;
				channel.lastArray.value.shift();
				this.adapter.log.debug(`Channel ${channel.name}: reduce ${differencetimeBetweenElements} ms with value ${channel.lastArray.value[0].val}, shift array and check next element.`);
			}
		}while(channel.lastArray.value.length !== 0);// This condition is hopefully ever true

		// Shows the whole timedifference from the oldest to the newest element in the array
		this.adapter.log.debug("Channel ${channel.name}: Whole timedifference in the array: " +(channel.lastArray.value[channel.lastArray.value.length - 1].ts - channel.lastArray.value[0].ts) / 1000 + "s.");
		this.adapter.log.debug("Channel ${channel.name}: ----- end new value to array -----");
	}
}

module.exports = calculationtypes;