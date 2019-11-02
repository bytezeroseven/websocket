# websocket
WebSocket implementation with most of the important stuff. No libraries used.

## Example code

	let websocket = require("./websocket.js");
	let wss = websocket.upgradeServer(server);

	wss.on("connection", function(ws) {
		ws.binaryType = "nodebuffer" || "arraybuffer";

		ws.ping();
		ws.on("pong", function() {
			ws.ping();
		});
		
		// String message
		ws.send("I am probably done with this project, but I keep committing useless commits.");
		
		let json = {
			x: 34,
			y: 67,
			nickname: "double mega pro lvl 33 pro sniper"
		};
		
		ws.send(JSON.stringify(json));
		
		// Binary message
		let arraybuffer = new ArrayBuffer(1);
		let view = new DataView(arraybuffer);
		
		view.setUint8(0b1000101, 0);
		
		ws.send(arraybuffer);

		ws.on("message", function(msg) {
			console.log(msg);
		});

		ws.on("close", function() {
			console.log("Ws Connection was closed.");
		});
	});
`
