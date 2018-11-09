'use strict'

const express = require('express'),
	  router = express.Router(),
	  amqp = require('amqplib'),
	  child_process = require('child_process');
	  
router.use.rooms_limit = 10;
router.use.players_limit = 10;
router.use.rooms = [];

router.use.Message = class Message {
	constructor({author = null, body = '', date = new Date(), room = null, command = 'post message'}){
		this.author = author;
		this.body = body;
		this.date = date;
		this.room = room;
		this.command = command;
	}
}

const getChannel = async () => {
	try {
		const conn = await amqp.connect('amqp://localhost');
		const channel = await conn.createChannel();
		return channel;
	} catch (err) {
		console.log(err);
	}
};

router.use.channel = getChannel();

/* GET home page. */
router.get('/', function(req, res, next) {
	res.render('index');
});

router.post('/room', async (req, res) => {
	try {
		const newRoomName = req.body.roomName;
		if (router.use.rooms.length > router.use.rooms_limit) {
			res.status(400).json({error: 'Too much rooms!'}); 
		} else {
			if ((newRoomName == "") || (newRoomName === undefined)) {
				res.status(400).json({error: 'Wrong room name!'});
			} else {
				var is_unique = true;
				for(var i = 0; i < router.use.rooms.length; i++) {
					if (router.use.rooms[i].name === newRoomName) {
						is_unique = false;
						break;
					}
				}
				if (!is_unique) {
					res.status(400).send({error: 'Room with this name already exists!'});
				} else {
					child_process.spawn(process.argv[0], ['chat.js', newRoomName], {
						detached: true,
						shell: true
					});
					const ch = await router.use.channel;
					ch.assertQueue('chat/' + newRoomName, {durable: false});
					const message = new router.use.Message({body: 'Room ' + newRoomName + ' has been created', room: newRoomName});
					ch.sendToQueue('chat/' + newRoomName, Buffer.from(JSON.stringify(message)));
					router.use.rooms.push({name: newRoomName, players: []});
					res.sendStatus(201);
				}
			}
		}
	} catch (err) {
		console.log(err);
		res.status(500).json({error: 'Iternal error!'});
	}
});

router.get('/rooms', async (req, res) => {
	try {
		var safeRooms = [];
		for (var i = 0; i < router.use.rooms.length; i++){
			safeRooms.push({name: router.use.rooms[i].name, players: []});
			for (var j = 0; j < router.use.rooms[i].players.length; j++){
				safeRooms[i].players.push({username: router.use.rooms[i].players[j].username})
			}
		}
		res.status(200).json({rooms: safeRooms, players_limit: router.use.players_limit});
	} catch (err) {
		console.log(err);
		res.status(500).json({error: 'Iternal error!'});
	}
});

router.get('/room/:roomName', async (req, res) => {
	try {
		const roomName = req.params.roomName;
		var roomNumber = -1;
		for(var i = 0; i < router.use.rooms.length; i++) {
			if (router.use.rooms[i].name === roomName) {
				roomNumber = i;
				break;
			}
		}
		if (roomNumber === -1)
			res.status(404).render('customError', {error: 'Wrong room name!'});
		else {
			res.render('room');
		}
	} catch (err) {
		console.log(err);
		res.status(500).render('customError', {error: 'Iternal error!'});
	}
});

router.delete('/room/:roomName', async(req, res) => {
	try {
		const roomName = req.params.roomName;
		var roomIndex = -1;
		for(var i = 0; i < router.use.rooms.length; i++) {
			if (router.use.rooms[i].name === roomName) {
				roomIndex = i;
				break;
			}
		}
		if (roomIndex === -1)
			res.status(400).json({error: 'Wrong room name!'});
		else {
			const message = new router.use.Message({body: 'Room ' + roomName + ' has been closed', room: roomName});
			const queue = 'chat/' + router.use.rooms[roomIndex].name;
			const ch = await router.use.channel;
			ch.assertQueue(queue, {durable: false});
			ch.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
			ch.assertQueue(queue, {durable: false});
			ch.sendToQueue(queue, Buffer.from(JSON.stringify(new router.use.Message({command: 'stop'}))));
			router.use.rooms.splice(i, 1);
			res.sendStatus(200);
		}
	} catch (err) {
		console.log(err);
		res.status(500).json({error: 'Iternal error!'});
	}
});

module.exports = router;