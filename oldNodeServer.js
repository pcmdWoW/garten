var fs = require("fs");
var socket = require( 'socket.io' );
var express = require( 'express' );
var http = require( 'http' );
var gpio = require("pi-gpio");
var events = require('events');
var eventEmitter = new events.EventEmitter();

var app = express();
var server = http.createServer( app );

var io = socket.listen( server );
var socketIDs = {};
var userToSocket = {};
var pins = {};

var pinChanges = {};
var pinValues = {};
var schalterToRelais = {
	27:23,
	22:24,
	10:7,
	19:8,
	11:25 
};
var pinDirections = {
			/* ventil leds */
	
	/* schalter für ventile + pumpe */
	27:"pulldown",		
	22:"pulldown",
	10:"pulldown",
	19:"pulldown",
	11:"pulldown",
	
	/* relais*/
	23:"out",
	25:"out",
	24:"out",
	8:"out",
	7:"out",
};




process.on('SIGINT', function() { 
	for (var key in pinDirections) {
		gpio.close(key);
	}
	process.exit()
}); 

process.on('SIGTERM', function() { 
	for (var key in pinDirections) {
		gpio.close(key);
	}
	process.exit()
}); 

  
io.sockets.on( 'connection', function( client ) {

	client.on( 'set', function( data ) {
		//client.broadcast.emit( 'message', { name: data.name, message: data.message } );
		console.log("setting pin  "+data.pin+" value to "+data.value);
		gpio.write(data.pin,data.value,function(err){
			if(!err){
				pinValues[data.pin] = data.value;
			}else{
				console.log("write err: "+err);
			}
		});
	});
	
	client.on( 'read', function( data ) {
		//client.broadcast.emit( 'message', { name: data.name, message: data.message } );
		gpio.read(data.pin, function(err, value){
			io.sockets.emit("read", data.pin,value, err);
		});
	});
	
	client.on("online", function(data){
		io.sockets.emit("read", pinValues);	
	});
	
	
	
});


var _read = function(file, fn) {
	fs.readFile(file, "utf-8", function(err, data) {
		if(err) {
			err.path = file;
			err.action = 'read';
			logError(err);
		} else {
			if(typeof fn === "function") fn(data);
			else logMessage("value: ", data);
		}
	});
}; 


var FileWatcher = function(path, key, interval, fn) {
	if(typeof fn === 'undefined') {
		fn = interval;
		interval = 100;
	}
	if(typeof interval !== 'number') return false;
	if(typeof fn !== 'function') return false;

	var value;
	var readTimer = setInterval(function() {
		_read(path, function(val) {
			if(value !== val) {
				if(typeof value !== 'undefined') fn(val,key);
				value = val;
			}
		});
	}, interval);

	this.stop = function() { clearInterval(readTimer); };
};

for (var key in pinDirections) {
		gpio.close(key);
	}

for (var key in pinDirections) {
	var val = pinDirections[key];
	if (pins[key] == undefined ) {
		
		console.log("changing pin "+key+" dir to "+val);
		pinValues[key] = 0;
		pins[key] = true;
		if(val != "out" && val != "in") {
			gpio.open(key,"in "+val, function(err, newKey){
				if(err == null) {
					new FileWatcher("/sys/devices/virtual/gpio/gpio" + newKey + "/value", newKey, 2000, function(val,resKey) {
						var value = parseInt(val, 10);
						if(schalterToRelais[resKey] != undefined) {
							pinValues[resKey] = value;
							var flip = (pinValues[schalterToRelais[resKey]] == 1) ? 0 : 1;
							console.log("schalter "+resKey+" Setting pin "+schalterToRelais[resKey]+ " to value "+flip);
							
							gpio.write(schalterToRelais[resKey],flip, function(err) {
								if(!err) {
									pinValues[schalterToRelais[resKey]] = flip;
									io.sockets.emit("notifyGUIClicked", schalterToRelais[resKey], flip);
								}else{
									console.log("write err: "+err);
								}
							});
						}
					});
					
					setInterval(function(){
						gpio.read(newKey, function(err, value){
							if(pinValues[newKey] != value) {
								eventEmitter.emit("onChange",{key:newKey, value:value});
							}
						});
					},2000);
				}else{
					console.log("error while opening pin "+key,+" err: "+err);
				}
			});
			
			
		}else{
			gpio.open(key,val);
		}
		
	}else{
		console.log("pin "+key+" is already initialized as ");
	}
}




server.listen( 8080,'192.168.178.51' );


