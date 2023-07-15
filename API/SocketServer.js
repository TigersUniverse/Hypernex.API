const express = require("express")
const http = require("http")
const https = require("https")
const WebSocket = require("ws")

const ID = require("./../Data/ID.js")
const SocketMessage = require("./SocketMessage.js")
const ArrayTools = require("./../Tools/ArrayTools.js")
const Logger = require("./../Logging/Logger.js")
const {IDTypes} = require("../Data/ID");

const app = express()

let ServerConfig
let Users
let Worlds

let server

exports.Init = function (serverConfig, usersModule, worldsModule, ssl) {
    ServerConfig = serverConfig
    Users = usersModule
    Users.SetSocketServer(this)
    Worlds = worldsModule
    if(ServerConfig.LoadedConfig.UseHTTPS)
        server = https.createServer(ssl, app)
    else{
        server = http.createServer(app)
    }
    const wss = new WebSocket.Server({server})
    wss.on('connection', function(ws){onSocketConnect(ws)})
    server.listen(ServerConfig.LoadedConfig.SocketPort, () => {
        Logger.Log("Started WebSocket Server on Port " + ServerConfig.LoadedConfig.SocketPort)
    })
    return this
}

let Sockets = []

function addSocket(id, socket){
    let o = {Id: id, Socket: socket, Meta: {
            isVerified: false,
            // Game Server Stuff
            gameServerId: undefined,
            serverTokenContent: undefined,
            // User Stuff
            userId: undefined,
            tokenContent: undefined,
            ConnectedInstances: []
        }}
    Sockets.push(o)
    return o
}

function getSocketObjectById(id){
    for(let i = 0; i < Sockets.length; i++){
        let socketObject = Sockets[i]
        if(socketObject.Id === id)
            return socketObject
    }
    return undefined
}

function getSocketObjectByUserId(userid){
    for(let i = 0; i < Sockets.length; i++){
        let socketObject = Sockets[i]
        if(socketObject.Meta.userId === userid)
            return socketObject
    }
    return undefined
}

function getSocketObjectByGameServerId(gameServerId){
    for(let i = 0; i < Sockets.length; i++){
        let socketObject = Sockets[i]
        if(socketObject.Meta.gameServerId === gameServerId)
            return socketObject
    }
    return undefined
}

function broadcastToGameServers(msg){
    for(let i = 0; i < Sockets.length; i++){
        let socketObject = Sockets[i]
        if(socketObject.Meta.isVerified && socketObject.Meta.gameServerId !== undefined)
            socketObject.Socket.send(msg)
    }
}

function removeSocketById(id){
    let socketObject = getSocketObjectById(id)
    if(socketObject !== undefined){
        try{
            socketObject.Socket.terminate()
            socketObject.Socket.destroy()
        }
        catch(_){}
        if(socketObject.Meta.userId !== undefined){
            let dup = ArrayTools.clone(socketObject.Meta.ConnectedInstances)
            for(let i = 0; i < dup.length; i++){
                let connectedInstance = dup[i]
                let instance = getInstanceById(connectedInstance.gameServerId, connectedInstance.instanceId)
                if(instance !== undefined)
                    removeUserFromInstance(instance, socketObject.Meta.userId)
            }
        }
        if(socketObject.Meta.gameServerId !== undefined){
            let instances = getAllInstances(socketObject.Meta.gameServerId)
            // TODO: bugged?
            for(let i = 0; i < instances.length; i++)
                destroyInstance(socketObject.Meta.gameServerId, instances[i].InstanceId)
        }
        Sockets = ArrayTools.customFilterArray(Sockets, x => x.Id !== id)
    }
}

exports.isUserIdConnected = function (userId) {
    if(userId === undefined)
        return false
    return getSocketObjectByUserId(userId) !== undefined
}

exports.AreGameServerCredentialsValid = function (gameServerId, serverTokenContent) {
    let gameServerSocketObject = getSocketObjectByGameServerId(gameServerId)
    if(gameServerSocketObject !== undefined)
        return gameServerSocketObject.Meta.isVerified
    return false
}

function onSocketConnect(socket){
    let isAlive = true
    let id = ID.newTokenPassword(25)
    while(getSocketObjectById(id) !== undefined)
        id = ID.newTokenPassword(25)
    let socketObject = addSocket(id, socket)
    socket.on('message', function (data) {
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
            if(socketObject.Meta.isVerified){
                if(socketObject.Meta.userId !== parsedMessage.userId)
                    removeSocketById(socketObject.Id)
                else if(socketObject.Meta.gameServerId !== parsedMessage.gameServerId)
                    removeSocketById(socketObject.Id)
                else
                    handleMessage(socketObject, parsedMessage)
            }
            else{
                if(parsedMessage.userId !== undefined){
                    // Verify User
                    if(exports.isUserIdConnected(parsedMessage.userId))
                        removeSocketById(socketObject.Id)
                    else{
                        Users.isUserIdTokenValid(parsedMessage.userId, parsedMessage.tokenContent).then(valid => {
                            if(valid){
                                socketObject.Meta.userId = parsedMessage.userId
                                socketObject.Meta.tokenContent = parsedMessage.tokenContent
                                socketObject.Meta.isVerified = true
                                handleMessage(socketObject, parsedMessage)
                            }
                        }).catch(_ => removeSocketById(socketObject.Id))
                    }
                }
                else{
                    // Verify Game Server
                    if(ServerConfig.LoadedConfig.AllowAnyGameServer || ArrayTools.find(ServerConfig.LoadedConfig.GameServerTokens, parsedMessage.serverTokenContent) !== undefined){
                        let gameServerId = ID.new(ID.IDTypes.GameServer)
                        while(getSocketObjectByGameServerId(gameServerId) !== undefined)
                            gameServerId = ID.new(ID.IDTypes.GameServer)
                        socketObject.Meta.gameServerId = gameServerId
                        socketObject.Meta.serverTokenContent = parsedMessage.serverTokenContent
                        socketObject.Meta.isVerified = true
                        socketObject.Socket.send(SocketMessage.craftSocketMessage("sendauth", {
                            gameServerId: socketObject.Meta.gameServerId,
                            gameServerToken: socketObject.Meta.serverTokenContent
                        }))
                        handleMessage(socketObject, parsedMessage)
                    }
                    else
                        removeSocketById(socketObject.Id)
                }
            }
        }
        catch(_){}
    })
    const interval = setInterval(() => {
        if(!isAlive){
            removeSocketById(socketObject.Id)
            return
        }
        isAlive = false
        socket.ping()
    }, 10000)
    socket.on('close', () => {
        clearInterval(interval)
        removeSocketById(socketObject.Id)
    })
    socket.on('error', function () {
        clearInterval(interval)
        removeSocketById(socketObject.Id)
    })
    socket.on('pong', () => isAlive = true)
}

function handleMessage(socketObject, parsedMessage){
    if(socketObject.Meta.gameServerId !== undefined){
        switch (parsedMessage.message.toLowerCase()) {
            case "addmoderator":{
                // Required Args: {args.instanceId, args.userId}
                Users.doesUserExist(parsedMessage.args.userId).then(userExists => {
                    if(userExists){
                        let instance = getInstanceById(socketObject.Meta.gameServerId, parsedMessage.args.instanceId)
                        if(instance !== undefined && ArrayTools.find(instance.Moderators, parsedMessage.args.userId) === undefined){
                            instance.Moderators.push(parsedMessage.args.userId)
                            socketObject.Socket.send(SocketMessage.craftSocketMessage("addedmoderator", {
                                instanceId: parsedMessage.args.instanceId,
                                userId: parsedMessage.args.userId
                            }))
                            sendInstanceUpdate(socketObject, instance)
                        }
                    }
                }).catch(_ => {})
                break
            }
            case "removemoderator":{
                // Required Args: {args.instanceId, args.userId}
                let instance = getInstanceById(socketObject.Meta.gameServerId, parsedMessage.args.instanceId)
                if(instance !== undefined && parsedMessage.args.userId !== instance.InstanceCreatorId){
                    instance.Moderators = ArrayTools.filterArray(instance.Moderators, parsedMessage.args.userId)
                    socketObject.Socket.send(SocketMessage.craftSocketMessage("removedmoderator", {
                        instanceId: parsedMessage.args.instanceId,
                        userId: parsedMessage.args.userId
                    }))
                    sendInstanceUpdate(socketObject, instance)
                }
                break
            }
            case "kickuser":{
                // Required Args: {args.instanceId, args.userId}
                let instance = getInstanceById(socketObject.Meta.gameServerId, parsedMessage.args.instanceId)
                if(instance !== undefined)
                    removeUserFromInstance(instance, parsedMessage.args.userId)
                break
            }
            case "banuser":{
                // Required Args: {args.instanceId, args.userId}
                Users.doesUserExist(parsedMessage.args.userId).then(userExists => {
                    if(userExists){
                        let instance = getInstanceById(socketObject.Meta.gameServerId, parsedMessage.args.instanceId)
                        if(instance !== undefined && ArrayTools.find(instance.BannedUsers, parsedMessage.args.userId) === undefined && parsedMessage.args.userId !== instance.InstanceCreatorId){
                            instance.BannedUsers.push(parsedMessage.args.userId)
                            socketObject.Socket.send(SocketMessage.craftSocketMessage("banneduser", {
                                instanceId: parsedMessage.args.instanceId,
                                userId: parsedMessage.args.userId
                            }))
                            sendInstanceUpdate(socketObject, instance)
                        }
                    }
                }).catch(_ => {})
                break
            }
            case "unbanuser":{
                // Required Args: {args.instanceId, args.userId}
                let instance = getInstanceById(socketObject.Meta.gameServerId, parsedMessage.args.instanceId)
                if(instance !== undefined){
                    instance.BannedUsers = ArrayTools.filterArray(instance.BannedUsers, parsedMessage.args.userId)
                    socketObject.Socket.send(SocketMessage.craftSocketMessage("unbanneduser", {
                        instanceId: parsedMessage.args.instanceId,
                        userId: parsedMessage.args.userId
                    }))
                    sendInstanceUpdate(socketObject, instance)
                }
                break
            }
            case "claiminstancerequest":{
                // Required Args: {args.TemporaryId, args.Uri}
                createInstanceFromRequestedId(socketObject, parsedMessage.args.TemporaryId, parsedMessage.args.Uri)
                break
            }
            case "instanceready":{
                // Required Args: {args.instanceId}
                let instance = getInstanceById(socketObject.Meta.gameServerId, parsedMessage.args.instanceId)
                if(instance !== undefined && !instance.Readied){
                    let userSocketObject = getSocketObjectByUserId(instance.InstanceCreatorId)
                    if(userSocketObject !== undefined){
                        let tempUserToken = ID.newTokenPassword(50)
                        socketObject.Socket.send(SocketMessage.craftSocketMessage("tempusertoken", {
                            tempUserToken: tempUserToken,
                            userId: instance.InstanceCreatorId,
                            instanceId: parsedMessage.args.instanceId
                        }))
                        userSocketObject.Socket.send(SocketMessage.craftSocketMessage("instanceopened", {
                            gameServerId: socketObject.Meta.gameServerId,
                            instanceId: instance.InstanceId,
                            InstanceProtocol: instance.InstanceProtocol,
                            InstancePublicity: instance.InstancePublicity,
                            Uri: instance.Uri,
                            worldId: instance.WorldId,
                            tempUserToken: tempUserToken,
                            Moderators: instance.Moderators,
                            BannedUsers: instance.BannedUsers
                        }))
                        instance.Readied = true
                    }
                    else
                        destroyInstance(socketObject.Meta.gameServerId, parsedMessage.args.instanceId)
                }
                break
            }
            case "removeinstance":{
                // Required Args: {args.instanceId}
                let instance = getInstanceById(socketObject.Meta.gameServerId, parsedMessage.args.instanceId)
                if(instance !== undefined)
                    destroyInstance(socketObject.Meta.gameServerId, parsedMessage.args.instanceId)
            }
        }
    }
    else if(socketObject.Meta.userId !== undefined){
        switch (parsedMessage.message.toLowerCase()) {
            case "joininstance":{
                // Required Args: {args.gameServerId, args.instanceId}
                let gameServerSocket = getSocketObjectByGameServerId(parsedMessage.args.gameServerId)
                if(gameServerSocket !== undefined){
                    userJoinedInstance(parsedMessage.args.gameServerId, parsedMessage.args.instanceId, socketObject).then(canJoin => {
                        if(canJoin){
                            // if we can join, we know the instance exists
                            let instance = getInstanceById(parsedMessage.args.gameServerId, parsedMessage.args.instanceId)
                            let tempUserToken = ID.newTokenPassword(50)
                            gameServerSocket.Socket.send(SocketMessage.craftSocketMessage("tempusertoken", {
                                tempUserToken: tempUserToken,
                                userId: parsedMessage.userId,
                                instanceId: parsedMessage.args.instanceId
                            }))
                            socketObject.Socket.send(SocketMessage.craftSocketMessage("joinedinstance", {
                                Uri: instance.Uri,
                                InstanceProtocol: instance.InstanceProtocol,
                                InstancePublicity: instance.InstancePublicity,
                                gameServerId: instance.GameServerId,
                                instanceId: instance.InstanceId,
                                tempUserToken: tempUserToken,
                                worldId: instance.WorldId,
                                instanceCreatorId: instance.InstanceCreatorId,
                                Moderators: instance.Moderators,
                                BannedUsers: instance.BannedUsers
                            }))
                        }
                        else{
                            socketObject.Socket.send(SocketMessage.craftSocketMessage("failedtojoininstance", {
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
                let instance = getInstanceById(parsedMessage.args.gameServerId, parsedMessage.args.instanceId)
                if(instance !== undefined){
                    removeUserFromInstance(instance, socketObject.Meta.userId)
                    socketObject.Socket.send(SocketMessage.craftSocketMessage("leftinstance", {
                        gameServerId: parsedMessage.args.gameServerId,
                        instanceId: parsedMessage.args.instanceId
                    }))
                }
                else
                    socketObject.Socket.send(SocketMessage.craftSocketMessage("failedtoleaveinstance", {
                        gameServerId: parsedMessage.args.gameServerId,
                        instanceId: parsedMessage.args.instanceId
                    }))
                break
            }
            case "sendinvite":{
                // Required Args: {args.targetUserId, args.gameServerId, args.toInstanceId}
                let targetUserId = parsedMessage.args.targetUserId
                let gameServerId = parsedMessage.args.gameServerId
                let toInstanceId = parsedMessage.args.toInstanceId
                let assetToken = parsedMessage.args.assetToken
                let targetSocket = getSocketObjectByUserId(targetUserId)
                let gameServerSocket = getSocketObjectByGameServerId(gameServerId)
                let instanceMeta = getInstanceById(gameServerId, toInstanceId)
                if(targetSocket !== undefined && gameServerSocket !== undefined && instanceMeta !== undefined){
                    if(ArrayTools.find(instanceMeta.ConnectedUsers, parsedMessage.userId) !== undefined){
                        canUserInvite(instanceMeta, targetUserId, socketObject.Meta.userId).then(isWelcome => {
                            if(isWelcome){
                                instanceMeta.InvitedUsers.push(targetUserId)
                                targetSocket.Socket.send(SocketMessage.craftSocketMessage("gotinvite", {
                                    fromUserId: socketObject.Meta.userId,
                                    toGameServerId: gameServerId,
                                    toInstanceId: toInstanceId,
                                    worldId: instanceMeta.WorldId,
                                    assetToken: assetToken
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
                let targetSocket = getSocketObjectByUserId(targetUserId)
                if(targetSocket !== undefined){
                    targetSocket.Socket.send(SocketMessage.craftSocketMessage("sharedavatartoken", {
                        fromUserId: parsedMessage.userId,
                        targetUserId: parsedMessage.args.targetUserId,
                        avatarId: parsedMessage.args.avatarId,
                        avatarToken: parsedMessage.args.avatarToken
                    }))
                     socketObject.Socket.send(SocketMessage.craftSocketMessage("sharedavatartoken", {
                        fromUserId: parsedMessage.userId,
                        targetUserId: parsedMessage.args.targetUserId,
                        avatarId: parsedMessage.args.avatarId,
                        avatarToken: parsedMessage.args.avatarToken
                    }))
                }
                else
                    socketObject.Socket.send(SocketMessage.craftSocketMessage("failedtoshareavatartoken", {
                        targetUserId: parsedMessage.args.targetUserId,
                        avatarId: parsedMessage.args.avatarId,
                        avatarToken: parsedMessage.args.avatarToken
                    }))
                break
            }
            case "requestnewinstance":{
                createRequestedInstance(parsedMessage.args.worldId, socketObject, parsedMessage.args.instancePublicity, parsedMessage.args.instanceProtocol).then(r => {
                    if(r)
                        socketObject.Socket.send(SocketMessage.craftSocketMessage("createdtemporaryinstance", {}))
                    else
                        socketObject.Socket.send(SocketMessage.craftSocketMessage("failedtocreatetemporaryinstance", {}))
                }).catch(() => socketObject.Socket.send(SocketMessage.craftSocketMessage("failedtocreatetemporaryinstance", {})))
                break
            }
        }
    }
}

let RequestedInstances = []
let Instances = []

function getRequestedInstanceFromId(id){
    for(let i = 0; i < RequestedInstances.length; i++){
        let requestedInstance = RequestedInstances[i]
        if(requestedInstance.TemporaryId === id)
            return requestedInstance
    }
    return undefined
}

function getInstanceById(gameServerId, id){
    for(let i = 0; i < Instances.length; i++){
        let instance = Instances[i]
        if(instance.GameServerId === gameServerId && instance.InstanceId === id)
            return instance
    }
    return undefined
}

function createRequestedInstance(worldId, userSocketObject, instancePublicity, instanceProtocol){
    return new Promise((exec, reject) => {
        Worlds.getWorldMetaById(worldId).then(worldMeta => {
            if(worldMeta){
                if(worldMeta.OwnerId === userSocketObject.Meta.userId || worldMeta.Publicity === Worlds.Publicity.Anyone){
                    let requestedMeta = {
                        TemporaryId: ID.newSafeURLTokenPassword(25),
                        WorldId: worldId,
                        InstancePublicity: exports.InstancePublicity.getInstanceFromNumber(instancePublicity),
                        InstanceProtocol: exports.InstanceProtocol.getProtocolFromNumber(instanceProtocol),
                        InstanceCreatorId: userSocketObject.Meta.userId
                    }
                    while(getRequestedInstanceFromId(requestedMeta.TemporaryId) !== undefined)
                        requestedMeta.TemporaryId = ID.newSafeURLTokenPassword(25)
                    RequestedInstances.push(requestedMeta)
                    broadcastToGameServers(SocketMessage.craftSocketMessage("requestedinstancecreated", {
                        temporaryId: requestedMeta.TemporaryId,
                        instanceProtocol: requestedMeta.InstanceProtocol
                    }))
                    setTimeout(() => {
                        if(getRequestedInstanceFromId(requestedMeta.Id) !== undefined){
                            // give up
                            RequestedInstances = ArrayTools.customFilterArray(RequestedInstances, x => x.TemporaryId !== requestedMeta.TemporaryId)
                            userSocketObject.Socket.send(SocketMessage.craftSocketMessage("failedtocreatetemporaryinstance", {}))
                        }
                    }, 5000)
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

function createInstanceFromRequestedId(socketObject, requestedInstanceId, uri){
    let requestedInstance = getRequestedInstanceFromId(requestedInstanceId)
    if(requestedInstance !== undefined){
        // Check to see if the user is still connected
        let userSocketObject = getSocketObjectByUserId(requestedInstance.InstanceCreatorId)
        if(userSocketObject !== undefined){
            let meta = {
                Readied: false,
                Uri: uri,
                GameServerId: socketObject.Meta.gameServerId,
                TemporaryId: requestedInstance.TemporaryId,
                InstanceId: undefined,
                WorldId: requestedInstance.WorldId,
                InstancePublicity: exports.InstancePublicity.getInstanceFromNumber(requestedInstance.InstancePublicity),
                InstanceProtocol: exports.InstanceProtocol.getProtocolFromNumber(requestedInstance.InstanceProtocol),
                InstanceCreatorId: requestedInstance.InstanceCreatorId,
                InvitedUsers: [],
                BannedUsers: [],
                ConnectedUsers: [requestedInstance.InstanceCreatorId],
                Moderators: [requestedInstance.InstanceCreatorId]
            }
            let id = ID.new(IDTypes.Instance)
            while(getInstanceById(socketObject.Meta.gameServerId, id) !== undefined)
                id = ID.new(IDTypes.Instance)
            meta.InstanceId = id
            RequestedInstances = ArrayTools.customFilterArray(RequestedInstances, x => x.TemporaryId !== requestedInstance.TemporaryId)
            Instances.push(meta)
            socketObject.Socket.send(SocketMessage.craftSocketMessage("selectedgameserver", {
                instanceMeta: meta
            }))
            return true
        }
        RequestedInstances = ArrayTools.customFilterArray(RequestedInstances, x => x.TemporaryId !== requestedInstance.TemporaryId)
        socketObject.send(SocketMessage.craftSocketMessage("notselectedgameserver", {
            temporaryId: requestedInstanceId
        }))
        return false
    }
    socketObject.send(SocketMessage.craftSocketMessage("notselectedgameserver", {
        temporaryId: requestedInstanceId
    }))
    return false
}

function removeUserFromInstance(instance, userid){
    let gameServerSocketObject = getSocketObjectByGameServerId(instance.GameServerId)
    if(gameServerSocketObject !== undefined){
        let count = instance.ConnectedUsers.length
        instance.ConnectedUsers = ArrayTools.filterArray(instance.ConnectedUsers, userid)
        let userSocketObject = getSocketObjectByUserId(userid)
        if(userSocketObject !== undefined){
            userSocketObject.Meta.ConnectedInstances = ArrayTools.customFilterArray(userSocketObject.Meta.ConnectedInstances, x => {
                if(x.gameServerId !== instance.gameServerId)
                    return true
                return x.instanceId !== instance.InstanceId;
            })
        }
        if(count !== instance.ConnectedUsers.length) {
            gameServerSocketObject.Socket.send(SocketMessage.craftSocketMessage("kickeduser", {
                instanceId: instance.InstanceId,
                userId: userid
            }))
            sendInstanceUpdate(gameServerSocketObject, instance)
        }
    }
}

function getAllInstances(gameServerId){
    let instances = []
    for(let i = 0; i < Instances.length; i++){
        let instance = Instances[i]
        if(instance.GameServerId === gameServerId)
            instances.push(instance)
    }
    return instances
}

function sendInstanceUpdate(gameServerSocketObject, instance){
    for (let i = 0; i < instance.ConnectedUsers.length; i++){
        let connectedUserId = instance.ConnectedUsers[i]
        let userMeta = getSocketObjectByUserId(connectedUserId)
        if(userMeta !== undefined){
            userMeta.Socket.send(SocketMessage.craftSocketMessage("updatedinstance", {
                instanceMeta: instance
            }))
        }
    }
    gameServerSocketObject.Socket.send(SocketMessage.craftSocketMessage("updatedinstance", {
        instanceMeta: instance
    }))
}

function destroyInstance(gameServerId, instanceId){
    let instance = getInstanceById(gameServerId, instanceId)
    if(instance !== undefined){
        let dup = ArrayTools.clone(instance.ConnectedUsers)
        for(let i = 0; i < instance.ConnectedUsers.length; i++){
            let connectedUser = dup[i]
            removeUserFromInstance(instance, connectedUser)
        }
    }
    Instances = ArrayTools.customFilterArray(Instances, x => {
        if(x.GameServerId !== gameServerId)
            return true
        return x.InstanceId !== instanceId
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
                Users.getUserDataFromUserId(userIdInviting).then(invitingUser => {
                    if(invitingUser !== undefined)
                        exec(ArrayTools.find(invitingUser.Friends, userIdBeingInvited) !== undefined)
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

function isUserWelcomeInInstance(instance, userId){
    return new Promise((exec, reject) => {
        if(instance.InstanceCreatorId === userId || ArrayTools.find(instance.Moderators, userId)){
            exec(true)
            return
        }
        if(ArrayTools.find(instance.BannedUsers, userId) !== undefined){
            exec(false)
            return
        }
        switch(instance.InstancePublicity){
            case exports.InstancePublicity.ClosedRequest:
            case exports.InstancePublicity.ModeratorRequest:
            case exports.InstancePublicity.OpenRequest:
                if(ArrayTools.find(instance.InvitedUsers, userId) !== undefined || ArrayTools.find(instance.Moderators, userId) || instance.InstanceCreatorId === userId){
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
                let connectedUsersLength = instance.ConnectedUsers.length
                let loopTimes = 0
                let found = false
                for (let i = 0; i < connectedUsersLength; i++){
                    let connectedUserId = instance.ConnectedUsers[i]
                    Users.getUserDataFromUserId(connectedUserId).then(connectedUser => {
                        if(connectedUser !== undefined){
                            if(ArrayTools.find(connectedUser.Friends, userId) !== undefined)
                                found = true
                        }
                        loopTimes++
                    }).catch(() => loopTimes++)
                }
                let aInterval = setInterval(() => {
                    if(loopTimes < connectedUsersLength)
                        return
                    exec(found)
                    clearInterval(aInterval)
                }, 10)
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

function userJoinedInstance(gameServerId, instanceId, userSocketObject){
    return new Promise((exec, reject) => {
        let instance = getInstanceById(gameServerId, instanceId)
        if(instance === undefined){
            exec(false)
            return
        }
        if(ArrayTools.find(instance.ConnectedUsers, userSocketObject.Meta.userId) !== undefined){
            exec(false)
            return
        }
        isUserWelcomeInInstance(instance, userSocketObject.Meta.userId).then(isWelcome => {
            if(isWelcome){
                let gameServerSocketObject = getSocketObjectByGameServerId(gameServerId)
                if(gameServerSocketObject !== undefined){
                    instance.ConnectedUsers.push(userSocketObject.Meta.userId)
                    userSocketObject.Meta.ConnectedInstances.push({gameServerId: gameServerId, instanceId: instanceId})
                    sendInstanceUpdate(gameServerSocketObject, instance)
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

exports.GetSafeInstances = function (user) {
    return new Promise(exec => {
        let instanceLoops = 0
        let is = []
        let l = Instances.length
        let instanceClones = ArrayTools.clone(Instances)
        for(let i = 0; i < l; i++){
            let instance = instanceClones[i]
            let safeinstance = {
                GameServerId: instance.GameServerId,
                InstanceId: instance.InstanceId,
                InstanceCreatorId: instance.InstanceCreatorId,
                InstancePublicity: instance.InstancePublicity,
                InstanceProtocol: instance.InstanceProtocol,
                ConnectedUsers: instance.ConnectedUsers,
                WorldId: instance.WorldId
            }
            isUserWelcomeInInstance(instance, user.Id).then(b => {
                if(b)
                    is.push(safeinstance)
                instanceLoops++
            }).catch(() => instanceLoops++)
        }
        // TODO: This could *probably* be better
        let interval = setInterval(() => {
            if(instanceLoops >= l){
                exec(is)
                clearInterval(interval)
            }
        }, 10)
    })
}

exports.GetPublicInstancesOfWorld = function (worldId) {
    let instances = []
    for (let i = 0; i < Instances.length; i++){
        let instance = Instances[i]
        if(instance.InstancePublicity === exports.InstancePublicity.Anyone && instance.WorldId === worldId){
            let safeinstance = {
                GameServerId: instance.GameServerId,
                InstanceId: instance.InstanceId,
                InstanceCreatorId: instance.InstanceCreatorId,
                InstancePublicity: instance.InstancePublicity,
                InstanceProtocol: instance.InstanceProtocol,
                ConnectedUsers: instance.ConnectedUsers,
                WorldId: instance.WorldId
            }
            instances.push(safeinstance)
        }
    }
    return instances
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