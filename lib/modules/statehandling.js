/** This class handles the states for the adapter. */
class statehandlingtypes {
    /**
     * @param options adapter
     */
    constructor(options) {
        this.adapter = options.adapter;
        this.usersCache = {};
    }

    /******************************************************************
     * ****************************************************************
     * ***************************************************************/

    /**
     * @param name name of the configed channel
     * @param withNamespace generate channelstring with namespace
     */
    generateInternalChannelString(name, withNamespace = false) {
        if (withNamespace) {
            return `${this.adapter.namespace}.${this.adapter.internalFolder.smoothedvalues}.${name}`;
        }
        return `${this.adapter.internalFolder.smoothedvalues}.${name}`;
    }

    /******************************************************************
     * ****************************************************************
     * ***************************************************************/

    // delete not configured states
    /**
     * delete the not configed ids from adapter namespace
     */
    async delNotConfiguredIds() {
        // Get all objects in the adapter
        this.AdapterObjectsAtStart = await this.adapter.getAdapterObjectsAsync();
        let activeString = '';
        for (const elementName in this.adapter.config.statesAccordion) {
            const element = this.adapter.config.statesAccordion[elementName];
            if (element.name && element.name !== '') {
                for (const stateName in this.adapter.internalSmoothedValues) {
                    activeString = `${this.generateInternalChannelString(element.name, true)}.${stateName}`;
                    delete this.AdapterObjectsAtStart[activeString];
                }
                activeString = this.generateInternalChannelString(element.name, true);
                delete this.AdapterObjectsAtStart[activeString];
            }
        }
        // delete smoothedvalue folder from array
        activeString = `${this.adapter.namespace}.${this.adapter.internalFolder.smoothedvalues}`;
        delete this.AdapterObjectsAtStart[activeString];

        // delete the remaining states
        for (const state in this.AdapterObjectsAtStart) {
            this.adapter.delObjectAsync(state);
        }
    }

    /******************************************************************
     * ****************************************************************
     * ***************************************************************/

    // Create internal folders and states
    /**
     * creates internal values in case of the configuration
     */
    async createInternalValues() {
        for (const elementName in this.adapter.config.statesAccordion) {
            const element = this.adapter.config.statesAccordion[elementName];
            try {
                const resultObject = await this.adapter.getForeignObjectAsync(element.id);
                if (resultObject.common.type === 'number') {
                    const elementName = element.name.replace(this.adapter.FORBIDDEN_CHARS, '_');
                    if (elementName === element.name) {
                        const resultState = await this.adapter.getForeignStateAsync(element.id);
                        if (resultObject && resultState) {
                            // Assign element by name (later these are the channel)
                            this.adapter.activeChannels[element.name] = {
                                smoothed: resultState.val,
                                currentValue: resultState.val,
                                currentTimestamp: Date.now(),
                                lastValue: resultState.val,
                                lastTimestamp: Date.now(),
                                currentAverage: 0,
                                currentStandardDeviation: 0,
                                currentMaxDeviation: 0,

                                // Assigne values from object

                                unit: resultObject.common.unit,

                                // Assign values from config
                                name: element.name,
                                id: element.id,
                                refreshRate: element.refreshRate,
                                refreshWithStatechange: element.refreshWithStatechange,
                                type: element.type,
                                smoothtime: element.smoothtime * 1000,
                                separateSmoothtimeForNegativeDifference:
                                    element.separateSmoothtimeForNegativeDifference,
                                smoothtimeNegative: element.smoothtimeNegative * 1000,
                                limitInNegativeDirection: element.limitInNegativeDirection,
                                negativeLimit: element.negativeLimit,
                                limitInPositiveDirection: element.limitInPositiveDirection,
                                positiveLimit: element.positiveLimit,
                                limitDecimalplaces: element.limitDecimalplaces,
                                decimalplaces: element.decimalplaces,
                                ignoreAboveStandardDeviation: element.ignoreAboveStandardDeviation,
                                standardDeviationLimit: element.standardDeviationLimit,
                                unsmoothedStandardDeviationTime: element.unsmoothedStandardDeviationTime,
                            };

                            // Limit initial value
                            if (
                                this.adapter.activeChannels[element.name].limitInNegativeDirection &&
                                this.adapter.activeChannels[element.name].currentValue <
                                    this.adapter.activeChannels[element.name].negativeLimit
                            ) {
                                this.adapter.activeChannels[element.name].currentValue =
                                    this.adapter.activeChannels[element.name].negativeLimit;
                                this.adapter.activeChannels[element.name].smoothed =
                                    this.adapter.activeChannels[element.name].negativeLimit;
                            } else if (
                                this.adapter.activeChannels[element.name].limitInPositiveDirection &&
                                this.adapter.activeChannels[element.name].currentValue >
                                    this.adapter.activeChannels[element.name].positiveLimit
                            ) {
                                this.adapter.activeChannels[element.name].currentValue =
                                    this.adapter.activeChannels[element.name].positiveLimit;
                                this.adapter.activeChannels[element.name].smoothed =
                                    this.adapter.activeChannels[element.name].positiveLimit;
                            }

                            //Assign the created element by id
                            if (!this.adapter.activeStates[element.id]) {
                                this.adapter.activeStates[element.id] = {};
                                // Subscribe state on here, because more times a subscribtion is bad for alias
                                this.adapter.subscribeForeignStatesAsync(element.id);
                            }
                            this.adapter.activeStates[element.id][element.name] =
                                this.adapter.activeChannels[element.name];
                        }
                    } else {
                        this.adapter.log.warn(
                            `The given name ${element.name} with th id ${element.id} is not a valid name. Please change it.`,
                        );
                    }
                } else {
                    this.adapter.log.warn(
                        `The selected id ${element.id} in the config with the name ${element.name} is not a number`,
                    );
                }
            } catch {
                const message = `The configured value: ${element.name} with the id: ${element.id} is not able to read.`;
                this.adapter.log.warn(message);
            }
        }

        // Generate internal folder for the smoothed values values
        await this.adapter.setObjectNotExistsAsync(`${this.adapter.internalFolder.smoothedvalues}`, {
            type: 'folder',
            common: {
                name: 'smoothed values',
            },
            native: {},
        });

        // Create the states of configed values
        for (const channelName in this.adapter.activeChannels) {
            const channel = this.adapter.activeChannels[channelName];
            // create State for the name
            await this.adapter.setObjectNotExistsAsync(this.generateInternalChannelString(channelName), {
                type: 'channel',
                common: {
                    name: channelName,
                    desc: channel.sourceId,
                },
                native: {},
            });

            // create last values arrays
            const stateId = `${this.generateInternalChannelString(channelName)}.${this.adapter.internalSmoothedValues.lastArray}`;

            await this.adapter.setObjectNotExistsAsync(stateId, {
                type: 'state',
                common: {
                    name: 'last values and times',
                    type: 'json',
                    role: 'value',
                    read: true,
                    write: false,
                    def: JSON.stringify({}),
                },
                native: {},
            });
            const lastArrayResult = await this.adapter.getStateAsync(`${stateId}`);

            channel.lastArray = JSON.parse(lastArrayResult.val);
            if (
                !channel.lastArray.smoothtime ||
                channel.smoothtime !== channel.lastArray.smoothtime ||
                !channel.lastArray.smoothtimeNegative ||
                channel.smoothtimeNegative !== channel.lastArray.smoothtimeNegative
            ) {
                channel.lastArray = {};
                (channel.lastArray.currentStandardDeviation = channel.currentStandardDeviation),
                    (channel.lastArray.currentMaxDeviation = channel.currentMaxDeviation),
                    (channel.lastArray.smoothtime = channel.smoothtime);
                channel.lastArray.smoothtimeNegative = channel.smoothtimeNegative;
                channel.lastArray.value = [];
                let timedifference = channel.smoothtime;
                if (timedifference === 0) {
                    timedifference = channel.unsmoothedStandardDeviationTime;
                }
                channel.lastArray.value.push(
                    { val: channel.currentValue, ts: Date.now() - timedifference },
                    { val: channel.currentValue, ts: Date.now() },
                );
                this.adapter.log.debug(`LastArray created: ${JSON.stringify(channel.lastArray)}`);
                this.adapter.setStateAsync(stateId, JSON.stringify(channel.lastArray), true);
            }

            // create State for the name
            await this.adapter.setObjectNotExistsAsync(
                `${this.generateInternalChannelString(channelName)}.${this.adapter.internalSmoothedValues.smoothed}`,
                {
                    type: 'state',
                    common: {
                        name: 'smoothed value',
                        type: 'number',
                        role: 'value',
                        read: true,
                        write: false,
                        unit: channel.unit,
                        def: channel.smoothed,
                    },
                    native: {},
                },
            );
            //this.adapter.subscribeForeignStatesAsync(channel.id); // Old place for subscribtion
            this.adapter.outputSmoothedValues(channel);
        }
    }
}

module.exports = statehandlingtypes;
