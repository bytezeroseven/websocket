# websocket
WebSocket implementation with most of the important stuff. No libraries used.

## Example code ##

`let websocket = require("./websocket.js");
let wss = websocket.upgradeServer(server);

wss.on("connection", function(ws) {
	ws.send("Hello!");
  
	ws.ping();
	ws.on("pong", function() {
		ws.ping();
	});

	ws.on("message", function(data) {
		console.log(data);
	});

	ws.on("disconnect", function() {
		console.log("Ws Connection was closed.");
	});
})`
