const url = require("url")

const Logger = require("../Logging/Logger.js")

let ServerConfig

exports.Init = function (serverConfig){
    ServerConfig = serverConfig
    Logger.Log("Initialized URL!")
    return this
}

exports.isURLAllowed = function (rawURL, onlyLocal){
    if(onlyLocal === undefined)
        onlyLocal = false
    try{
        let urlObject = url.parse(rawURL, true)
        let allowed = ServerConfig.LoadedConfig.TrustAllDomains
        for(let i = 0; i < ServerConfig.LoadedConfig.AllowedDomains.length; i++){
            let allowedHost = ServerConfig.LoadedConfig.AllowedDomains[i]
            if(urlObject.host.toLowerCase() === allowedHost.toLowerCase())
                allowed = !onlyLocal && true
        }
        if(urlObject.host.toLowerCase() === url.parse(ServerConfig.LoadedConfig.BaseURL).host.toLowerCase())
            allowed = true
        return allowed
    }
    catch (e){
        Logger.Error("Failed to Validate URL for reason " + e)
        return false
    }
}