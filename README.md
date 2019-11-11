# websocket
WebSocket implementation with most of the important stuff. No libraries used.

## Example code:
Server:

	let WebSocket = require("./websocket.js");
	let wss = WebSocket.Server({ server });

	wss.onconnection = function(ws) {
		ws.binaryType = "arraybuffer" || "nodebuffer";
		ws.readyState == WebSocket.OPEN && ws.send("Hello!");

		let ab = new ArrayBuffer(1);
		let view = new DataView(ab);
		view.setUint8(0, 0b1000101);
		
		ws.send(ab);
		ws.send(view);

		ws.ping();
		ws.onpong = function() {
			ws.ping();
		}

		ws.close();

		ws.onmessage = function(data) {
			console.log(data);
		}

		ws.onclose = function() {
			console.log("Ws Connection was closed.");
		}
	}
