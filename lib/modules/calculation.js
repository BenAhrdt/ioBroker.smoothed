class calculationtypes{
	constructor(options) {
		this.adapter = options.adapter;
		this.usersCache = {};
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	getStandardDeviation(valuearray){
		//get average
		const average = this.getAverage(valuearray);
		const lastElementIndex = valuearray.value.length - 2;
		const differenceHoleTime = valuearray.value[lastElementIndex + 1].ts - valuearray.value[0].ts;
		let sum = 0;
		for(let elementIndex = 0 ; elementIndex <= lastElementIndex ; elementIndex++){
			const timedifferenceBetweenElements = valuearray.value[elementIndex + 1].ts - valuearray.value[elementIndex].ts;
			const squareOfValueDifference = Math.pow(valuearray.value[elementIndex].val - average,2);
			const weightOfElement = timedifferenceBetweenElements * squareOfValueDifference;
			sum += weightOfElement;
		}
		const standardDeviation = Math.sqrt(sum / differenceHoleTime);
		this.adapter.log.debug("New standard deviation: " + standardDeviation);
		return standardDeviation;
	}

	getAverage(valuearray){
		// Add all arrayelements and build the smoothed value
		const lastElementIndex = valuearray.value.length - 2;
		const differenceHoleTime = valuearray.value[lastElementIndex + 1].ts - valuearray.value[0].ts;
		let sum = 0;
		for(let elementIndex = 0 ; elementIndex <= lastElementIndex ; elementIndex++){
			const timedifferenceBetweenElements = valuearray.value[elementIndex + 1].ts - valuearray.value[elementIndex].ts;
			const weightOfElement = timedifferenceBetweenElements * valuearray.value[elementIndex].val;
			sum += weightOfElement;
		}
		return sum / differenceHoleTime;
	}

	movingAverage(channel){
		this.newValueToArray(channel);
		if(channel.smoothtime !== 0){
			channel.smoothed = this.getAverage(channel.lastArray);
		}
		else{
			channel.smoothed = channel.currentValue;
		}
		this.adapter.log.debug("New value smoothed: " + channel.smoothed);
		this.adapter.log.debug("----- end cycle -----");
		//this.getStandardDeviation(channel.lastArray);
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	lowpassPt1(channel){
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
	}

	/******************************************************************
	 * ****************************************************************
	 * ***************************************************************/

	newValueToArray(channel){
		const lastElementIndex = channel.lastArray.value.length - 1;

		// Generate diffenrence time and additonal Value
		let differenceTimeLastValue = channel.currentTimestamp - channel.lastArray.value[lastElementIndex].ts;

		// Add new value
		channel.lastArray.value.push({val:channel.currentValue,ts:channel.currentTimestamp});

		this.adapter.log.debug("");
		this.adapter.log.debug("----- start new cycle new value to array -----");
		// Change Array elements after adding newValue
		do{
			const differencetimeBetweenElements = channel.lastArray.value[1].ts - channel.lastArray.value[0].ts;
			if(differenceTimeLastValue < differencetimeBetweenElements){
				channel.lastArray.value[0].ts +=  differenceTimeLastValue;
				this.adapter.log.debug("reduce " + differenceTimeLastValue + "ms with value " + channel.lastArray.value[0].val + ".");
				break;
			}
			else if(differenceTimeLastValue === differencetimeBetweenElements){
				channel.lastArray.value.shift();
				this.adapter.log.debug("reduce " + differenceTimeLastValue + "ms with value " + channel.lastArray.value[0].val + " and shift array.");
				break;
			}
			else{
				differenceTimeLastValue -= differencetimeBetweenElements;
				channel.lastArray.value.shift();
				this.adapter.log.debug("reduce " + differencetimeBetweenElements + "ms with value " + channel.lastArray.value[0].val + ", shift array and check next element.");
			}
		}while(channel.lastArray.value.length !== 0);// This condition is hopefully ever true

		// Shows the hole timedifference from the oldest to the newest element in the array
		this.adapter.log.debug("Hole timedifference in the array: " +(channel.lastArray.value[channel.lastArray.value.length - 1].ts - channel.lastArray.value[0].ts) / 1000 + "s.");
		this.adapter.setStateAsync(`${this.adapter.statehandling.generateInternalChannelString(channel.name)}.${this.adapter.internalSmoothedValues.lastArray}`,JSON.stringify(channel.lastArray),true);
		this.adapter.log.debug("----- end new value to array -----");
	}
}

module.exports = calculationtypes;