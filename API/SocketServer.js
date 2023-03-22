const express = require("express")
const http = require("http")
const https = require("https")
const ws = require("ws")

const ID = require("./../Data/ID.js")
const SocketMessage = require("./SocketMessage.js")
const ArrayTools = require("./../Tools/ArrayTools.js")
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

function getGameServerFromId(gameServerId) {
    for (let [key, value] of Object.entries(Sockets)){
        if(value.userId === undefined && value.isVerified && value.gameServerId === gameServerId)
            return value
    }
    return undefined
}

function isGameServerTokenValid(gameServerId, gameServerToken){
    let gameServerMeta = getGameServerFromId(gameServerId)
    if(gameServerMeta === undefined)
        return false
    return gameServerMeta.gameServerToken === gameServerToken
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

function createInstanceMeta(gameServerId, instanceId, worldId, creatorId, instancePublicity){
    return new Promise((exec, reject) => {
        Worlds.doesWorldExist(worldId).then(exists => {
            if(exists !== undefined){
                let meta = {
                    GameServerId: gameServerId,
                    InstanceId: instanceId,
                    WorldId: worldId,
                    InstancePublicity: exports.InstancePublicity.getInstanceFromNumber(instancePublicity),
                    InstanceCreatorId: creatorId,
                    InvitedUsers: [],
                    BannedUsers: [],
                    ConnectedUsers: [creatorId],
                    Moderators: [creatorId]
                }
                exec(meta)
            }
            else
                exec(false)
        })
    })
}

function isUserWelcomeInInstance(instance, userId){
    return new Promise((exec, reject) => {
        switch(instance.InstancePublicity){
            case exports.InstancePublicity.ClosedRequest:
            case exports.InstancePublicity.OpenRequest:
                if(ArrayTools.find(instance.InvitedUsers, userId) !== undefined || ArrayTools.find(instance.Moderators, userId) || instanceId.InstanceCreatorId === userId){
                    exec(true)
                }
                break
            case exports.InstancePublicity.Friends:
                Users.getUserDataFromUserId(instance.InstanceCreatorId).then(userData => {
                    if(userData !== undefined){
                        if(ArrayTools.find(userData.Friends, userId) !== undefined){
                            exec(true)
                        }
                        else
                            exec(false)
                    }
                    else
                        exec(false)
                }).catch(err => reject(err))
                break
            case exports.InstancePublicity.Acquaintances:
                let c = true
                for (let i = 0; i < instance.ConnectedUsers.length; i++){
                    if(c){
                        let instanceUserId = instance.ConnectedUsers[i]
                        Users.getUserDataFromUserId(instanceUserId).then(userData => {
                            if(userData !== undefined){
                                if(ArrayTools.find(userData.Friends, userId) !== undefined){
                                    exec(true)
                                    c = false
                                }
                                else
                                    exec(false)
                            }
                            else
                                exec(false)
                        }).catch(err => reject(err))
                    }
                }
                break
            case exports.InstancePublicity.Anyone:
                exec(true)
                break
        }
    })
}

function canUserInvite(instance, userIdBeingInvited, userIdInviting){
    return new Promise((exec, reject) => {
        switch(instance.InstancePublicity){
            case exports.InstancePublicity.ClosedRequest:
                exec(instance.InstanceCreatorId === userIdInviting)
                break
            case exports.InstancePublicity.OpenRequest:
                exec(ArrayTools.find(instance.ConnectedUsers, userIdInviting))
                break
            case exports.InstancePublicity.Friends:
                Users.getUserDataFromUserId(instance.InstanceCreatorId).then(instanceOwnerUser => {
                    if(instanceOwnerUser !== undefined){
                        exec(ArrayTools.find(instanceOwnerUser.Friends, userIdBeingInvited) !== undefined)
                    }
                    else
                        exec(false)
                }).catch(err => reject(err))
                break
            case exports.InstancePublicity.Acquaintances:
                Users.getUserDataFromUserId(instance.InstanceCreatorId).then(instanceOwnerUser => {
                    if(instanceOwnerUser !== undefined){
                        exec(ArrayTools.find(instanceOwnerUser.Friends, userIdInviting) !== undefined)
                    }
                    else
                        exec(false)
                }).catch(err => reject(err))
                break
            case exports.InstancePublicity.Anyone:
                exec(true)
                break
        }
    })
}

function userJoinedInstance(gameServerId, instanceId, userId){
    return new Promise((exec, reject) => {
        let instance = getInstanceFromGameServerInstanceId(gameServerId, instanceId)
        if(instance === undefined){
            exec(false)
            return
        }
        let user = getSocketFromUserId(userId)
        if(user === undefined){
            exec(false)
            return
        }
        if(ArrayTools.find(instance.ConnectedUsers, userId)){
            exec(false)
            return
        }
        isUserWelcomeInInstance(instance, userId).then(isWelcome => {
            if(isWelcome){
                instance.ConnectedUsers.push(userId)
                updateSocketMeta(getSocketFromGameServerId(gameServerId, instance))
                exec(true)
            }
            else
                exec(false)
        }).catch(err => reject(err))
    })
}

function userLeftInstance(gameServerId, instanceId, userId){
    let instance = getInstanceFromGameServerInstanceId(gameServerId, instanceId)
    if(instance === undefined)
        return false
    if(ArrayTools.find(instance.ConnectedUsers, userId) !== undefined){
        instance.ConnectedUsers = ArrayTools.filterArray(instance.ConnectedUsers, userId)
        updateSocketMeta(getSocketFromGameServerId(gameServerId, instance))
        return true
    }
    return false
}

function addUserToInstanceModerator(gameServerId, instanceId, userId){
    let instance = getInstanceFromGameServerInstanceId(gameServerId, instanceId)
    if(instance === undefined)
        return false
    if(ArrayTools.find(instance.ConnectedUsers, userId) !== undefined && ArrayTools.find(instance.Moderators, userId) === undefined){
        instance.Moderators.push(userId)
        updateSocketMeta(getSocketFromGameServerId(gameServerId, instance))
        return true
    }
    return false
}

function removeUserFromInstanceModerator(gameServerId, instanceId, userId){
    let instance = getInstanceFromGameServerInstanceId(gameServerId, instanceId)
    if(instance === undefined)
        return false
    if(ArrayTools.find(instance.Moderators, userId) !== undefined){
        instance.Moderators = ArrayTools.filterArray(instance.Moderators, userId)
        updateSocketMeta(getSocketFromGameServerId(gameServerId, instance))
        return true
    }
    return false
}

function banUserFromInstance(gameServerId, instanceId, userId){
    let instance = getInstanceFromGameServerInstanceId(gameServerId, instanceId)
    if(instance === undefined)
        return false
    if(ArrayTools.find(instance.Moderators, userId) === undefined && ArrayTools.find(instance.Moderators, userId) === undefined){
        instance.BannedUsers.push(userId)
        updateSocketMeta(getSocketFromGameServerId(gameServerId, instance))
        return true
    }
    return false
}

function unbanUserFromInstance(gameServerId, instanceId, userId){
    let instance = getInstanceFromGameServerInstanceId(gameServerId, instanceId)
    if(instance === undefined)
        return false
    if(ArrayTools.find(instance.BannedUsers, userId) !== undefined){
        instance.BannedUsers = ArrayTools.filterArray(instance.BannedUsers, userId)
        updateSocketMeta(getSocketFromGameServerId(gameServerId, instance))
        return true
    }
    return false
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
              *     // given by the server after auth
              *     gameServerId: "",
              *     // given by the server after auth
              *     gameServerToken: "",
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
                        meta.gameServerToken = ID.newTokenPassword(50)
                        meta.serverTokenContent = parsedMessage.serverTokenContent
                        updateSocketMeta(socket, meta)
                        socket.send(SocketMessage.craftSocketMessage("sendauth", {
                            gameServerId: meta.gameServerId,
                            gameServerToken: meta.gameServerToken
                        }))
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
            if(isGameServerTokenValid(parsedMessage.gameServerId, parsedMessage.gameServerToken)){
                switch (parsedMessage.message.toLowerCase()) {
                    case "addmoderator":{
                        // Required Args: {args.instanceId, args.userId}
                        let gameServer = getGameServerFromId(parsedMessage.gameServerId)
                        if(gameServer !== undefined && getSocketFromUserId(parsedMessage.args.userId) !== undefined){
                            if(addUserToInstanceModerator(parsedMessage.gameServerId, parsedMessage.args.instanceId, parsedMessage.args.userId)) {
                                socket.send(SocketMessage.craftSocketMessage("addedmoderator", {
                                    userId: parsedMessage.args.userId
                                }))
                            }
                        }
                        break
                    }
                    case "removemoderator":{
                        // Required Args: {args.instanceId, args.userId}
                        let gameServer = getGameServerFromId(parsedMessage.gameServerId)
                        if(gameServer !== undefined && getSocketFromUserId(parsedMessage.args.userId) !== undefined){
                            if(removeUserFromInstanceModerator(parsedMessage.gameServerId, parsedMessage.args.instanceId, parsedMessage.args.userId)) {
                                socket.send(SocketMessage.craftSocketMessage("removedmoderator", {
                                    userId: parsedMessage.args.userId
                                }))
                            }
                        }
                        break
                    }
                    case "kickuser":{
                        // Required Args: {args.instanceId, args.userId}
                        let gameServer = getGameServerFromId(parsedMessage.gameServerId)
                        if(gameServer !== undefined && getSocketFromUserId(parsedMessage.args.userId) !== undefined){
                            if(userLeftInstance(parsedMessage.gameServerId, parsedMessage.args.instanceId, parsedMessage.args.userId)) {
                                socket.send(SocketMessage.craftSocketMessage("kickeduser", {
                                    userId: parsedMessage.args.userId
                                }))
                            }
                        }
                        break
                    }
                    case "banuser":{
                        // Required Args: {args.instanceId, args.userId}
                        Users.doesUserExist(parsedMessage.args.userId).then(userExists => {
                            if(userExists){
                                if(banUserFromInstance(parsedMessage.gameServerId, parsedMessage.args.instanceId, parsedMessage.args.userId)){
                                    socket.send(SocketMessage.craftSocketMessage("banneduser", {
                                        instanceId: parsedMessage.args.instanceId,
                                        userId: parsedMessage.args.userId
                                    }))
                                }
                            }
                        }).catch(() => {})
                        break
                    }
                    case "unbanuser":{
                        // Required Args: {args.instanceId, args.userId}
                        if(unbanUserFromInstance(parsedMessage.gameServerId, parsedMessage.args.instanceId, parsedMessage.args.userId)){
                            socket.send(SocketMessage.craftSocketMessage("unbanneduser", {
                                instanceId: parsedMessage.args.instanceId,
                                userId: parsedMessage.args.userId
                            }))
                        }
                        break
                    }
                }
            }
        }
        else{
            switch (parsedMessage.message.toLowerCase()) {
                case "joininstance":{
                    // Required Args: {args.gameServerId, args.instanceId}
                    userJoinedInstance(parsedMessage.args.gameServerId, parsedMessage.args.instanceId, parsedMessage.userId).then(canJoin => {
                        if(canJoin){
                            socket.send(SocketMessage.craftSocketMessage("joinedinstance", {
                                gameServerId: parsedMessage.args.gameServerId,
                                instanceId: parsedMessage.args.instanceId
                            }))
                        }
                        else{
                            socket.send(SocketMessage.craftSocketMessage("failedtojoininstance", {
                                gameServerId: parsedMessage.args.gameServerId,
                                instanceId: parsedMessage.args.instanceId
                            }))
                        }
                    })
                    break
                }
                case "leaveinstance":{
                    // Required Args: {args.gameServerId, args.instanceId}
                    if(userLeftInstance(parsedMessage.args.gameServerId, parsedMessage.args.instanceId, parsedMessage.userId)){
                        socket.send(SocketMessage.craftSocketMessage("leftinstance", {
                            gameServerId: parsedMessage.args.gameServerId,
                            instanceId: parsedMessage.args.instanceId
                        }))
                    }
                    else{
                        socket.send(SocketMessage.craftSocketMessage("failedtoleaveinstance", {
                            gameServerId: parsedMessage.args.gameServerId,
                            instanceId: parsedMessage.args.instanceId
                        }))
                    }
                    break
                }
                case "sendinvite":{
                    // Required Args: {args.targetUserId, args.gameServerId, args.toInstanceId}
                    let targetUserId = parsedMessage.args.targetUserId
                    let gameServerId = parsedMessage.args.gameServerId
                    let toInstanceId = parsedMessage.args.toInstanceId
                    let targetSocket = getSocketFromUserId(targetUserId)
                    let gameServerSocket = getSocketFromGameServerId(gameServerId)
                    let instanceMeta = getInstanceFromGameServerInstanceId(gameServerId, toInstanceId)
                    if(targetSocket !== undefined && gameServerSocket !== undefined && instanceMeta !== undefined){
                        if(ArrayTools.find(instanceMeta.ConnectedUsers, parsedMessage.userId)){
                            canUserInvite(instanceMeta, targetUserId).then(isWelcome => {
                                if(isWelcome){
                                    targetSocket.send(SocketMessage.craftSocketMessage("gotinvite", {
                                        fromUserId: meta.userId,
                                        toGameServerId: gameServerId,
                                        toInstanceId: toInstanceId
                                    }))
                                }
                            }).catch(() => {})
                        }
                    }
                    break
                }
            }
        }
    })
}

exports.InstancePublicity = {
    Anyone: 0,
    Acquaintances: 1,
    Friends: 2,
    OpenRequest: 3,
    ClosedRequest: 4,
    getInstanceFromNumber: function (number) {
        switch (number) {
            case 0:
                return exports.InstancePublicity.Anyone
            case 1:
                return exports.InstancePublicity.Acquaintances
            case 2:
                return exports.InstancePublicity.Friends
            case 3:
                return exports.InstancePublicity.OpenRequest
            case 4:
                return exports.InstancePublicity.ClosedRequest
            default:
                return exports.InstancePublicity.ClosedRequest
        }
    }
}