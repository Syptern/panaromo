const express = require('express')
const http = require('http')
const socketIO = require('socket.io')

const port = process.env.PORT || 4001

const app = express()

const server = http.createServer(app)

const io = socketIO(server)

io.on('connection', socket => {
  console.log('a user connected')

  socket.on('disconnect', () => {
    console.log('user disconnected')
  })

  socket.on('select photo', (photo, room) => {
    console.log(`a new photo is selected in room ${room.gameid}`)
    io.sockets.to(room.gameid).emit('photo selected', photo)
  })

  socket.on('guessed location', (guessedlocation, name) => {
    io.sockets.to(Object.keys(socket.rooms)[0]).emit('guessed location', guessedlocation, socket.id, name)
  })

  socket.on('room created', (gameinfo) => {
    console.log(`${gameinfo.socketid} with the name: ${gameinfo.name} created room: ${gameinfo.gameid}`)
    socket.name = gameinfo.name
    socket.join(gameinfo.gameid)
    let roster = io.sockets.adapter.rooms[gameinfo.gameid].sockets
    let currentplayers = []
    Object.keys(roster).map( e => {
      currentplayers.push({name: io.sockets.connected[e].name, role: 'guesser', socketid: io.sockets.connected[e].id })
    })
    io.sockets.to(gameinfo.gameid).emit('player joined', gameinfo, currentplayers)
  })

  socket.on('joined room', (gameinfo) => {
    console.log(`${gameinfo.socketid} with the name: ${gameinfo.name} joined room: ${gameinfo.gameid}`)
    socket.name = gameinfo.name
    socket.join(gameinfo.gameid)
    let roster = io.sockets.adapter.rooms[gameinfo.gameid].sockets
    let currentplayers = []
    Object.keys(roster).map( e => {

      currentplayers.push({name: io.sockets.connected[e].name, role: 'guesser', socketid: io.sockets.connected[e].id })
    })
    io.sockets.to(gameinfo.gameid).emit('player joined', gameinfo, currentplayers)
  })

  socket.on('request gamestate', (room) => {
    let userid = Object.keys(io.sockets.adapter.rooms[room].sockets)[0]
    io.sockets.sockets[userid].emit('request gamestate', socket.id)
  })

  socket.on('awnser gamestate', (requestid , timer, state) => {
    io.sockets.sockets[requestid].emit('awnser gamestate', timer, state)
  })

  socket.on('create game', (playeramount)  => {
  const randomplayernumber = Math.floor(Math.random() * playeramount)
   io.sockets.to(Object.keys(socket.rooms)[0]).emit('create game', randomplayernumber)
 })

 socket.on('gamestate guessing', () => {
   io.sockets.to(Object.keys(socket.rooms)[0]).emit('gamestate guessing')
 })

})

server.listen(port, () => console.log(`server listening on port ${port}`))
