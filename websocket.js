

let crypto = require("crypto");

let EventEmitter = require("events").EventEmitter;

let MAGIC_KEY = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";



function upgradeServer(httpServer) {

	let wss = new EventEmitter();
	wss.clients = [];

	httpServer.on("upgrade", function(request, response) {

		if (request.headers["upgrade"] != "websocket") return false;

		let acceptKey = request.headers["sec-websocket-key"];

		let generatedKey = crypto.createHash("sha1").update(acceptKey + MAGIC_KEY).digest("base64");

		let headers = [

			"HTTP/1.1 101 Websocket Protocol Upgrade",
		
			"Sec-Websocket-Accept:" + generatedKey,
		
			"Connection: Upgrade",

			"Upgrade: Websocket"

		];

		response.write(headers.join("\r\n") + "\r\n\r\n");

		function sendFrame(frame) {

			!response.finished && response.write(frame);

		}

		let ws = new EventEmitter();

		ws.send = function(data) {

			let opCode = typeof data == "string" ? 0x01 : 0x02;

			sendFrame(createFrame(opCode, data));

		}

		ws.ping = function() {	

			sendFrame(createFrame(0x09));

		}

		ws.close = function() {

			end();

		}

		ws.binaryType = "nodebuffer";

		wss.clients.push(ws);
		wss.emit("connection", ws);

		let fin = false;

		let rsv1 = null;
		
		let rsv2 = null;
		
		let rsv3 = null;

		let opCode = null;
		
		let payloadLength = 0;
		
		let mask = false;
		
		let maskingKey = null;


		let currentstate = 0;

		let buffers = [];

		let payloads = [];

		let bufferedBytes = 0;

		let bytes = null;

		function consume(n) {

			bufferedBytes -= n;

			if (n === buffers[0].length) return buffers.shift();

			if (n < buffers[0].length) {

				let result = buffers[0].slice(0, n);

				buffers[0] = buffers[0].slice(n);

				return result;

			}

			let destination = Buffer.alloc(n);

			while (n > 0) {

				let buffer = buffers[0];

				if (n < buffers[0].length) {

					buffer.copy(destination, destination.length - n, 0, n);

					buffers[0] = buffer.slice(n);

				} else {

					buffers.shift().copy(destination, destination.length - n);

				}

				n -= buffer.length;

			}

			return destination;

		}

		function onSocketData(data) {

			bufferedBytes += data.length;

			buffers.push(data);

			startReadLoop();

		}

		function end() {

			response.end();

			response.on("data", function() { return false; });

			buffers = [];

			payloads = [];

			state = 8;

			let i = wss.clients.indexOf(ws);
			i > 0 && wss.clients.splice(i, 1);

			ws.emit("close");

		}

		function startReadLoop() {

			for ( ; ; ) {

				switch (currentstate) {

					case 0:

						if (bufferedBytes < 2) return false;

						bytes = consume(2);

						fin = bytes[0] & 0x80;

						rsv1 = bytes[0] & 0x40;

						rsv2 = bytes[0] & 0x20;

						rsv3 = bytes[0] & 0x10;

						opCode = bytes[0] & 0x0f;

						mask = bytes[1] & 0x80;

						payloadLength = bytes[1] & 0x7f;

						let isFragmented = payloads.length > 0;

						if (opCode > 0x07) {

							if (!fin) return end();
							if (payloadLength > 125) return end();

						} else if (fin === 0x00 && !isFragmented) {

							return end();

						}

						currentstate = 1;

					case 1:

						if (payloadLength === 126) {

							if (bufferedBytes < 2) return false;

							bytes = consume(2);

							payloadLength = bytes.readUInt16BE(0);

						} else if (payloadLength === 127) {

							if (bufferedBytes < 8) return false;

							bytes = consume(8);

							payloadLength = Math.pow(2, 32) * bytes.readUInt32BE(0) + bytes.readUInt32BE(4);

						}

						currentstate = 2;

					case 2:

						if (mask) {

							if (bufferedBytes < 4) return false;

							maskingKey = consume(4);

						}

						currentstate = 3;

					case 3:

						if (bufferedBytes < payloadLength) return false;

						currentstate = 0;

						if (opCode > 0x07) {

							return handleControlFrame();

						}

						let payload = consume(payloadLength);

						if (mask) {

							for (let i = 0; i < payloadLength; i++) {

								payload[i] ^= maskingKey[i % 4];

							}

						}

						payloads.push(payload);

						if (fin) {

							emitMessage();

						}
					
					break;
					
					default: return false;

				}			

			}

		}

		function handleControlFrame() {

			if (opCode === 0xA) {

				ws.emit("pong");

			} else if (opCode == 0x08) {

				return end();

			}

		}

		function emitMessage() {

			let finalPayload = Buffer.concat(payloads);

			payloads = [];

			if (opCode === 0x01) {

				ws.emit("message", finalPayload.toString("utf8"));

			} else if (opCode === 0x02) {

				if (ws.binaryType == "nodebuffer") {
					
					ws.emit("message", finalPayload);

				} else if (ws.binaryType == "arraybuffer") {

					ws.emit("message", toArrayBuffer(finalPayload));

				}
				
			}

		}

		response.on("data", onSocketData);

		response.on("error", function(err) { end(); });

	});

	return wss;

}

function toArrayBuffer(nodeBuffer) {

	if (nodeBuffer.buffer.byteLength == nodeBuffer.byteLength) {
		return nodeBuffer.buffer;
	} else {
		return nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength);
	}

} 

function toNodeBuffer(data) {

	if (Buffer.isBuffer(data)) return data;

	if (data instanceof ArrayBuffer) {

		return Buffer.from(data);

	} else if (data instanceof DataView) {

		let buffer = Buffer.from(data.buffer);

		if (data.byteLength == buffer.byteLength) {
			return buffer;
		} else {
			buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
		}

	} else {

		return Buffer.from(data);

	}

}


function createFrame(opCode, data) {

	if (data == null) data = "";

	let buffer = toNodeBuffer(data);

	let byteLength = buffer.byteLength;

	let payloadLength = byteLength;

	let n = 0;

	if (byteLength > 125) {

		if (byteLength < 65536) {

			payloadLength = 126;
			n += 2;

		} else {

			payloadLength = 127;
			n += 8;

		}

	}

	let header = Buffer.alloc(1 + 1 + n);

	header[0] = opCode | 0x80;
	header[1] = payloadLength;

	if (n === 2) {
	
		headerBuffer.writeUInt16BE(byteLength, 2);
	
	} else if (n === 8) {
		
		headerBuffer.writeUInt32BE(byteLength, 2 + 4);
	
	}

	return Buffer.concat([header, buffer]);

}

module.exports = {

	upgradeServer: upgradeServer

}

