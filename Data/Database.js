const redis = require('redis')
const Logger = require("../Logging/Logger.js");

let client

function isClientConnected(closeIfConnected){
    if(client === null)
        return false
    else{
        if(client.isOpen())
            if(closeIfConnected){
                Logger.Log("Closed redis client")
                client.disconnect()
                client = null
            }
            else
                return true
        else
            if(closeIfConnected)
                client = null
            else
                return false
    }
}

exports.connect = function (host, port, password, tls) {
    isClientConnected(true)
    let options = {
        host: host,
        port: port
    }
    if(tls !== null)
        options.tls = tls
    client = redis.createClient(options)
    Logger.Log("Opened redis client on " + host + ":" + port)
    return this
}

exports.get = function (key){
    return new Promise(exec => {
        client.get(key, (err, reply) => {
            if(err) throw err
            exec(reply)
        })
    })
}

exports.doesKeyExist = function (key) {
    return new Promise(exec => {
        client.get(key, (err, reply) => {
            if(err) throw err
            exec(reply !== null)
        })
    })
}

exports.set = function(key, value){
    return new Promise(exec => {
        client.set(key, value, (err, reply) => {
            if(err) throw err
            // TODO: What is reply?
            exec(reply)
        })
    })
}

exports.iterateValues = async function (iterateCallback) {
    for await (const key in client.scanIterator()){
        client.get(key, (err, reply) => {
            if(err) return
            iterateCallback(key, reply)
        })
    }
}

exports.isClientOpen = function (){
    return isClientConnected()
}

exports.disconnect = function (){
    isClientConnected(true)
}