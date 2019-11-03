# websocket
WebSocket implementation with most of the important stuff. No libraries used.

## Example code:
Server:

	let websocketHelper = require("./websocket.js");
	let wss = websocketHelper.upgradeServer(server);

	wss.on("connection", function(ws) {
		ws.binaryType = "arraybuffer" || "nodebuffer";

		ws.send("Hello!");

		let ab = new ArrayBuffer(1);
		let view = new DataView(ab);
		view.setUint8(0, 0b1000101);
		ws.send(ab);
		ws.send(view);

		ws.ping();
		ws.on("pong", function() {
			ws.ping();
		});

		ws.close();

		ws.on("message", function(data) {
			console.log(data);
		});

		ws.on("close", function() {
			console.log("Ws Connection was closed.");
		});
	});

Client:

	let ws = new WebSocket(location.origin.replace("http", "ws"));
	ws.binaryType = "arraybuffer";

	ws.onopen = function() {
		console.log("WebSocket open!");
		ws.send("Hey!");
	}

	ws.onclose = function() {
		console.log("WebSocket closed.");
	}

	ws.onmessage = function(evt) {
		let msg = evt.data;
		console.log(msg);
		if (msg instanceof ArrayBuffer) {
			let view = new DataView(msg);
			console.log(view.getUint8(0));
		}
	}
