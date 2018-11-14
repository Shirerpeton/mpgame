'use strict'

const amqp = require('amqplib');

const roomName = process.argv[2];

var conn, channel, ch, cycleNumber = 0;

const mapXSize = 1200;
const mapYSize = 900;
const playerLength = 60;
const playerWidth = 30;
const bulletSize = 10;
const speed = 15;
const bulletSpeed = 30;
const blastRadius = 50;
var players = [];
var walls = [];
var bullets = [];

walls.push({x1: -50, y1: -50, x2: 5, y2: 950});
walls.push({x1: 1195, y1: -50, x2: 1250, y2: 950});
walls.push({x1: -50, y1: -50, x2: 1250, y2: 5});
walls.push({x1: -50, y1: 895, x2: 1250, y2: 950});

class Player {
	constructor({score = 0, x = 100, y = 100, id, username}){
		this.id = id;
		this.username = username;
		this.score = score;
		this.x1 = x;
		this.y1 = y;
		this.x2 = x + playerWidth;
		this.y2 = y + playerLength;
		this.direction = 'up';
		this.isRunning = false;
		this.newDirection = '';
		this.firing = false;
		this.reload = 0;
	}
}

async function main() {
	try {
		console.log('starting game session');
		conn = await amqp.connect('amqp://localhost');
		channel = await conn.createChannel();
		await channel.assertQueue('game/' + roomName, {durable: false});
		await channel.consume('game/' + roomName, processMessage, {noAck: true, exclusive: true});
	} catch (err) {
		console.log(err);
	}
};

async function processMessage(msg) {
	try {
		ch = await channel;
		const data = JSON.parse(msg.content);
		switch (data.command) {
			case 'spawn player':
				console.log('spawn player');
				var x1, y1, x2, y2;
				while (true) {
					x1 = getRndInteger(0, mapXSize);
					y1 = getRndInteger(0, mapYSize);
					x2 = x1 + playerWidth;
					y2 = y1 + playerLength;
					if (!isOverlappingWithAWall(x1, y1, x2, y2) && !isOvelappingWithOtherPlayers(x1, y1, x2, y2, -1))
						break;
				}
				players.push(new Player({id: data.id, username: data.username, x1: x1, y1: y1, x2: x2, y2: y2}));
				break;
			case 'despawn player':
				console.log('despawn player');
				/* for (var i = 0; i < players.length; i++)
					if (data.id === players[i].id){
						players.splice(i, 1);
						break;
					} */
				players = players.filter(player => player.id != data.id);
				bullets = bullets.filter(bullet => bullet.player != data.id);
				break;
			case 'controls update':
				for (var i = 0; i < players.length; i++)
					if (data.id === players[i].id) {
						switch (data.controls) {
							case 'fire':
								if (players[i].reload === 0){
									players[i].firing = true;
								}
								break;
							case 'left':
							case 'up':
							case 'right':
							case 'down':
								if (players[i].direction != data.controls)
									players[i].newDirection = data.controls;
								else {
									players[i].direction = data.controls;
									players[i].isRunning = true;
								}
								//console.log(data.controls)
								break;
							case '':
								players[i].isRunning = false;
								break;
						}
						break;
					}
				break;
			case 'stop':
				console.log('stopping the game');
				await ch.close();
				await conn.close();
				process.exit(0);
				break;
		}
	} catch (err) {
		console.log(err);
	}
}

function movePlayer(i, speed){
	var newX1 = players[i].x1, newY1 = players[i].y1, newX2 = players[i].x2, newY2 = players[i].y2;
	switch (players[i].direction) {
		case 'left':
			newX1 -= speed;
			newX2 -= speed;
			break;
		case 'up':
			newY1 -= speed;
			newY2 -= speed;
			break;
		case 'right':
			newX1 += speed;
			newX2 += speed;
			break;
		case 'down':
			newY1 += speed;
			newY2 += speed;
			break;
	}
	if (!isOverlappingWithAWall(newX1, newY1, newX2, newY2) && !isOvelappingWithOtherPlayers(newX1, newY1, newX2, newY2, i)){
		players[i].x1 = newX1;
		players[i].y1 = newY1;
		players[i].x2 = newX2;
		players[i].y2 = newY2;
		return true;
	} else {
		return false;
	}
}

function turnPlayer(i) {
	var newX1 = 0, newX2 = 0, newY1 = 0, newY2 = 0;
	if (players[i].direction === 'up' || players[i].direction === 'down')
		if (players[i].newDirection === 'left' || players[i].newDirection === 'right'){
			newX1 = players[i].x1 + playerWidth/2 - playerLength/2;
			newX2 = newX1 + playerLength;
			newY1 = players[i].y1 + playerLength/2 - playerWidth/2;
			newY2 = newY1 + playerWidth;
		}
	if (players[i].direction === 'left' || players[i].direction === 'right')
		if (players[i].newDirection === 'up' || players[i].newDirection === 'down'){
			newX1 = players[i].x1 + playerLength/2 - playerWidth/2;
			newX2 = newX1 + playerWidth;
			newY1 = players[i].y1 + playerWidth/2 - playerLength/2;
			newY2 = newY1 + playerLength;
		}
	if (((players[i].direction === 'left') && (players[i].newDirection === 'right'))
		|| ((players[i].direction === 'right') && (players[i].newDirection === 'left'))
		|| ((players[i].direction === 'up') && (players[i].newDirection === 'down'))
		|| ((players[i].direction === 'down') && (players[i].newDirection === 'up'))) {
		players[i].direction = players[i].newDirection;
		players[i].isRunning = true;
	}
	if (!isOverlappingWithAWall(newX1, newY1, newX2, newY2) && !isOvelappingWithOtherPlayers(newX1, newY1, newX2, newY2, i)){
		players[i].x1 = newX1;
		players[i].y1 = newY1;
		players[i].x2 = newX2;
		players[i].y2 = newY2;
		players[i].direction = players[i].newDirection;
		players[i].isRunning = true;
	}
	players[i].newDirection = '';
}

function fire(i){
	players[i].firing = false;
	players[i].reload = 100;
	switch(players[i].direction){
		case 'up':
			bullets.push({player: players[i].id, x: players[i].x1 + playerWidth/2 - bulletSize/2, y: players[i].y1 + playerLength/2 - bulletSize/2, direction: players[i].direction});
			break;
		case 'right':
			bullets.push({player: players[i].id, x: players[i].x1 + playerLength/2 - bulletSize/2, y: players[i].y1 + playerWidth/2 - bulletSize/2, direction: players[i].direction});
			break;
		case 'down':
			bullets.push({player: players[i].id, x: players[i].x1 + playerWidth/2 - bulletSize/2, y: players[i].y1 + playerLength/2 - bulletSize/2, direction: players[i].direction});
			break;
		case 'left':
			bullets.push({player: players[i].id, x: players[i].x1 + playerLength/2 - bulletSize/2, y: players[i].y1 + playerWidth/2 - bulletSize/2, direction: players[i].direction});
			break;
	}
}

function moveBullet(i, speed){
	var newX = bullets[i].x, newY = bullets[i].y;
	switch(bullets[i].direction){
		case 'up':
			newY = newY - speed;
			break;
		case 'right':
			newX = newX + speed;
			break;
		case 'down':
			newY = newY + speed;
			break;
		case 'left':
			newX = newX - speed;
			break;
	}
	var playerIndex = -1;
	for (var j = 0; j < players.length; j++)
		if (players[j].id === bullets[i].player)
			playerIndex = j;
	if (!isOverlappingWithAWall(newX, newY, newX + bulletSize, newY + bulletSize) && !isOvelappingWithOtherPlayers(newX, newY, newX + bulletSize, newY + bulletSize, playerIndex)){
		bullets[i].x = newX;
		bullets[i].y = newY;
		return true;
	} else {
		return false;
	}
}

function distance (x, y, sx, sy){
	return Math.sqrt(Math.pow((x - sx), 2) + Math.pow((y - sy), 2));
}

function detonateBullet(i){
	for (var j = 0; j < players.length; j++){
		const playerCenterX = players[j].x1 + (players[j].x2 - players[j].x1) / 2;
		const playerCenterY = players[j].y1 + (players[j].y2 - players[j].y1) / 2;
		if (distance(bullets[i].x, bullets[i].y, playerCenterX, playerCenterY) <= blastRadius){
			console.log('Hasta la vista, baby');
		}
	}
	bullets.splice(i, 1);
}

function gameCycle() {
	try {
		for (var i = 0; i < players.length; i++){
			if (players[i].reload != 0)
				players[i].reload -= 1;
			else
				if (players[i].firing === true)
					fire(i);
			if (players[i].newDirection != ''){
				turnPlayer(i);
			} else {
				if (players[i].isRunning){
					var newSpeed = speed;
					while((!movePlayer(i, newSpeed)) && (newSpeed >= 1)){
						newSpeed = Math.floor(newSpeed/2);
					}
					//console.log('Stop Right There, Criminal Scum!'
				}
			}
		}
		for (var i = 0; i < bullets.length; i++){
			var newSpeed = bulletSpeed;
			while((!moveBullet(i, newSpeed))){
				if (newSpeed === 1){
					detonateBullet(i);
					break;
				}
				newSpeed = newSpeed - 1;
			}
		}
		var safePlayers = [];
		for (var i = 0; i < players.length; i++) {
			safePlayers.push({username: players[i].username, direction: players[i].direction, x1: players[i].x1, y1: players[i].y1, x2: players[i].x2, y2: players[i].y2, score: players[i].score})
		}
		var safeBullets = [];
		for (var i = 0; i < bullets.length; i++) {
			safeBullets.push({x: bullets[i].x, y: bullets[i].y})
		} 
		channel.assertQueue('mainServer', {durable: false});
		channel.sendToQueue('mainServer', Buffer.from(JSON.stringify({players: safePlayers, bullets: safeBullets, walls: walls, room: roomName, command: 'game update'})));
		setTimeout(gameCycle, 30);
	} catch (err) {
		console.log(err);
	}
}

function isOverlappingWithAWall(x1, y1, x2, y2){
	for (var i = 0; i < walls.length; i++){
		if (isOverlapped(x1, y1, x2, y2, walls[i].x1, walls[i].y1, walls[i].x2, walls[i].y2))
			return true;
	}
	return false;
}

function isOvelappingWithOtherPlayers(x1, y1, x2, y2, index){
	for(var i = 0; i < players.length; i++){
		if (i === index)
			continue;
		if (isPlayersOverlapped(x1, y1, x2, y2, players[i].x1, players[i].y1, players[i].x2, players[i].y2))
			return true;
	}
	return false;
}

function isPlayersOverlapped(firstX1, firstY1, firstX2, firstY2, secondX1, secondY1, secondX2, secondY2){
	return isOverlapped(firstX1, firstY1, firstX2, firstY2, secondX1, secondY1, secondX2, secondY2);
}

function isOverlapped(firstX1, firstY1, firstX2, firstY2, secondX1, secondY1, secondX2, secondY2){
	return ((firstX2 >= secondX1) && (firstY1 <= secondY2) && (firstY2 >= secondY1) && (firstX1 <= secondX2));
}

function getRndInteger(min, max) {
    return Math.floor(Math.random() * (max - min) ) + min;
}

main();
setTimeout(gameCycle, 1000);