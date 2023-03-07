const express = require("express")
const http = require("http")
const https = require("https")
const ws = require("ws")

const ID = require("./../Data/ID.js")
const SocketMessage = require("./SocketMessage.js")
const Logger = require("./../Logging/Logger.js")

const app = express()

let ServerConfig
let Users
let Worlds

let server

exports.Init = function (serverConfig, usersModule, worldsModule, ssl) {
    ServerConfig = serverConfig
    Users = usersModule
    if(ServerConfig.LoadedConfig.UseHTTPS)
        server = https.createServer(ssl, app)
    else{
        server = http.createServer(app)
    }
    const wss = new ws.Server({server})
    wss.on('connection', onSocketConnect)
    server.listen(ServerConfig.LoadedConfig.SocketPort, () => {
        Logger.Log("Started WebSocket Server on Port " + ServerConfig.LoadedConfig.SocketPort)
    })
}

function createSocketMeta(){
    return {
        isVerified: false,
        // Game Server Stuff
        gameServerId: undefined,
        serverTokenContent: undefined,
        instances: undefined,
        // User Stuff
        userId: undefined,
        tokenContent: undefined
    }
}

let Sockets = {}

function addSocket(socket, meta){
    if(Sockets[socket] !== undefined)
        return false
    Sockets[socket] = meta
    return true
}

function updateSocketMeta(socket, meta){
    Sockets[socket] = meta
}

function removeSocket(socket){
    Sockets = Object.keys(Sockets).filter(x => x !== socket).reduce((obj, key) => {
        obj[key] = Sockets[key]
        return obj
    }, {})
    socket.destroy()
}

function getSocketFromUserId(userid){
    for (let [key, value] of Object.entries(Sockets)){
        if(value.userId === userid)
            return key
    }
    return undefined
}

function broadcastToUsers(message){
    for (let [key, value] of Object.entries(Sockets)){
        if(value.userId !== undefined && value.isVerified)
            key.send(message)
    }
    return undefined
}

function getSocketFromGameServerId(gameserverid){
    for (let [key, value] of Object.entries(Sockets)){
        if(value.gameServerId === gameserverid)
            return key
    }
    return undefined
}

function broadcastToGameServers(message){
    for (let [key, value] of Object.entries(Sockets)){
        if(value.gameServerId !== undefined && value.isVerified)
            key.send(message)
    }
    return undefined
}

let Instances = []

function getInstanceFromGameServerInstanceId(gameServerId, instanceId){
    for(let i = 0; i < Instances.length; i++){
        let instance = Instances[i]
        if(instance.gameServerId === gameServerId && instance.Id === instanceId)
            return instance
    }
    return undefined
}

function createInstanceMeta(gameServerId, instanceId, worldId, creatorId){
    return new Promise((exec, reject) => {
        Worlds.doesWorldExist(worldId).then(exists => {
            if(exists !== undefined){
                let meta = {
                    GameServerId: gameServerId,
                    InstanceId: instanceId,
                    WorldId: worldId,
                    InstanceCreatorId: creatorId,
                    Moderators: []
                }
                exec(meta)
            }
            else
                exec(false)
        })
    })
}

function onSocketConnect(socket){
    let meta = createSocketMeta()
    // This socket.destroy() is correct, because it should be added if addSocket returns false
    if(!addSocket(socket, meta))
        socket.destroy()
    socket.on('message', function message(data) {
        try{
            let parsedMessage = JSON.parse(data)
            /*
              * A message should look like the following
              * {
              *     userId: "userid",
              *     tokenContent: "tokenContent",
              *     message: "messageId",
              *     args: {}
              * }
              * where args will be any other arguments required for a message,
              * however, if this is a game server, its messages will look like this
              * {
              *     serverTokenContent: "game server tokenContent",
              *     message: "",
              *     args: {}
              * }
              * the simple way to differentiate is to check if there's a serverIP property
             */
            if(parsedMessage.userId !== undefined){
                if(!meta.isVerified){
                    // attempt to verify
                    Users.isUserIdTokenValid(parsedMessage.userId, parsedMessage.tokenContent).then(valid => {
                        if(valid){
                            meta.isVerified = true
                            meta.userId = parsedMessage.userId
                            meta.tokenContent = parsedMessage.tokenContent
                            updateSocketMeta(socket, meta)
                            postMessageHandle(socket, meta, parsedMessage).then(newMeta => {
                                if(newMeta !== undefined){
                                    meta = newMeta
                                    updateSocketMeta(socket, meta)
                                }
                            }).catch(() => {})
                        }
                        else
                            removeSocket(socket)
                    }).catch(() => {})
                }
                else{
                    postMessageHandle(socket, meta, parsedMessage).then(newMeta => {
                        if(newMeta !== undefined){
                            meta = newMeta
                            updateSocketMeta(socket, meta)
                        }
                    }).catch(() => {})
                }
            }
            else if(parsedMessage.serverTokenContent !== undefined){
                if(!meta.isVerified){
                    if(ServerConfig.LoadedConfig.AllowAnyGameServer || ServerConfig.LoadedConfig.GameServerTokens.indexOf(parsedMessage.serverTokenContent) >= 0){
                        meta.isVerified = true
                        meta.gameServerId = ID.new(ID.IDTypes.GameServer)
                        while(getSocketFromGameServerId(meta.gameServerId) !== undefined)
                            meta.gameServerId = ID.new(ID.IDTypes.GameServer)
                        meta.serverTokenContent = parsedMessage.serverTokenContent
                        updateSocketMeta(socket, meta)
                        postMessageHandle(socket, meta, parsedMessage, true).then(newMeta => {
                            if(newMeta !== undefined){
                                meta = newMeta
                                updateSocketMeta(socket, meta)
                            }
                        }).catch(() => {})
                    }
                }
                else{
                    postMessageHandle(socket, meta, parsedMessage, true).then(newMeta => {
                        if(newMeta !== undefined){
                            meta = newMeta
                            updateSocketMeta(socket, meta)
                        }
                    }).catch(() => {})
                }
            }
        } catch (e) {}
    })
}

function postMessageHandle(socket, meta, parsedMessage, isServer){
    return new Promise((exec, reject) => {
        if(isServer){
            switch (parsedMessage.message.toLowerCase()) {
                
            }
        }
        else{
            switch (parsedMessage.message.toLowerCase()) {
                case "sendinvite":{
                    let targetUserId = parsedMessage.args.targetUserId
                    let gameServerId = parsedMessage.args.gameServerId
                    let toInstanceId = parsedMessage.args.toInstanceId
                    let targetSocket = getSocketFromUserId(targetUserId)
                    let gameServerSocket = getSocketFromGameServerId(gameServerId)
                    let instanceMeta = getInstanceFromGameServerInstanceId(gameServerId, toInstanceId)
                    if(targetSocket !== undefined && gameServerSocket !== undefined && instanceMeta !== undefined){
                        targetSocket.send(SocketMessage.craftSocketMessage("gotinvite", {
                            fromUserId: meta.userId,
                            toGameServerId: gameServerId,
                            toInstanceId: toInstanceId
                        }))
                    }
                    break
                }
            }
        }
    })
}