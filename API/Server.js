const express = require('express')
const http = require('http')
const https = require('https')

const Logger = require("../Logging/Logger.js")

const app = express()
let Users

exports.initapp = function (usersModule){
    // TODO: Write some app endpoints when other interfaces are ready
    /*
        Note that other classes should implement functions to interpret API requests
        Pass the request parameter to these functions, and the respective modules should
        implement app extensions themselves
     */
    Users = usersModule

}

exports.createServer = function (port, ssl){
    let server
    if(ssl === null){
        server = http.createServer(app)
        server.listen(port)
    }
    else{
        server = https.createServer(ssl, app)
        if(port !== 443)
            Logger.Warning("Port other than 443 is being used for HTTPS, this may cause issues.")
        server.listen(port)
    }
    return server
}