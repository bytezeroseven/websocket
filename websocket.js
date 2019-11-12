

let crypto = require("crypto");

let EventEmitter = require("events").EventEmitter;

let MAGIC_KEY = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

let CONNECTING = 0;
let OPEN = 1;
let CLOSING = 2;
let CLOSED = 3;

class Client {

	constructor(request, socket) {

		this.request = request;
		this.id = request.headers["sec-websocket-key"];
		this.socket = socket;
		this.binaryType = "nodebuffer";
		this.readyState = CONNECTING;

		this.fin = false;
		this.rsv1 = null;
		this.rsv2 = null;
		this.rsv3 = null;
		this.opCode = 0x00;
		this.payloadLength = 0;
		this.mask = false;
		this.maskingKey = 0;

		this.buffers = [];
		this.payloads = [];
		this.bufferedBytes = 0;

		this.frameReadState = 0;

	}

	send(data) {
		this.socket.write(createFrame({
			opCode: typeof data == "string" ? 0x01 : 0x02,
			payload: data
		}));
	}

	close() {
		this.socket.end();
		this.readyState = CLOSING;
	}

	ping() {
		this.socket.write(createFrame({
			opCode: 0x09,
			payload: ""
		}));
	} 

	consume(n) {
		this.bufferedBytes -= n;

		let destination = Buffer.alloc(n);

		while (n > 0) {

			let buf = this.buffers[0];

			if (n < buf.length) {
				buf.copy(destination, destination.length - n, 0, n);
				this.buffers[0] = buf.slice(n);
			} else {
				this.buffers.shift().copy(destination, destination.length - n);
			}

			n -= buf.length;

		}

		return destination;
	}

	doHandshake() {

		let acceptKey = this.request.headers["sec-websocket-key"];
		let generatedKey = crypto.createHash("sha1").update(acceptKey + MAGIC_KEY).digest("base64");

		let headers = [
			"HTTP/1.1 101 Websocket Protocol Upgrade",
			"Sec-Websocket-Accept:" + generatedKey,
			"Connection: Upgrade",
			"Upgrade: Websocket"
		];

		this.socket.write(headers.join("\r\n") + "\r\n\r\n");
		this.readyState = OPEN;

	}

	addSocketListeners() {

		this.socket.on("error", (err) => { this.close(); });

		this.socket.on("close", () => {
			this.readyState = CLOSED;
			this.frameReadState = 500;
			this.payloads = [];
			this.buffers = [];
			this.socket.on("data", function() { return false; });
			this.socket.on("close", function() { return false; });
			this.onclose();
		})

		/* DATA READING */

		this.socket.on("data", (buf) => {

			this.buffers.push(buf);
			this.bufferedBytes += buf.byteLength;

			this.startReadLoop();

		});

	}

	parseMessage() {

		let msg = Buffer.concat(this.payloads);
		this.payloads = [];

		if (this.opCode === 0x01) {
			this.onmessage(msg.toString());
		} else if (this.opCode === 0x02) {
			if (this.binaryType == "nodebuffer") this.onmessage(msg);
			else this.onmessage(toArrayBuffer(msg));
		}

	}

	handleControlFrame() {
		if (this.opCode === 0xA) {
			this.onpong();
		} else if (this.opCode == 0x08) {
			this.close();
		}
	}

	startReadLoop() {
		for ( ; ; ) {
		
		let bytes = null;

		switch (this.frameReadState) {

			case 0:

				if (this.bufferedBytes < 2) return false;

				bytes = this.consume(2);

				this.fin = bytes[0] & 0x80;
				this.rsv1 = bytes[0] & 0x40;
				this.rsv2 = bytes[0] & 0x20;
				this.rsv3 = bytes[0] & 0x10;
				this.opCode = bytes[0] & 0x0f;
				this.mask = bytes[1] & 0x80;
				this.payloadLength = bytes[1] & 0x7f;

				let isFragmented = this.payloads.length > 0;

				if (this.opCode > 0x07) {

					if (!this.fin) return this.close();
					else if (this.payloadLength > 125) return this.close();

				} else if (this.opCode === 0x00 && isFragmented == false) {
					return this.close();
				}

				this.frameReadState = 1;

			case 1:

				if (this.payloadLength === 126) {
					if (this.bufferedBytes < 2) return false;

					bytes = this.consume(2);
					this.payloadLength = bytes.readUInt16BE(0);

				} else if (this.payloadLength === 127) {
					if (this.bufferedBytes < 8) return false;

					bytes = this.consume(8);
					this.payloadLength = Math.pow(2, 32) * bytes.readUInt32BE(0) + bytes.readUInt32BE(4);

				}

				this.frameReadState = 2;

			case 2:

				if (this.mask) {
					if (this.bufferedBytes < 4) return false;
					this.maskingKey = this.consume(4);
				}

				this.frameReadState = 3;

			case 3:

				if (this.bufferedBytes < this.payloadLength) return false;
				this.frameReadState = 0;

				if (this.opCode > 0x07) {
					return this.handleControlFrame();
				}

				let payload = this.consume(this.payloadLength);

				if (this.mask) {
					for (let i = 0; i < this.payloadLength; i++) {
						payload[i] ^= this.maskingKey[i % 4];
					}
				}

				this.payloads.push(payload);

				if (this.fin) {
					this.parseMessage();
				}
			
			break;
			default: return false;

		}}
	}

	onerror() { }
	onmessage() { }
	onclose() { }
	onopen() { }

	onpong() {};

}

class Server {

	constructor(httpServer) {

		this.httpServer = httpServer;
		this.clients = [];

		this.upgradeServer();

	}

	upgradeServer() {

		this.httpServer.on("upgrade", (request, socket) => {

			if (request.headers["upgrade"] != "websocket") return false;

			let client = new Client(request, socket);
			this.clients.push(client);

			client.doHandshake();
			client.addSocketListeners();

			socket.on("close", () => {

				let i = this.clients.indexOf(client);
				if (i > -1) this.clients.splice(i, 1);

			});

			this.onconnection(client);

		});

	}

	onconnection(ws) {}

}

function toNodeBuffer(data) {

	if (Buffer.isBuffer(data)) return data;
	else if (ArrayBuffer.isView(data)) {

		let result = Buffer.from(data.buffer);
		if (result.byteLength === data.byteLength) {
			return result;
		} else {

			return result.slice(data.byteOffset, data.byteOffset, data.byteLength);

		}

	} else {
		return Buffer.from(data);
	}

} 

function toArrayBuffer(buf) {

	if (buf.byteLength == buf.buffer.byteLength) {
		return buf.buffer;
	} else {
		return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
	}

}

function createFrame({ payload, opCode }) {

	let buf = toNodeBuffer(payload);
	let byteLength = buf.byteLength;
	let payloadLength = byteLength;
	let n = 0;

	if (payloadLength > 125) {

		if (payloadLength < 65536) {
			payloadLength = 126;
			n += 2;

		} else {
			payloadLength = 127;
			n += 8;
		}

	}

	let header = Buffer.alloc(n + 2);

	header[0] = 0x80;
	header[0] |= opCode;

	header[1] = payloadLength;

	if (payloadLength == 126) {
		header.writeUInt16BE(byteLength, 2);
	} else if (payloadLength == 127) {
		header.writeUInt32BE(byteLength, 2 + 4);
	}

	let frame = Buffer.concat([header, buf]);

	return frame;

}

module.exports = {

	Client, 
	Server,
	createFrame,
	MAGIC_KEY,
	CONNECTING,
	OPEN,
	CLOSING,
	CLOSED

};

