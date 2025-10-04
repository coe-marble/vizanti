// ros-webrtc-client.js
import '../lib/msgpack.min.js';

const paramsModule = await import(`${base_url}/ros_launch_params`);
const params = paramsModule.default;

export class ROSWebRTCClient {
    constructor(url, port) {
        this.serverUrl = window.location.hostname + ":" + params.port_rosbridge;
        this.dataChannel = null;
        this.pc = null;
        this.ws = null;
        this.isConnected = false;

        // ROS-specific
        // subscribers: topic -> Set(callbacks)
        this.subscribers = new Map();
        // publishers: topic -> { messageType, publish(), unadvertise() }
        this.publishers = new Map();

        // Pending service requests: req_id -> {resolve, reject, timer}
        this.pendingServiceRequests = new Map();

        // Protocol constants
        this.VERSION = 1;
        this.MSG_PUBLISH = 0x03;
        this.MSG_TOPIC_DATA = 0x04;
        this.MSG_SERVICE_CALL = 0x05;
        this.MSG_SERVICE_RESP = 0x06;
        this.MSG_CLIENT_STATE = 0x07; // NEW

        // debounce timer id for state sync
        this._stateSyncTimer = null;
        this._stateSyncDelay = 500; // ms

        this.connect();
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket("ws://" + this.serverUrl + "/ws");

            this.ws.onopen = async () => {
                console.log("WebSocket connected");

                // Set up WebRTC
                this.pc = new RTCPeerConnection();

                // Create data channel with binary type
                this.dataChannel = this.pc.createDataChannel("ros-channel");
                this.dataChannel.binaryType = 'arraybuffer';

                this.dataChannel.onopen = () => {
                    console.log("ROS WebRTC data channel opened!");
                    this.isConnected = true;

                    // send full state shortly after open to let things settle
                    setTimeout(() => {
                        this._sendClientState();
                    }, 500);

                    resolve();
                };

                this.dataChannel.onclose = () => {
                    console.log("Data channel closed!");
                    this.isConnected = false;
                };

                this.dataChannel.onmessage = (event) => {
                    this._handleROSMessage(event.data);
                };

                // Create offer
                const offer = await this.pc.createOffer();
                await this.pc.setLocalDescription(offer);

                // Send offer via WebSocket
                this.ws.send(JSON.stringify({
                    type: 'offer',
                    sdp: this.pc.localDescription.sdp,
                    sdpType: this.pc.localDescription.type
                }));
            };

            this.ws.onmessage = async (event) => {
                const message = JSON.parse(event.data);

                if (message.type === 'answer') {
                    await this.pc.setRemoteDescription(
                        new RTCSessionDescription({
                            sdp: message.sdp,
                            type: message.sdpType
                        })
                    );
                    console.log("WebRTC connection established");
                }
            };

            this.ws.onerror = (error) => {
                console.error("WebSocket error:", error);
                reject(error);
            };

            this.ws.onclose = () => {
                console.log("WebSocket closed, trying to reconnect...");
                this.isConnected = false;
                setTimeout(() => this.connect(), 2000);
            };
        });
    }

    _encodeMessage(msgType, topic, msgDefinition, data) {
        const encoder = new TextEncoder();
        const topicBytes = encoder.encode(topic || '');
        const defBytes = encoder.encode(msgDefinition || '');

        let dataBytes;
        if (data instanceof Uint8Array) {
            dataBytes = data;
        } else if (data instanceof ArrayBuffer) {
            dataBytes = new Uint8Array(data);
        } else {
            // Convert JS object/value to MessagePack binary
            dataBytes = msgpack.serialize(data ?? {});
        }

        const totalSize = 12 + topicBytes.length + defBytes.length + dataBytes.length;
        const packet = new ArrayBuffer(totalSize);
        const view = new DataView(packet);

        view.setUint8(0, this.VERSION);
        view.setUint8(1, msgType);
        view.setUint16(2, topicBytes.length, false);
        view.setInt32(4, defBytes.length, false);
        view.setInt32(8, dataBytes.length, false);

        let offset = 12;
        new Uint8Array(packet, offset, topicBytes.length).set(topicBytes);
        offset += topicBytes.length;
        new Uint8Array(packet, offset, defBytes.length).set(defBytes);
        offset += defBytes.length;
        new Uint8Array(packet, offset, dataBytes.length).set(dataBytes);

        return packet;
    }

    /**
     * Decode a message from the ROS-WebRTC protocol
     */
    _decodeMessage(arrayBuffer) {
        const view = new DataView(arrayBuffer);
        const decoder = new TextDecoder();

        // Read header
        const version = view.getUint8(0);
        const msgType = view.getUint8(1);
        const topicLen = view.getUint16(2, false);  // big-endian
        const defLen = view.getInt32(4, false);     // big-endian
        const dataLen = view.getInt32(8, false);    // big-endian

        if (version !== this.VERSION) {
            console.error(`Unsupported protocol version: ${version}`);
            return null;
        }

        // Read payload
        let offset = 12;
        const topic = decoder.decode(new Uint8Array(arrayBuffer, offset, topicLen));
        offset += topicLen;

        const msgDefinition = decoder.decode(new Uint8Array(arrayBuffer, offset, defLen));
        offset += defLen;

        const dataBytes = new Uint8Array(arrayBuffer, offset, dataLen);

        return {
            msgType,
            topic,
            msgDefinition,
            data: dataBytes
        };
    }

    _handleROSMessage(arrayBuffer) {
        try {
            const decoded = this._decodeMessage(arrayBuffer);
            if (!decoded) return;
            const { msgType, topic, msgDefinition, data } = decoded;

            if (msgType === this.MSG_TOPIC_DATA) {
                // Binary MessagePack payload
                const message = msgpack.deserialize(data);

                const callbacks = this.subscribers.get(topic);
                if (callbacks && callbacks.size > 0) {
                    callbacks.forEach(cb => {
                        try { cb(message); } catch (e) {
                            console.error(`Error in subscriber callback for ${topic}:`, e);
                        }
                    });
                }
            } else if (msgType === this.MSG_SERVICE_RESP) {
                const resp = msgpack.deserialize(data);
                const reqId = resp && resp._req_id;
                const pending = this.pendingServiceRequests.get(reqId);
                if (pending) {
                    clearTimeout(pending.timer);
                    this.pendingServiceRequests.delete(reqId);
                    if (resp.error) {
                        pending.reject(new Error(resp.error));
                    } else {
                        pending.resolve(resp.result);
                    }
                } else {
                    console.warn(`Received service response for unknown request id ${reqId}`);
                }
           } else {
                console.warn(`Unhandled msgType ${msgType} from bridge`);
            }
        } catch (err) {
            console.error("Error handling ROS message:", err);
        }
    }

    /**
     * Schedule sending full client state to bridge (debounced)
     */
    scheduleStateSync() {
        if (!this.isConnected || !this.dataChannel || this.dataChannel.readyState !== 'open') {
            return;
        }
        if (this._stateSyncTimer) {
            clearTimeout(this._stateSyncTimer);
        }
        this._stateSyncTimer = setTimeout(() => {
            this._sendClientState();
            this._stateSyncTimer = null;
        }, this._stateSyncDelay);
    }

    /**
     * Build and send the full client state: subscribers and publishers maps
     */
    _sendClientState() {
        if (!this.isConnected || !this.dataChannel || this.dataChannel.readyState !== 'open') {
            return;
        }

        // Build subscribers: topic -> messageType
        const subs = {};
        for (const [topic, callbacks] of this.subscribers.entries()) {
            // We don't have per-topic msgType in the subscribers Map (callbacks only),
            // but the user passed messageType into subscribe(); we assume we stored it by convention:
            // For simplicity, store messageType on the callback Set itself is awkward; instead
            // require that subscribe(...) uses this._recordSubscriberType (below).
            // Fallback to empty string if unknown.
            const meta = callbacks.__meta;
            subs[topic] = (meta && meta.messageType) ? meta.messageType : '';
        }

        // Build publishers: topic -> messageType
        const pubs = {};
        for (const [topic, pubObj] of this.publishers.entries()) {
            pubs[topic] = pubObj.messageType || '';
        }

        const payload = {
            subscribers: subs,
            publishers: pubs
        };

        const packet = this._encodeMessage(
            this.MSG_CLIENT_STATE,
            '', // topic not used for client state
            '', // no msg_def
            payload
        );

        try {
            this.dataChannel.send(packet);
            console.log("Sent client state to bridge:", payload);
        } catch (e) {
            console.error("Failed to send client state:", e);
        }
    }

    /**
     * Subscribe to a ROS topic. This now records messageType and triggers a full-state sync.
     * @param {string} topic
     * @param {string} messageType
     * @param {function} callback
     */
    subscribe(topic, messageType, callback) {
        if (!this.subscribers.has(topic)) {
            const s = new Set();
            // attach meta object to hold messageType
            s.__meta = { messageType };
            this.subscribers.set(topic, s);
            // schedule sync so bridge knows we want this topic
            this.scheduleStateSync();
        }
        const callbacks = this.subscribers.get(topic);
        callbacks.add(callback);
        return {
            topic,
            unsubscribe: () => {
                const cbs = this.subscribers.get(topic);
                if (cbs) {
                    cbs.delete(callback);
                    if (cbs.size === 0) {
                        this.subscribers.delete(topic);
                        // state changed, notify bridge
                        this.scheduleStateSync();
                    }
                }
            }
        };
    }

    /**
     * Advertise a ROS topic for publishing. Triggers full-state sync.
     * @param {string} topic
     * @param {string} messageType
     */
    advertise(topic, messageType) {
        const publisher = {
            topic: topic,
            messageType: messageType,
            publish: (message) => {
                if (!this.isConnected || !this.dataChannel || this.dataChannel.readyState !== 'open') {
                    //console.error(`Cannot publish to ${topic}: Not connected`);
                    return false;
                }

                // Send message as JSON (like ROSLIB does)
                const packet = this._encodeMessage(
                    this.MSG_PUBLISH,
                    topic,
                    messageType,
                    message // _encodeMessage will JSON.stringify objects
                );

                try {
                    this.dataChannel.send(packet);
                    return true;
                } catch (e) {
                    console.error(`Failed to send publish for ${topic}:`, e);
                    return false;
                }
            },
            unadvertise: () => {
                this.publishers.delete(topic);
                this.scheduleStateSync();
            }
        };

        this.publishers.set(topic, publisher);
        this.scheduleStateSync();
        return publisher;
    }

    /**
     * Call a ROS service and wait for the response.
     * @param {string} service - service name (e.g. '/set_bool')
     * @param {string} serviceType - 'package/Service'
     * @param {object} request - JS object representing request fields
     * @param {number} timeoutMs - optional timeout in ms (default 5000)
     * @returns {Promise<object>} resolves to the service response object
     */
    async callService(service, serviceType, request = {}, timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected || !this.dataChannel || this.dataChannel.readyState !== 'open') {
                //reject(new Error("Not connected"));
                return;
            }

            // generate unique request id
            const reqId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2));

            // payload wrapper: include request id so bridge can respond
            const payload = {
                _req_id: reqId,
                args: request
            };

            console.log(payload)

            const packet = this._encodeMessage(
                this.MSG_SERVICE_CALL,
                service,
                serviceType,
                payload
            );

            // set up timeout
            const timer = setTimeout(() => {
                if (this.pendingServiceRequests.has(reqId)) {
                    this.pendingServiceRequests.delete(reqId);
                    reject(new Error("Service call timed out"));
                }
            }, timeoutMs);

            // store pending resolver
            this.pendingServiceRequests.set(reqId, { resolve, reject, timer });

            try {
                this.dataChannel.send(packet);
            } catch (e) {
                clearTimeout(timer);
                this.pendingServiceRequests.delete(reqId);
                reject(e);
            }
        });
    }

    /**
     * Close all connections
     */
    close() {
        if (this.dataChannel) {
            this.dataChannel.close();
        }
        if (this.pc) {
            this.pc.close();
        }
        if (this.ws) {
            this.ws.close();
        }
        this.isConnected = false;
        this.subscribers.clear();
        this.publishers.clear();
        // clear pending service requests
        for (const [id, pending] of this.pendingServiceRequests.entries()) {
            clearTimeout(pending.timer);
            pending.reject(new Error("Connection closed"));
        }
        this.pendingServiceRequests.clear();
    }
}