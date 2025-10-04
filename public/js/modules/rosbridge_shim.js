// roslib_shim.js
// Compatibility shim for ROSLIB.js API using ROSWebRTCClient backend.

import { ROSWebRTCClient } from "./ros-webrtc-client.js";

// ----------------------------
// ROS connection wrapper
// ----------------------------
export class Ros {
    constructor({ url, port }) {
        console.log("[ROSLIB shim] Connecting to", url, "port", port);

        this.url = url;
        this.port = port;
        this.status = "Connecting";
        this.connected = false;

        this._connection_handlers = [];
        this._error_handlers = [];
        this._close_handlers = [];

        // Kick off connection
        this.webrtc = new ROSWebRTCClient(url, port);
        this._monitorConnectionState();
    }

    // Monitor .isConnected periodically
    async _monitorConnectionState() {
        let wasConnected = false;
        for (;;) {
            const nowConnected = !!this.webrtc?.isConnected;
            if (nowConnected && !wasConnected) {
                console.log("[ROSLIB shim] WebRTC connected");
                this.connected = true;
                this.status = "Connected";
                this._connection_handlers.forEach((fn) => fn());
            } else if (!nowConnected && wasConnected) {
                console.log("[ROSLIB shim] WebRTC disconnected");
                this.connected = false;
                this.status = "Disconnected";
                this._close_handlers.forEach((fn) => fn());
            }
            wasConnected = nowConnected;
            await new Promise((r) => setTimeout(r, 500));
        }
    }

    on(event, callback) {
        if (event === "connection") this._connection_handlers.push(callback);
        else if (event === "error") this._error_handlers.push(callback);
        else if (event === "close") this._close_handlers.push(callback);
    }
}

// ----------------------------
// ROS Topic wrapper
// ----------------------------
export class Topic {
    constructor({ ros, name, messageType, throttle_rate = 0, compression = null }) {
        this.ros = ros;
        this.name = name;
        this.messageType = messageType;
        this.throttle_rate = throttle_rate;
        this.compression = compression;
        this._listener = null;
        this._subscription = null;
    }

    subscribe(callback) {
        console.log(`[ROSLIB shim] Subscribing to ${this.name} (${this.messageType})`);
        this._listener = callback;
        const sub = this.ros.webrtc.subscribe(this.name, this.messageType, (msg) => {
            try {
                callback(msg);
            } catch (e) {
                console.error(`[ROSLIB shim] Error in subscriber for ${this.name}:`, e);
            }
        });
        this._subscription = sub;
        return this;
    }

    unsubscribe() {
        console.log(`[ROSLIB shim] Unsubscribing from ${this.name}`);
        if (this._subscription?.unsubscribe) this._subscription.unsubscribe();
    }

    publish(msg) {
        if (!this.ros.webrtc.isConnected) {
            console.warn(`[ROSLIB shim] Tried to publish to ${this.name} but not connected`);
            return;
        }
        console.log(`[ROSLIB shim] Publishing to ${this.name}`);
        const pub = this.ros.webrtc.publishers.get(this.name)
            || this.ros.webrtc.advertise(this.name, this.messageType);
        pub.publish(msg);
    }
}

// ----------------------------
// ROS Service wrapper
// ----------------------------
export class Service {
    constructor({ ros, name, serviceType }) {
        this.ros = ros;
        this.name = name;
        this.serviceType = serviceType;
    }

    callService(request, onResult, onError) {
        console.log(`[ROSLIB shim] Calling service ${this.name}`);
        this.ros.webrtc
            .callService(this.name, this.serviceType, request)
            .then((res) => onResult && onResult(res))
            .catch((err) => {
                console.error(`[ROSLIB shim] Service ${this.name} error:`, err);
                if (onError) onError(err);
            });
    }
}

// ----------------------------
// ROS Message wrapper
// ----------------------------
export class Message {
    constructor(values = {}) {
        Object.assign(this, values);
    }
}

// ----------------------------
// ROS ServiceRequest wrapper
// ----------------------------
export class ServiceRequest {
    constructor(values = {}) {
        Object.assign(this, values);
    }
}

// ----------------------------
// Global export compatibility
// ----------------------------
export const ROSLIB = {
    Ros,
    Topic,
    Service,
    Message,
    ServiceRequest,
};

window.ROSLIB = ROSLIB;

console.log("[ROSLIB shim] Loaded (WebRTC backend)");
