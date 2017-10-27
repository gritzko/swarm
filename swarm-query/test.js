const Asm = require('.');

const up_tray = [], down_tray = [];
const asm = new Asm({on:frame=>tray.push(''+frame)}, {depth:3});
asm.on(".lww#test?!", {update:frame=>down_tray.push(''+frame)});
eq(up_tray.length, 1);
eq(up_tray[0], ".lww#test?");

const frames = [
    ".lww#test!:key>other", // simple ref
    ".lww#other!:ref>(>more", // 4-ref, default
    ".lww#more!:ref>test" // cycle
];
// CHECK:
// REACH
// - double sub
// - out of reach sub
// - update (reach-shortcut)
// ACK
// - ack from/till relay
// - acked state refs!
// MAP
// - try a trivial mapping (op count?)
asm.update(frames[0]);
eq(down_tray.length, 0);
eq(up_tray.length, 2);
eq(up_tray[1], ".lww#other?");

asm.update(frames[1]);
eq(down_tray.length, 0);
eq(up_tray.length, 3);
eq(up_tray[2], ".lww#more?");

asm.update(frames[2]);
eq(down_tray.length, 1);
eq(down_tray[0], frames.join('\n'));
eq(up_tray.length, 3);

asm.update(frames[2]);
eq(down_tray.length, 1); // no updates requested
eq(up_tray.length, 3);


