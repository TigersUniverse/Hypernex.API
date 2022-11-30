const Logger = require("./../Logging/Logger.js")
const ArrayTools = require("./../Tools/ArrayTools.js")

let Database
let Users
let ServerConfig

const INVITECODE_KEY = "invitecodes"

exports.init = function (database, users, serverConfig) {
    Database = database
    Users = users
    ServerConfig = serverConfig
    Database.doesKeyExist(INVITECODE_KEY).then(exists => {
        if(!exists)
            Database.set(INVITECODE_KEY, {
                Users: []
            })
    })
    Logger.Log("Initialized InviteCodes!")
}

exports.initUser = function (userid) {
    return new Promise((exec, reject) => {
        let inviteCodeData = {
            Id: userid,
            InviteCodes: []
        }
        Database.get(INVITECODE_KEY).then(invitecodes => {
            if(invitecodes){
                let nic = invitecodes
                nic.Users.push(inviteCodeData)
                Database.set(INVITECODE_KEY, nic).then(r => {
                    if(r)
                        exec(true)
                    else
                        exec(false)
                }).catch(err => {
                    Logger.Error("Failed to save InviteCodeData for reason " + err)
                    reject(err)
                })
            }
        }).catch(err => {
            Logger.Error("Failed to get InviteCodeData for reason " + err)
            reject(eerr)
        })
    })
}

exports.getInviteCodeData = function (userid) {
    return new Promise(exec => {
        Database.get(INVITECODE_KEY).then(inviteCodes => {
            if(inviteCodes){
                let inviteCodeData = ArrayTools.customFind(inviteCodes.Users, item => item.Id === userid)
                if(inviteCodeData)
                    exec(inviteCodes.Users[inviteCodeData])
                else
                    exec(undefined)
            }
            else
                exec(undefined)
        }).catch(err => {
            Logger.Error("Failed to get InviteCodeData for reason " + err)
            exec(undefined)
        })
    })
}

function setInviteCodeData(inviteCodes, inviteCodeData){
    return new Promise((exec, reject) => {
        let i = ArrayTools.customFind(inviteCodes.Users, item => item.Id === inviteCodeData.Id)
        if(inviteCodeData)
            inviteCodes.Users[i] = inviteCodeData
        Database.set(INVITECODE_KEY, inviteCodes).then(r => {
            if(r)
                exec(true)
            else
                exec(false)
        }).catch(err => {
            Logger.Error("Failed to save InviteCodeData for reason " + err)
            reject(err)
        })
    })
}

exports.pushInviteCodeToUserId = function (userid, invitecode) {
    return new Promise(exec => {
        Database.get(INVITECODE_KEY).then(invitecodes => {
            if(invitecodes){
                let i = ArrayTools.customFind(invitecodes.Users, item => item.Id === userid)
                if(i){
                    let inviteCodeData = invitecodes.Users[i]
                    inviteCodeData.InviteCodes.push(invitecode)
                    setInviteCodeData(invitecodes, inviteCodeData).then(r => {
                        if(r)
                            exec(true)
                        else
                            exec(false)
                    }).catch(() => exec(false))
                }
                else
                    exec(false)
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

exports.removeInviteCodeFromUserId = function (userid, invitecode) {
    return new Promise(exec => {
        Database.get(INVITECODE_KEY).then(invitecodes => {
            if(invitecodes){
                let i = ArrayTools.customFind(invitecodes.Users, item => item.Id === userid)
                if(i){
                    let inviteCodeData = invitecodes.Users[i]
                    inviteCodeData.InviteCodes = ArrayTools.filterArray(inviteCodeData.InviteCodes, invitecode)
                    setInviteCodeData(invitecodes, inviteCodeData).then(r => {
                        if(r)
                            exec(true)
                        else
                            exec(false)
                    }).catch(() => exec(false))
                }
                else
                    exec(false)
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

exports.validateInviteCode = function (inviteCode, removeOnUsed) {
    return new Promise(exec => {
        if(!ServerConfig.LoadedConfig.SignupRules.RequireInviteCode)
            exec(true)
        else{
            let isGlobalCode = ArrayTools.find(ServerConfig.LoadedConfig.SignupRules.GlobalInviteCodes, inviteCode)
            if(isGlobalCode !== undefined)
                exec(true)
            else{
                Database.get(INVITECODE_KEY).then(invitecodes => {
                    if(invitecodes){
                        if(invitecodes.Users.length <= 0)
                            exec(false)
                        else
                            for(let x = 0; x < invitecodes.Users.length; x++){
                                let user = invitecodes.Users[x]
                                if(user.InviteCodes.length >= 0)
                                    exec(false)
                                else{
                                    let y = ArrayTools.find(user.InviteCodes, inviteCode)
                                    if(y !== undefined){
                                        let code = user.InviteCodes[y]
                                        if(removeOnUsed){
                                            exports.removeInviteCodeFromUserId(user.Id, code).then(r => {
                                                if(r)
                                                    exec(true)
                                                else
                                                    exec(false)
                                            }).catch(() => exec(false))
                                        }
                                        else
                                            exec(true)
                                    }
                                    else
                                        exec(false)
                                }
                            }
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
        }
    })
}