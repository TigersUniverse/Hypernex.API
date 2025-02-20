const Logger = require("./../Logging/Logger.js");

const { MongoClient } = require('mongodb')

let client
let isRetrying = false

function connect(){
    return new Promise((exec, reject) => {
        client.connect().then(() => {
            Logger.Log("Connected to SearchDatabase!")
            exec()
        }).catch(err => reject(err))
    })
}

function retryConnect(){
    return new Promise(exec => {
        connect().then(() => exec()).catch(() => {
            setTimeout(() => retryConnect().then(() => exec()), 1000)
        })
    })
}

exports.Init = function (url) {
    return new Promise((exec, reject) => {
        client = new MongoClient(url)
        client.on('error', () => {
            Logger.Log("Reconnecting to MongoDB")
            if(isRetrying) return
            isRetrying = true
            retryConnect().then(() => isRetrying = false)
        })
        connect().then(() => exec(this), err => reject(err))
    })
}

exports.createDatabase = function (databaseName){
    return client.db(databaseName)
}

exports.createCollection = function (database, collectionName) {
    return database.collection(collectionName)
}

exports.createDocument = function (collection, object) {
    return new Promise((exec, reject) => {
        collection.insertOne(object).then(r => {
            exec(r.acknowledged)
        }).catch(err => reject(err))
    })
}

exports.updateDocument = function (collection, id, setQuery) {
    return new Promise((exec, reject) => {
        collection.updateOne(id, setQuery).then(r => exec(r.acknowledged)).catch(err => reject(err))
    })
}

exports.removeDocument = function (collection, query) {
    return new Promise((exec, reject) => {
        collection.deleteOne(query).then(r => {
            exec(r.acknowledged)
        }).catch(err => reject(err))
    })
}

exports.find = function (collection, query = {}) {
    return new Promise( (exec, reject) => {
        collection.find(query).toArray().then(items => exec(items)).catch(err => reject(err))
    })
}

exports.sortfind = function (collection, query = {}, sort = {}) {
    return new Promise( (exec, reject) => {
        collection.find(query).sort(sort).toArray().then(items => exec(items)).catch(err => reject(err))
    })
}