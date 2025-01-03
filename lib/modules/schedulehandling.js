const schedule = require('node-schedule');
/** This class handles the schedules for the adapter. */
class schedulehandlingtypes {
    /**
     * @param options adapter
     */
    constructor(options) {
        this.adapter = options.adapter;
        this.usersCache = {};
    }

    /**
     * init the Schedules of the adapter
     */
    async initSchedules() {
        // Erste Schritte für die Übernahme !!!
        for (const channelName in this.adapter.activeChannels) {
            const channel = this.adapter.activeChannels[channelName];
            if (channel.refreshRate !== 0) {
                // Just cron a valid refreshrate 0 => refresh on statechange
                if (!this.adapter.cronJobs[channel.refreshRate]) {
                    this.adapter.cronJobs[channel.refreshRate] = {};
                    if (channel.refreshRate !== 60) {
                        this.adapter.cronJobs[channel.refreshRate][this.adapter.cronJobs.jobIdKey] =
                            schedule.scheduleJob(
                                `*/${channel.refreshRate} * * * * *`,
                                this.adapter.outputAddedChannels.bind(this.adapter, channel.refreshRate),
                            );
                    } else {
                        this.adapter.cronJobs[channel.refreshRate][this.adapter.cronJobs.jobIdKey] =
                            schedule.scheduleJob(
                                `0 * * * * *`,
                                this.adapter.outputAddedChannels.bind(this.adapter, channel.refreshRate),
                            );
                    }
                }
                this.adapter.cronJobs[channel.refreshRate][channel.name] = {};
            }
        }
    }

    /******************************************************************
     * ****************************************************************
     * ***************************************************************/

    // Cancel all Scheduled Cronjobs
    /**
     * cancel all schedules tha are registered as cronjob
     */
    cancelAllScheduledCronjobs() {
        for (const cronJobName in this.adapter.cronJobs) {
            const cronJob = this.adapter.cronJobs[cronJobName];
            for (const refreshRateName in cronJob) {
                const refreshRate = cronJob[refreshRateName];
                schedule.cancelJob(refreshRate[this.adapter.cronJobs.jobIdKey]);
                delete refreshRate[this.adapter.cronJobs.jobIdKey];
            }
        }
    }
}

module.exports = schedulehandlingtypes;
