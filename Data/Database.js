const redis = require('redis')

const Logger = require("./../Logging/Logger.js");
let client

let isReady = false

function isClientConnected(closeIfConnected){
    if(client === undefined)
        return false
    else{
        if(isReady){
            if(closeIfConnected){
                Logger.Log("Closed redis client")
                client.disconnect()
                client = undefined
                return false
            }
            return true
        }
        else
            if(closeIfConnected)
                client = undefined
            else
                return false
    }
}

function c(options){
    client = redis.createClient(options)
}

exports.connect = function (database, host, port, username, password, tls) {
    return new Promise(exec => {
        isClientConnected(true)
        let options = {
            socket:{
                host: host,
                port: port
            },
            username: username,
            password: password,
            database: database
        }
        if(tls !== undefined)
            options.socket.tls = tls
        c(options)
        client.on('ready', () => {
            isReady = true
            Logger.Log("Opened redis client on " + host + ":" + port)
            exec(this)
        })
        client.on('end', () => isReady = false)
        client.on('error', () => {
            Logger.Log("Redis client closed unexpectedly!")
        })
        client.connect()
    })
}

exports.get = function (key){
    return new Promise((exec, reject) => {
        client.get(key).then(reply => {
            exec(JSON.parse(reply))
        }).catch(err => reject(err))
    })
}

exports.doesKeyExist = function (key) {
    return new Promise(exec => {
        exports.get(key).then(reply => {
            exec(reply !== undefined && reply !== null)
        }).catch(() => exec(undefined))
    })
}

exports.set = function(key, value){
    return new Promise((exec, reject) => {
        client.set(key, JSON.stringify(value)).then(reply => {
            exec(reply)
        }).catch(err => reject(err))
    })
}

exports.delete = function (key) {
    return new Promise((exec, reject) => {
        client.del(key).then(reply => {
            exec(!!reply)
        }).catch(err => reject(err))
    })
}

exports.isClientOpen = function (){
    return isClientConnected()
}

exports.disconnect = function (){
    isClientConnected(true)
}