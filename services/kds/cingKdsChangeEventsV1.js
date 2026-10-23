"use strict";
const {EventEmitter}=require("node:events");
// Internal invalidation only. No invoice data, credentials or public socket rooms.
const bus=new EventEmitter();bus.setMaxListeners(0);
function notifyKdsChangedV1(){bus.emit("changed");}
function subscribeKdsChangedV1(listener){bus.on("changed",listener);return()=>bus.off("changed",listener);}
module.exports={notifyKdsChangedV1,subscribeKdsChangedV1};
