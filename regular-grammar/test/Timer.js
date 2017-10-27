/**
 * Created by gritzko on 3/19/17.
 */

class Timer {

    constructor () {
        this.intervals = [];
    }

    push (name) {
        this.intervals.push({time:new Date().getTime(), name});
    }

    pop () {
        const now = new Date().getTime();
        const i = this.intervals.pop();
        console.log(i.name, now-i.time, 'ms');
    }
}

module.exports = Timer;