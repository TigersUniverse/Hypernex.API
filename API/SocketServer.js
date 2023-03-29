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
    Users.SetSocketServer(this)
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
    return this
}

function createSocketMeta(){
    return {
        isVerified: false,
        // Game Server Stuff
        gameServerId: undefined,
        serverTokenContent: undefined,
        Instances: [],
        // User Stuff
        userId: undefined,
        tokenContent: undefined,
        ConnectedInstances: []
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

exports.isUserIdConnected = function (userId) {
    return getSocketFromUserId(userId) !== undefined
}

function broadcastToUsers(message){
    for (let [key, value] of Object.entries(Sockets)){
        if(value.userId !== undefined && value.isVerified)
            key.send(message)
    }
    return undefined
}

function getSocketFromGameServerId(gameServerId){
    for (let [key, value] of Object.entries(Sockets)){
        if(value.gameServerId === gameServerId)
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

let RequestedInstances = []
let Instances = []

exports.GetSafeInstances = function (user) {
    return new Promise(exec => {
        let instanceLoops = 0
        let is = []
        for(let i = 0; i < Instances.length; i++){
            let instance = Instances[i]
            let safeinstance = {
                GameServerId: instance.GameServerId,
                InstanceId: instance.InstanceId,
                InstanceCreatorId: instance.InstanceCreatorId,
                InstancePublicity: instance.InstancePublicity,
                InstanceProtocol: instance.InstanceProtocol,
                ConnectedUsers: instance.ConnectedUsers,
                WorldId: instance.WorldId
            }
            if(instance.InstancePublicity === exports.InstancePublicity.Anyone){
                is.push(safeinstance)
                instanceLoops++
            }
            else if(instance.InstancePublicity === exports.InstancePublicity.Acquaintances){
                let added = false
                for(let u = 0; u < instance.ConnectedUsers.length; u++){
                    if(!added){
                        Users.getUserDataFromUserId(instance.ConnectedUsers[u]).then(pu => {
                            if(pu !== undefined){
                                if(!added && ArrayTools.find(pu.Friends, user.Id) !== undefined){
                                    added = true
                                    is.push(safeinstance)
                                }
                            }
                            instanceLoops++
                        }).catch(() => instanceLoops++)
                    }
                }
            }
            else if(instance.InstancePublicity === exports.InstancePublicity.Friends){
                if(ArrayTools.find(user.Friends, instance.InstanceCreatorId))
                    is.push(safeinstance)
                instanceLoops++
            }
            else{
                if(ArrayTools.find(instance.InvitedUsers, user.Id))
                    is.push(safeinstance)
                instanceLoops++
            }
        }
        let interval = setInterval(() => {
            if(instanceLoops >= Instances.length){
                exec(is)
                clearInterval(interval)
            }
        }, 10)
    })
}

function getRequestedInstanceFromTemporaryId(temporaryId){
    for (let i = 0; i < RequestedInstances.length; i++){
        let requestedInstance = RequestedInstances[i]
        if(requestedInstance.TemporaryId === temporaryId)
            return requestedInstance
    }
    return undefined
}

function getInstanceFromGameServerInstanceId(gameServerId, instanceId){
    for(let i = 0; i < Instances.length; i++){
        let instance = Instances[i]
        if(instance.gameServerId === gameServerId && instance.Id === instanceId)
            return instance
    }
    return undefined
}

function onInstanceUpdated(instanceMeta){
    let gameServerSocket = getSocketFromGameServerId(instanceMeta.gameServerId)
    if(gameServerSocket === undefined)
        return
    gameServerSocket.send(SocketMessage.craftSocketMessage("updatedinstance", {
        instanceMeta: instanceMeta
    }))
}

function createRequestedInstanceMeta(worldId, creatorId, instancePublicity, instanceProtocol){
    return new Promise((exec, reject) => {
        Worlds.getWorldMetaById(worldId).then(world => {
            if(world !== undefined){
                if(world.Publicity === Worlds.Publicity.Anyone || (world.Publicity === Worlds.Publicity.OwnerOnly && world.OwnerId === creatorId)){
                    let requestedMeta = {
                        TemporaryId: ID.newSafeURLTokenPassword(25),
                        isInstanceClaimed: false,
                        WorldId: worldId,
                        InstancePublicity: exports.InstancePublicity.getInstanceFromNumber(instancePublicity),
                        InstanceProtocol: exports.InstanceProtocol.getProtocolFromNumber(instanceProtocol),
                        InstanceCreatorId: creatorId
                    }
                    while(getRequestedInstanceFromTemporaryId(requestedMeta.TemporaryId) !== undefined)
                        requestedMeta.TemporaryId = ID.newSafeURLTokenPassword(25)
                    RequestedInstances.push(requestedMeta)
                    broadcastToGameServers(SocketMessage.craftSocketMessage("requestedinstancecreated", {
                        temporaryId: requestedMeta.TemporaryId,
                        instanceProtocol: requestedMeta.InstanceProtocol
                    }))
                    exec(true)
                }
                else
                    exec(false)
            }
            else
                exec(false)
        }).catch(err => reject(err))
    })
}

function createInstanceMetaFromRequestedInstanceMeta(gameServerId, instanceId, requestedInstanceMeta, uri){
    let userSocket = getSocketFromUserId(requestedInstanceMeta.InstanceCreatorId)
    let gameServerSocket = getSocketFromGameServerId(gameServerId)
    let gameServerMeta
    if(userSocket === undefined || gameServerSocket === undefined){
        RequestedInstances = ArrayTools.customFilterArray(RequestedInstances, item => item.TemporaryId !== requestedInstanceMeta.TemporaryId)
        return undefined
    }
    else
        gameServerMeta = Sockets[gameServerSocket]
    if(gameServerMeta === undefined){
        RequestedInstances = ArrayTools.customFilterArray(RequestedInstances, item => item.TemporaryId !== requestedInstanceMeta.TemporaryId)
        return undefined
    }
    let meta = {
        Uri: uri,
        GameServerId: gameServerId,
        TemporaryId: requestedInstanceMeta.TemporaryId,
        InstanceId: instanceId,
        WorldId: requestedInstanceMeta.WorldId,
        InstancePublicity: exports.InstancePublicity.getInstanceFromNumber(requestedInstanceMeta.InstancePublicity),
        InstanceProtocol: exports.InstanceProtocol.getProtocolFromNumber(requestedInstanceMeta.InstanceProtocol),
        InstanceCreatorId: requestedInstanceMeta.InstanceCreatorId,
        InvitedUsers: [],
        BannedUsers: [],
        ConnectedUsers: [requestedInstanceMeta.InstanceCreatorId],
        Moderators: [requestedInstanceMeta.InstanceCreatorId]
    }
    RequestedInstances = ArrayTools.customFilterArray(RequestedInstances, item => item.TemporaryId !== requestedInstanceMeta.TemporaryId)
    Instances.push(meta)
    gameServerMeta.Instances.push(instanceId)
    onInstanceUpdated(meta)
    userSocket.send(SocketMessage.craftSocketMessage("instanceopened", {
        gameServerId: gameServerId,
        instanceId: instanceId
    }))
    return meta
}

function isUserWelcomeInInstance(instance, userId){
    return new Promise((exec, reject) => {
        if(instance.InstanceCreatorId === userId){
            exec(true)
            return
        }
        switch(instance.InstancePublicity){
            case exports.InstancePublicity.ClosedRequest:
            case exports.InstancePublicity.ModeratorRequest:
            case exports.InstancePublicity.OpenRequest:
                if(ArrayTools.find(instance.InvitedUsers, userId) !== undefined || ArrayTools.find(instance.Moderators, userId) || instanceId.InstanceCreatorId === userId){
                    exec(true)
                }
                else
                    exec(false)
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
            default:
                exec(false)
                break
        }
    })
}

function canUserInvite(instance, userIdBeingInvited, userIdInviting){
    return new Promise((exec, reject) => {
        if(instance.InstanceCreatorId === userIdInviting){
            exec(true)
            return
        }
        switch(instance.InstancePublicity){
            case exports.InstancePublicity.ClosedRequest:
                exec(instance.InstanceCreatorId === userIdInviting)
                break
            case exports.InstancePublicity.ModeratorRequest:
                exec(ArrayTools.find(instance.Moderators, userIdInviting) !== undefined)
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
        let userSocket = getSocketFromUserId(userId)
        if(instance === undefined || userMeta === undefined){
            exec(false)
            return
        }
        let userMeta = Sockets[userSocket]
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
                onInstanceUpdated(instance)
                updateSocketMeta(getSocketFromGameServerId(gameServerId, instance))
                userMeta.ConnectedInstances.push({gameServerId: gameServerId, instanceId: instanceId})
                updateSocketMeta(userSocket, userMeta)
                exec(true)
            }
            else
                exec(false)
        }).catch(err => reject(err))
    })
}

function userLeftInstance(gameServerId, instanceId, userId){
    let instance = getInstanceFromGameServerInstanceId(gameServerId, instanceId)
    let userSocket = getSocketFromUserId(userId)
    if(instance === undefined || userSocket === undefined)
        return false
    let userMeta = Sockets[userSocket]
    let gameServerSocket = getSocketFromGameServerId(instance.gameServerId)
    if(gameServerSocket === undefined)
        return
    if(ArrayTools.find(instance.ConnectedUsers, userId) !== undefined){
        instance.ConnectedUsers = ArrayTools.filterArray(instance.ConnectedUsers, userId)
        gameServerSocket.send(SocketMessage.craftSocketMessage("userleft", {
            instanceId: instanceId,
            userId: userId
        }))
        onInstanceUpdated(instance)
        updateSocketMeta(getSocketFromGameServerId(gameServerId, instance))
        userMeta.ConnectedInstances = ArrayTools.customFilterArray(userMeta.ConnectedInstances, item => item.gameServerId !== gameServerId && item.instanceId !== instanceId)
        updateSocketMeta(userSocket, userMeta)
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
        onInstanceUpdated(instance)
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
        onInstanceUpdated(instance)
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
        onInstanceUpdated(instance)
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
        onInstanceUpdated(instance)
        updateSocketMeta(getSocketFromGameServerId(gameServerId, instance))
        return true
    }
    return false
}

function removeInstance(socket, gameServerId, instanceId){
    let gameServerMeta = Sockets[socket]
    let instance = getInstanceFromGameServerInstanceId(gameServerId, instanceId)
    if(instance !== undefined){
        for(let i = 0; i < instance.ConnectedUsers.length; i++){
            let userId = instance.ConnectedUsers[i]
            if(userLeftInstance(gameServerId, instanceId, userId)){
                let socket = getSocketFromUserId(userId)
                if(socket !== undefined){
                    socket.send(SocketMessage.craftSocketMessage("leftinstance", {
                        gameServerId: parsedMessage.args.gameServerId,
                        instanceId: parsedMessage.args.instanceId
                    }))
                }
            }
        }
    }
    Instances = ArrayTools.customFilterArray(Instances, item => item.GameServerId !== gameServerId && item.InstanceId !== instanceId)
    gameServerMeta.Instances = ArrayTools.filterArray(gameServerMeta.Instances, instanceId)
}

function removeSocketFromAllInstances(socket){
    let meta = Sockets[socket]
    if(meta !== undefined && meta.isVerified){
        for(let i = 0; i < meta.ConnectedInstances; i++){
            let instanceMeta = meta.ConnectedInstances[i]
            userLeftInstance(instanceMeta.gameServerId, instanceMeta.instanceId, meta.userId)
        }
        delete Sockets[socket]
    }
}

function removeAllGameServerInstances(socket, deleteSocket){
    let meta = Sockets[socket]
    if(meta !== undefined && meta.isVerified){
        for(let i = 0; i < meta.Instances; i++){
            let instanceId = meta.Instances[i]
            let instance = getInstanceFromGameServerInstanceId(meta.gameServerId, instanceId)
            removeInstance(socket, meta.gameServerId, instanceId)
        }
        if(deleteSocket)
            delete Sockets[socket]
    }
}

function onSocketConnect(socket){
    let isAlive = true
    let meta = createSocketMeta()
    // This socket.destroy() is correct, because it should be added if addSocket returns false
    if(!addSocket(socket, meta)){
        socket.destroy()
        return
    }
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
              * the simple way to differentiate is to check if there's a userId property
             */
            if(parsedMessage.userId !== undefined){
                if(!meta.isVerified){
                    // attempt to verify
                    Users.isUserIdTokenValid(parsedMessage.userId, parsedMessage.tokenContent).then(valid => {
                        if(valid && getSocketFromUserId(parsedMessage.userId) === undefined){
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
                    if(ServerConfig.LoadedConfig.AllowAnyGameServer || ArrayTools.find(ServerConfig.LoadedConfig.GameServerTokens, parsedMessage.serverTokenContent) !== undefined){
                        meta.isVerified = true
                        let gid = ID.new(ID.IDTypes.GameServer)
                        while(getSocketFromGameServerId(gid) !== undefined)
                            gid = ID.new(ID.IDTypes.GameServer)
                        meta.gameServerId = gid
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
    const interval = setInterval(() => {
        if(!isAlive){
            removeSocketFromAllInstances(socket)
            removeAllGameServerInstances(socket)
            socket.terminate()
            return
        }
        isAlive = false
        socket.ping()
    }, 10000)
    socket.on('close', () => {
        removeSocketFromAllInstances(socket)
        removeAllGameServerInstances(socket)
        clearInterval(interval)
    })
    socket.on('error', function () {
        removeSocketFromAllInstances(socket)
        removeAllGameServerInstances(socket)
        clearInterval(interval)
        socket.terminate()
    })
    socket.on('pong', () => isAlive = true)
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
                                    instanceId: parsedMessage.args.instanceId,
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
                                    instanceId: parsedMessage.args.instanceId,
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
                                    instanceId: parsedMessage.args.instanceId,
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
                    case "claiminstancerequest":{
                        // Required Args: {args.TemporaryId, args.Uri}
                        let requestedInstance = getRequestedInstanceFromTemporaryId(parsedMessage.args.TemporaryId)
                        if(requestedInstance === undefined){
                            socket.send(SocketMessage.craftSocketMessage("notselectedgameserver", {
                                temporaryId: parsedMessage.args.TemporaryId
                            }))
                            return
                        }
                        if(!requestedInstance.isInstanceClaimed){
                            requestedInstance.isInstanceClaimed = true
                            let id = ID.new(ID.IDTypes.Instance)
                            while(getInstanceFromGameServerInstanceId(parsedMessage.gameServerId, id))
                                id = ID.new(ID.IDTypes.Instance)
                            let meta = createInstanceMetaFromRequestedInstanceMeta(parsedMessage.gameServerId, id, requestedInstance, parsedMessage.args.Uri)
                            if(meta !== undefined){
                                socket.send(SocketMessage.craftSocketMessage("selectedgameserver", {
                                    instanceMeta: meta
                                }))
                            }
                            else{
                                socket.send(SocketMessage.craftSocketMessage("notselectedgameserver", {
                                    temporaryId: parsedMessage.args.TemporaryId
                                }))
                            }
                        }
                        else
                            socket.send(SocketMessage.craftSocketMessage("notselectedgameserver", {
                                temporaryId: parsedMessage.args.TemporaryId
                            }))
                        break
                    }
                    case "removeinstance":{
                        // Required Args: {args.instanceId}
                        let gameServerSocket = getSocketFromGameServerId(parsedMessage.gameServerId)
                        if(gameServerSocket === undefined)
                            break
                        let gameServerMeta = Sockets[gameServerSocket]
                        if(gameServerMeta === undefined)
                            break
                        removeInstance(socket, parsedMessage.gameServerId, parsedMessage.args.instanceId)
                        break
                    }
                }
            }
        }
        else{
            switch (parsedMessage.message.toLowerCase()) {
                case "joininstance":{
                    // Required Args: {args.gameServerId, args.instanceId}
                    let gameServerSocket = getGameServerFromId(parsedMessage.args.gameServerId)
                    if(gameServerSocket !== undefined){
                        userJoinedInstance(parsedMessage.args.gameServerId, parsedMessage.args.instanceId, parsedMessage.userId).then(canJoin => {
                            if(canJoin){
                                // if we can join, we know the instance exists
                                let instanceUri = getInstanceFromGameServerInstanceId(parsedMessage.args.gameServerId, parsedMessage.args.instanceId).Uri
                                let tempUserToken = ID.newTokenPassword(50)
                                gameServerSocket.send(SocketMessage.craftSocketMessage("tempusertoken", {
                                    tempUserToken: tempUserToken,
                                    userId: parsedMessage.userId,
                                    instanceId: parsedMessage.args.instanceId
                                }))
                                socket.send(SocketMessage.craftSocketMessage("joinedinstance", {
                                    Uri: instanceUri,
                                    gameServerId: parsedMessage.args.gameServerId,
                                    instanceId: parsedMessage.args.instanceId,
                                    tempUserToken: tempUserToken
                                }))
                            }
                            else{
                                socket.send(SocketMessage.craftSocketMessage("failedtojoininstance", {
                                    gameServerId: parsedMessage.args.gameServerId,
                                    instanceId: parsedMessage.args.instanceId
                                }))
                            }
                        })
                    }
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
                        if(ArrayTools.find(instanceMeta.ConnectedUsers, parsedMessage.userId) !== undefined){
                            canUserInvite(instanceMeta, targetUserId).then(isWelcome => {
                                if(isWelcome){
                                    instanceMeta.InvitedUsers.push(targetUserId)
                                    onInstanceUpdated(instanceMeta)
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
                case "shareavatartoken":{
                    // Required Args: {args.targetUserId, args.avatarId, args.avatarToken}
                    let targetUserId = parsedMessage.args.targetUserId
                    let targetSocket = getSocketFromUserId(targetUserId)
                    if(targetSocket !== undefined){
                        targetSocket.send(SocketMessage.craftSocketMessage("sharedavatartoken", {
                            fromUserId: parsedMessage.userId,
                            targetUserId: parsedMessage.args.targetUserId,
                            avatarId: parsedMessage.args.avatarId,
                            avatarToken: parsedMessage.args.avatarToken
                        }))
                        socket.send(SocketMessage.craftSocketMessage("sharedavatartoken", {
                            fromUserId: parsedMessage.userId,
                            targetUserId: parsedMessage.args.targetUserId,
                            avatarId: parsedMessage.args.avatarId,
                            avatarToken: parsedMessage.args.avatarToken
                        }))
                    }
                    else
                        socket.send(SocketMessage.craftSocketMessage("failedtoshareavatartoken", {
                            targetUserId: parsedMessage.args.targetUserId,
                            avatarId: parsedMessage.args.avatarId,
                            avatarToken: parsedMessage.args.avatarToken
                        }))
                    break
                }
                case "requestnewinstance":{
                    // Required Args: {args.worldId, args.instancePublicity, args.instanceProtocol}
                    createRequestedInstanceMeta(parsedMessage.args.worldId, parsedMessage.userId, parsedMessage.args.instancePublicity, parsedMessage.args.instanceProtocol).then(r => {
                        if(r){
                            socket.send(SocketMessage.craftSocketMessage("createdtemporaryinstance", {}))
                        }
                        else{
                            socket.send(SocketMessage.craftSocketMessage("failedtocreatetemporaryinstance", {}))
                        }
                    }).catch(() => socket.send(SocketMessage.craftSocketMessage("failedtocreatetemporaryinstance", {})))
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
    ModeratorRequest: 4,
    ClosedRequest: 5,
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
                return exports.InstancePublicity.ModeratorRequest
            case 5:
                return exports.InstancePublicity.ClosedRequest
            default:
                return exports.InstancePublicity.ClosedRequest
        }
    }
}

exports.InstanceProtocol = {
    KCP: 0,
    TCP: 1,
    UDP: 2,
    getProtocolFromNumber: function (number) {
        switch(number){
            case 0:
                return exports.InstanceProtocol.KCP
            case 1:
                return exports.InstanceProtocol.TCP
            case 2:
                return exports.InstanceProtocol.UDP
            default:
                return exports.InstanceProtocol.KCP
        }
    }
}