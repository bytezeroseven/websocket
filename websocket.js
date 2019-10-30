

let crypto = require("crypto");

let events = require("events");

let MAGIC_KEY = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function upgradeServer(httpServer) {

	let serverEmitter = new events.EventEmitter();
	serverEmitter.clients = [];

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

		function send(frame) {

			response.write(frame);

		}

		let clientEmitter = new events.EventEmitter();

		serverEmitter.clients.push(clientEmitter);

		clientEmitter.send = function(data) {

			let opCode = typeof data == "string" ? 0x01 : 0x02;

			send(createFrame(data, opCode));

		}

		clientEmitter.ping = function() {	

			send(createFrame("", 0x09));

		}

		clientEmitter.close = function() {

			end();

		}

		clientEmitter.binaryType = "nodebuffer";

		serverEmitter.emit("connection", clientEmitter);

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

			buffers = [];

			payloads = [];

			let i = serverEmitter.clients.indexOf(clientEmitter);
			i > 0 && serverEmitter.clients.splice(i, 1);

			clientEmitter.emit("disconnect");

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

						if (opCode === 0x08) {

							return end();

						}

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

						if (opCode > 0x07) {

							if (opCode === 0xA) {
								clientEmitter.emit("pong");
							}

							return false;

						}

						let payload = consume(payloadLength);

						if (mask) {

							for (let i = 0; i < payloadLength; i++) {

								payload[i] ^= maskingKey[i % 4];

							}

						}

						payloads.push(payload);

						if (fin) {

							let finalPayload = Buffer.concat(payloads);

							if (opCode === 0x01) {

								clientEmitter.emit("message", finalPayload.toString("utf8"));

							} else if (opCode === 0x02) {

								if (clientEmitter.binaryType == "nodebuffer") {
									clientEmitter.emit("message", finalPayload);
								} else if (clientEmitter.binaryType == "arraybuffer") {

									let arraybuffer = finalPayload.buffer;

									if (arraybuffer.byteLength == finalPayload.byteLength) {
									} else {
										arraybuffer = arraybuffer.slice(finalPayload.byteOffset, finalPayload.byteOffset + finalPayload.byteLength);
									}

									clientEmitter.emit("message", arraybuffer);

								}

								
							}

						}

						currentstate = 0;
					
					break;
					
					default: return false;

				}			

			}

		}

		response.on("data", onSocketData);

	});

	return serverEmitter;

}


function createFrame(data, opCode) {

	let buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

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

