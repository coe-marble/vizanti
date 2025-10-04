#!/usr/bin/env python3
# ros_webrtc_bridge.py

import rospy
import asyncio
import threading
import struct
import json
import importlib
import msgpack
import genpy

from queue import Queue
from typing import Dict, Any, Tuple, Set
from collections import defaultdict
from aiohttp import web
from aiortc import RTCPeerConnection, RTCSessionDescription
from rospy import rostime

PORT = 8080

def ros_to_dict(msg, _depth=0, _path="root"):
    indent = "  " * _depth
    def convert(value, path, depth):
        t = type(value)
        tname = t.__name__
        mod = t.__module__
        cur_indent = "  " * depth

        # 1) Nested genpy.Message (regular ROS message)
        if isinstance(value, genpy.Message):
            out = {}
            for slot in value.__slots__:
                try:
                    v = getattr(value, slot)
                except Exception as e:
                    out[slot] = None
                    continue
                out[slot] = convert(v, f"{path}.{slot}", depth + 1)
            return out

        # 2) Sequence (list / tuple / other sequence)
        if isinstance(value, (list, tuple)):
            arr = []
            for i, v in enumerate(value):
                arr.append(convert(v, f"{path}[{i}]", depth + 1))
            return arr

        # 3) Detect Time/Duration *generically*
        # If object has secs & nsecs attributes that are ints/longs -> treat as time/duration
        if hasattr(value, 'secs') and hasattr(value, 'nsecs'):
            try:
                secs = int(getattr(value, 'secs'))
                nsecs = int(getattr(value, 'nsecs'))
                # Log detection detail
                kind = 'Duration' if 'Duration' in tname or 'Duration' in mod else 'Time'
                return {'secs': secs, 'nsecs': nsecs}
            except Exception as e:
                print(f"{cur_indent}  [WARN] object at {path} has secs/nsecs but conversion failed: {e}")

        # 4) bytes-like -> bytes
        if isinstance(value, (bytes, bytearray, memoryview)):
            return bytes(value)

        # 5) Primitive types -> pass through
        if isinstance(value, (bool, int, float, str, type(None))):
            return value

        # 6) Fallback: unknown / custom object
        try:
            return str(value)
        except Exception as e:
            print(f"{cur_indent}  [ERROR] str() failed for {path}: {e}")
            return None

    # Top-level convert with try/except to bubble clearer errors
    try:
        return convert(msg, _path, _depth)
    except Exception as e:
        print(f"{indent}[ros_to_dict] ERROR while converting {_path}: {e}")
        raise


def dict_to_ros(data: Dict[str, Any], msg_class):
    """Convert dict back to ROS message instance"""
    msg = msg_class()
    
    def populate_message(msg_obj, data_obj):
        if not isinstance(data_obj, dict):
            return
            
        for key, value in data_obj.items():
            if not hasattr(msg_obj, key):
                continue
                
            attr = getattr(msg_obj, key)
            
            # Handle Time/Duration types
            if isinstance(attr, rostime.Time) and isinstance(value, dict):
                if 'secs' in value and 'nsecs' in value:
                    setattr(msg_obj, key, rostime.Time(int(value['secs']), int(value['nsecs'])))
            elif isinstance(attr, rostime.Duration) and isinstance(value, dict):
                if 'secs' in value and 'nsecs' in value:
                    setattr(msg_obj, key, rostime.Duration(int(value['secs']), int(value['nsecs'])))
            elif isinstance(value, dict) and hasattr(attr, '__slots__'):
                # Nested message
                populate_message(attr, value)
            elif isinstance(value, list) and hasattr(attr, '__iter__'):
                # Handle arrays
                setattr(msg_obj, key, value)
            else:
                setattr(msg_obj, key, value)
    
    populate_message(msg, data)
    return msg

class ROSWebRTCProtocol:
    """Protocol format"""
    VERSION = 1
    MSG_PUBLISH = 0x03
    MSG_TOPIC_DATA = 0x04
    MSG_SERVICE_CALL = 0x05
    MSG_SERVICE_RESP = 0x06
    MSG_CLIENT_STATE = 0x07

    @staticmethod
    def encode_message(msg_type: int, topic: str, msg_definition: str, data: bytes) -> bytes:
        topic_bytes = topic.encode('utf-8')
        msg_def_bytes = msg_definition.encode('utf-8')

        header = struct.pack(
            '>BBHii',
            ROSWebRTCProtocol.VERSION,
            msg_type,
            len(topic_bytes),
            len(msg_def_bytes),
            len(data)
        )

        return header + topic_bytes + msg_def_bytes + data

    @staticmethod
    def decode_message(message: bytes) -> Tuple[int, str, str, bytes]:
        if len(message) < 12:
            raise ValueError("Message too short")

        version, msg_type, topic_len, def_len, data_len = struct.unpack(
            '>BBHii', message[:12]
        )

        if version != ROSWebRTCProtocol.VERSION:
            raise ValueError(f"Unsupported protocol version: {version}")

        offset = 12
        topic = message[offset:offset + topic_len].decode('utf-8')
        offset += topic_len

        msg_definition = message[offset:offset + def_len].decode('utf-8')
        offset += def_len

        data = message[offset:offset + data_len]

        return msg_type, topic, msg_definition, data


class ROSWebRTCBridge:
    def __init__(self):
        rospy.init_node('webrtc_bridge')

        self.param_host = rospy.get_param('~host', '0.0.0.0')
        self.param_port = rospy.get_param('~port', 8080)

        self.pcs = set()
        self.client_info = {}
        self.ros_subscribers = {}
        self.ros_publishers = {}
        self.topic_clients = defaultdict(set)
        self.pubkey_clients = defaultdict(set)
        self.message_classes = {}

        # Thread coordination
        self.loop = None
        self.asyncio_thread = None
        
        # Thread-safe queue for ROS->asyncio communication
        self.broadcast_queue = Queue()

    def get_message_class(self, topic_type: str):
        """Dynamically load ROS message class from 'package/Message' string"""
        if topic_type in self.message_classes:
            return self.message_classes[topic_type]

        try:
            package, message = topic_type.rsplit('/', 1)
            mod = importlib.import_module(f"{package}.msg")
            msg_class = getattr(mod, message)
            self.message_classes[topic_type] = msg_class
            return msg_class
        except Exception as e:
            rospy.logerr(f"Failed to load message type {topic_type}: {e}")
            return None

    def get_service_class(self, srv_type: str):
        """Dynamically load ROS service class from 'package/Service' string"""
        if srv_type in self.message_classes:
            return self.message_classes[srv_type]
        try:
            package, srv_name = srv_type.rsplit('/', 1)
            mod = importlib.import_module(f"{package}.srv")
            srv_class = getattr(mod, srv_name)
            self.message_classes[srv_type] = srv_class
            return srv_class
        except Exception as e:
            rospy.logerr(f"Failed to load service type {srv_type}: {e}")
            return None

    def create_ros_subscriber(self, topic: str, msg_type: str):
        """Create a ROS subscriber for given topic/msg_type if possible."""
        if topic in self.ros_subscribers:
            return

        msg_class = self.get_message_class(msg_type)
        if not msg_class:
            rospy.logerr(f"Cannot create subscriber for {topic}: unknown type {msg_type}")
            return

        def callback(msg, topic=topic, msg_type=msg_type):
            self.broadcast_queue.put((topic, msg_type, msg))

        sub = rospy.Subscriber(topic, msg_class, callback, queue_size=10)
        self.ros_subscribers[topic] = sub
        rospy.loginfo(f"Created ROS subscriber for {topic} ({msg_type})")

    def remove_ros_subscriber(self, topic: str):
        if topic in self.ros_subscribers:
            try:
                self.ros_subscribers[topic].unregister()
            except Exception:
                pass
            del self.ros_subscribers[topic]
            rospy.loginfo(f"Unregistered ROS subscriber for {topic}")

    def create_ros_publisher(self, topic: str, msg_type: str):
        pub_key = f"{topic}:{msg_type}"
        if pub_key in self.ros_publishers:
            return

        msg_class = self.get_message_class(msg_type)
        if not msg_class:
            rospy.logerr(f"Cannot create publisher for {topic}: unknown type {msg_type}")
            return

        pub = rospy.Publisher(topic, msg_class, queue_size=10)
        self.ros_publishers[pub_key] = pub
        rospy.loginfo(f"Created ROS publisher for {topic} ({msg_type})")

    def remove_ros_publisher(self, pub_key: str):
        pub = self.ros_publishers.get(pub_key)
        if not pub:
            return
        try:
            pub.unregister()
        except Exception:
            pass
        del self.ros_publishers[pub_key]
        rospy.loginfo(f"Unregistered ROS publisher {pub_key}")

    async def handle_subscribe(self, topic: str, msg_type: str, msg):
        try:
            # Remove classes, the serializer throws a fit otherwise
            msg_primitives = ros_to_dict(msg)

            packet = ROSWebRTCProtocol.encode_message(
                ROSWebRTCProtocol.MSG_TOPIC_DATA,
                topic,
                msg_type,
                msgpack.packb(msg_primitives, use_bin_type=True)
            )

            clients = list(self.topic_clients.get(topic, []))
            for client_id in clients:
                if client_id in self.client_info:
                    channel = self.client_info[client_id].get('channel')
                    if channel and getattr(channel, 'readyState', 'open') == 'open':
                        try:
                            channel.send(packet)
                        except Exception as e:
                            rospy.logerr(f"Failed to send topic {topic} to client {client_id}: {e}")
        except Exception as e:
            rospy.logerr(f"Error serializing topic {topic}: {e}")

    def handle_publish(self, client_id: int, topic: str, msg_type: str, data: bytes):
        try:
            msg_dict = msgpack.unpackb(data, raw=False, strict_map_key=False)
            pub_key = f"{topic}:{msg_type}"
            
            if pub_key not in self.ros_publishers:
                self.create_ros_publisher(topic, msg_type)

            pub = self.ros_publishers.get(pub_key)
            if not pub:
                rospy.logerr(f"No publisher available for {topic} ({msg_type})")
                return

            msg_class = self.get_message_class(msg_type)
            if not msg_class:
                rospy.logerr(f"Unknown msg class for publish: {msg_type}")
                return

            msg = dict_to_ros(msg_dict, msg_class)
            if msg:
                pub.publish(msg)
                rospy.logdebug(f"Published to {topic}")
        except Exception as e:
            rospy.logerr(f"Failed to handle publish: {e}")

    def handle_service_call(self, client_id: int, service: str, srv_type: str, data: bytes):
        try:
            # --- Parse payload (may contain request_id and request dict) ---
            payload = msgpack.unpackb(data, raw=False, strict_map_key=False)

            # Default extraction
            request_id = None
            req_dict = {}

            # If client sent [request_id, req_dict] (legacy), handle it
            if isinstance(payload, list) and len(payload) == 2:
                request_id, req_dict = payload
            # If client sent a dict { _req_id: ..., args: {...} }, extract fields
            elif isinstance(payload, dict):
                # prefer explicit keys the JS client uses
                request_id = payload.get('_req_id')
                # payload may use 'args' per the JS wrapper
                req_dict = payload.get('args', {})
            else:
                rospy.logwarn(f"Unexpected service payload format from client {client_id}: {type(payload)}")
                request_id, req_dict = None, {}

            # --- Load service class ---
            srv_class = self.get_service_class(srv_type)
            if not srv_class:
                rospy.logerr(f"Unknown service type {srv_type} for {service}")
                # if request_id present, tell client about error
                if request_id is not None:
                    error_payload = {'_req_id': request_id, 'error': f"Unknown service type {srv_type}"}
                    packet = ROSWebRTCProtocol.encode_message(
                        ROSWebRTCProtocol.MSG_SERVICE_RESP,
                        service,
                        srv_type,
                        msgpack.packb(error_payload, use_bin_type=True)
                    )
                    channel = self.client_info[client_id].get('channel')
                    if channel and getattr(channel, 'readyState', 'open') == 'open':
                        try:
                            channel.send(packet)
                        except Exception as e:
                            rospy.logerr(f"Failed to send error response for unknown srv type to client {client_id}: {e}")
                return

            # build request ROS object
            req_class = srv_class._request_class
            req = dict_to_ros(req_dict or {}, req_class)

            # --- Call the ROS service ---
            try:
                rospy.wait_for_service(service, timeout=3.0)
                proxy = rospy.ServiceProxy(service, srv_class)
                resp = proxy(req)
            except Exception as e:
                # service call failed; send error back with request id if present
                rospy.logerr(f"Service call {service} failed for client {client_id}: {e}")
                if request_id is not None:
                    error_payload = {'_req_id': request_id, 'error': str(e)}
                    packet = ROSWebRTCProtocol.encode_message(
                        ROSWebRTCProtocol.MSG_SERVICE_RESP,
                        service,
                        srv_type,
                        msgpack.packb(error_payload, use_bin_type=True)
                    )
                    channel = self.client_info[client_id].get('channel')
                    if channel and getattr(channel, 'readyState', 'open') == 'open':
                        try:
                            channel.send(packet)
                            rospy.loginfo(f"Sent service error response for {service} to client {client_id}")
                        except Exception as send_err:
                            rospy.logerr(f"Failed to send service error response to client {client_id}: {send_err}")
                return

            # --- Convert and pack response ---
            resp_dict = ros_to_dict(resp)
            response_wrapper = {'_req_id': request_id, 'result': resp_dict} if request_id is not None else {'result': resp_dict}

            packet = ROSWebRTCProtocol.encode_message(
                ROSWebRTCProtocol.MSG_SERVICE_RESP,
                service,
                srv_type,
                msgpack.packb(response_wrapper, use_bin_type=True)
            )

            # --- Send response back to client ---
            channel = self.client_info[client_id].get('channel')
            if channel and getattr(channel, 'readyState', 'open') == 'open':
                try:
                    channel.send(packet)
                    rospy.loginfo(f"Service call {service} handled successfully for client {client_id}")
                except Exception as e:
                    rospy.logerr(f"Failed to send service response for {service} to client {client_id}: {e}")
            else:
                rospy.logwarn(f"Cannot send service response to client {client_id}: data channel closed")

        except Exception as e:
            rospy.logerr(f"Exception in handle_service_call for {service}: {e}")
            # Attempt to notify client if possible
            try:
                request_id = locals().get('request_id', None)
                if request_id is not None and client_id in self.client_info:
                    err_payload = {'_req_id': request_id, 'error': str(e)}
                    packet = ROSWebRTCProtocol.encode_message(
                        ROSWebRTCProtocol.MSG_SERVICE_RESP,
                        service,
                        srv_type,
                        msgpack.packb(err_payload, use_bin_type=True)
                    )
                    channel = self.client_info[client_id].get('channel')
                    if channel and getattr(channel, 'readyState', 'open') == 'open':
                        channel.send(packet)
            except Exception:
                pass



    def update_global_pub_sub_state(self, client_id: int, data: bytes):
        try:
            payload = msgpack.unpackb(data, raw=False, strict_map_key=False)
            subscribers = payload.get('subscribers', {})
            publishers = payload.get('publishers', {})
            
            rospy.loginfo(f"Received client state from {client_id}: {len(subscribers)} subs, {len(publishers)} pubs")

            if client_id not in self.client_info:
                rospy.logwarn(f"State from unknown client {client_id} ignored")
                return

            self.client_info[client_id]['raw'] = {
                'subscribers': subscribers.copy(),
                'publishers': publishers.copy()
            }

            self.client_info[client_id]['subscribers'] = set(subscribers.keys())
            self.client_info[client_id]['publishers'] = {f"{t}:{mt}" for t, mt in publishers.items()}

            required_subs = {}
            required_pubkeys = {}

            self.topic_clients = defaultdict(set)
            self.pubkey_clients = defaultdict(set)

            for client_id, info in list(self.client_info.items()):
                raw = info.get('raw', {})
                subs = raw.get('subscribers', {}) or {}
                pubs = raw.get('publishers', {}) or {}

                for topic, msg_type in subs.items():
                    required_subs[topic] = msg_type
                    self.topic_clients[topic].add(client_id)

                for topic, msg_type in pubs.items():
                    pub_key = f"{topic}:{msg_type}"
                    required_pubkeys[pub_key] = (topic, msg_type)
                    self.pubkey_clients[pub_key].add(client_id)

            # New Subscribers
            for topic, msg_type in required_subs.items():
                if topic not in self.ros_subscribers:
                    self.create_ros_subscriber(topic, msg_type)

            # New Publishers
            for pub_key, (topic, msg_type) in required_pubkeys.items():
                if pub_key not in self.ros_publishers:
                    self.create_ros_publisher(topic, msg_type)

            # Remove ones no longer required
            for pub_key in list(self.ros_publishers.keys()):
                if pub_key not in required_pubkeys:
                    self.remove_ros_publisher(pub_key)

            for topic in list(self.ros_subscribers.keys()):
                if topic not in required_subs:
                    self.remove_ros_subscriber(topic)

        except Exception as e:
            rospy.logerr(f"Invalid CLIENT_STATE payload from {client_id}: {e}")

    async def process_broadcast_queue(self):
        """Continuously process messages from ROS callbacks"""
        while True:
            try:
                await asyncio.sleep(0.01)
                
                while not self.broadcast_queue.empty():
                    topic, msg_type, msg = self.broadcast_queue.get_nowait()
                    await self.handle_subscribe(topic, msg_type, msg)
                    
            except Exception as e:
                rospy.logerr(f"Error processing broadcast queue: {e}")


    async def websocket_handler(self, request):
        """Handle WebSocket connections for WebRTC signaling"""
        ws = web.WebSocketResponse()
        await ws.prepare(request)

        client_id = id(ws)
        self.client_info[client_id] = {
            'subscribers': set(),
            'publishers': set(),
            'channel': None,
            'raw': {'subscribers': {}, 'publishers': {}}
        }

        pc = RTCPeerConnection()
        self.pcs.add(pc)

        @pc.on("datachannel")
        def on_datachannel(channel):
            rospy.loginfo(f"Data channel established for client {client_id}")
            self.client_info[client_id]['channel'] = channel

            @channel.on("message")
            def on_message(message):
                try:
                    if isinstance(message, bytes):
                        msg_type, topic, msg_def, data = ROSWebRTCProtocol.decode_message(message)

                        if msg_type == ROSWebRTCProtocol.MSG_PUBLISH:
                            self.handle_publish(client_id, topic, msg_def, data)
                        elif msg_type == ROSWebRTCProtocol.MSG_CLIENT_STATE:
                            self.update_global_pub_sub_state(client_id, data)
                        elif msg_type == ROSWebRTCProtocol.MSG_SERVICE_CALL:
                            self.handle_service_call(client_id, topic, msg_def, data)
                        else:
                            rospy.logwarn(f"Unhandled msg_type {msg_type} from client {client_id}")

                    else:
                        rospy.logwarn("Received non-bytes message on datachannel, ignoring")
                except Exception as e:
                    rospy.logerr(f"Error processing data channel message from {client_id}: {e}")

        try:
            #webrtc signaling
            async for msg in ws:
                if msg.type == web.WSMsgType.TEXT:
                    data = json.loads(msg.data)

                    if data['type'] == 'offer':
                        offer = RTCSessionDescription(
                            sdp=data['sdp'],
                            type=data['sdpType']
                        )
                        await pc.setRemoteDescription(offer)

                        answer = await pc.createAnswer()
                        await pc.setLocalDescription(answer)

                        await ws.send_json({
                            'type': 'answer',
                            'sdp': pc.localDescription.sdp,
                            'sdpType': pc.localDescription.type
                        })
        finally:
            self.cleanup_client(client_id)
            await pc.close()
            self.pcs.discard(pc)

        return ws

    def cleanup_client(self, client_id: int):
        if client_id in self.client_info:
            del self.client_info[client_id]
            self._reconcile_global_state()
            rospy.loginfo(f"Client {client_id} disconnected.")

    def run_asyncio_event_loop(self):
        asyncio.set_event_loop(self.loop)
        
        app = web.Application()
        app.router.add_get('/ws', self.websocket_handler)

        async def on_shutdown(app):
            coros = [pc.close() for pc in self.pcs]
            await asyncio.gather(*coros)
            self.pcs.clear()

        async def start_server():
            runner = web.AppRunner(app)
            await runner.setup()

            site = web.TCPSite(runner, self.param_host, self.param_port)
            await site.start()

            rospy.loginfo(f"WebRTC signaling server running on ws://{self.param_host}:{self.param_port}")
            asyncio.create_task(self.process_broadcast_queue())
            
            while not rospy.is_shutdown():
                await asyncio.sleep(0.1)
            
            await on_shutdown(app)

        app.on_shutdown.append(on_shutdown)
        self.loop.run_until_complete(start_server())

    def run(self):
        rospy.loginfo("Starting ROS-WebRTC bridge...")
        
        self.loop = asyncio.new_event_loop()
        self.asyncio_thread = threading.Thread(target=self.run_asyncio_event_loop, daemon=True)
        self.asyncio_thread.start()
        
        rospy.spin()
        rospy.loginfo("ROS-WebRTC shuting down...")


if __name__ == "__main__":
    bridge = ROSWebRTCBridge()
    bridge.run()