const ID = require("./../Data/ID.js")
const Logger = require("./../Logging/Logger.js")
const ArrayTools = require("./../Tools/ArrayTools.js")

let Database
let Users
let ServerConfig
let SearchDatabase

let InviteCodesCollection

exports.init = function (database, users, serverConfig, searchDatabaseModule, inviteCodesCollection) {
    Database = database
    Users = users
    ServerConfig = serverConfig
    SearchDatabase = searchDatabaseModule
    InviteCodesCollection = inviteCodesCollection
    Logger.Log("Initialized InviteCodes!")
}

exports.createInviteCode = function (userid, onetimeuse) {
    return new Promise((exec, reject) => {
        let document = {
            InviteCode: ID.newSafeURLTokenPassword(25),
            FromUserId: userid,
            OneTimeUse: onetimeuse,
            Uses: 0
        }
        exports.validateInviteCode(document.InviteCode, true).then(r => {
            if(r)
                reject(new Error("InviteCode already Exists!"))
            else{
                SearchDatabase.createDocument(InviteCodesCollection, document).then(rr => exec(rr)).catch(err => reject(err))
            }
        }).catch(err => reject(err))
    })
}

exports.validateInviteCode = function (inviteCode, isTest) {
    return new Promise(exec => {
        if(isTest === undefined)
            isTest = false
        if(!ServerConfig.LoadedConfig.SignupRules.RequireInviteCode)
            exec(true)
        else{
            let isGlobalCode = ArrayTools.find(ServerConfig.LoadedConfig.SignupRules.GlobalInviteCodes, inviteCode)
            if(isGlobalCode !== undefined)
                exec(true)
            else{
                SearchDatabase.find(InviteCodesCollection, {"InviteCode": inviteCode}).then(codes => {
                    let found = false
                    for(let i in codes){
                        let code = codes[i]
                        if(code.InviteCode === inviteCode){
                            found = true
                            if(!isTest){
                                if(code.OneTimeUse){
                                    SearchDatabase.removeDocument(InviteCodesCollection, {"InviteCode": inviteCode}).then(r => {
                                        exec(r)
                                    }).catch(() => exec(false))
                                }
                                else{
                                    SearchDatabase.updateDocument(InviteCodesCollection, {"InviteCode": inviteCode}, {$set: {"Uses": code.Uses + 1}}).then(r => {
                                        exec(r)
                                    }).catch(() => exec(false))
                                }
                            }
                            else
                                exec(true)
                        }
                    }
                    if(!found)
                        exec(false)
                }).catch(() => exec(false))
            }
        }
    })
}