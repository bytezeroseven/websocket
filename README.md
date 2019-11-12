# websocket
WebSocket implementation with most of the important stuff. No libraries used.

## Code:

	let WebSocket = require("./websocket.js");
	let wss = WebSocket.Server(httpServer);

	wss.onconnection = function(socket) {
		if (socket.readyState === WebSocket.OPEN) {
			socket.send("Hello!");
		}
		
		ws.onmessage = function(data) {
			console.log(data);
		}

		ws.onclose = function() {
			console.log("A WebSocket connection was closed");
		}
	}
