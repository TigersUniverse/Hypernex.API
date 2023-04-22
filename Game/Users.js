const bcrypt = require("bcrypt")
const date = require("date-and-time")

const ID = require("./../Data/ID.js")
const InviteCodes = require("./../Data/InviteCodes.js")
const FileUploading = require("./../Data/FileUploading.js")
const Logger = require("./../Logging/Logger.js")
const GenericToken = require("./../Security/GenericToken.js")
const Emailing = require("./../Data/Emailing.js")
const DateTools = require("./../Tools/DateTools.js")
const ArrayTools = require("./../Tools/ArrayTools.js")
const PronounTools = require("./../Tools/PronounTools.js")

let Database
let OTP
let URLTools
let SocketServer
let SearchDatabase

let UsersCollection

const USERDATA_DATABASE_PREFIX = "user/"

const MAX_DISPLAYNAME_LENGTH = 20
const MAX_DESCRIPTION_LENGTH = 1000
const ONLINE_TIMEFRAME = 300


let serverConfig

exports.init = function (ServerConfig, databaseModule, otpModule, urlToolsModule, searchDatabaseModule, usersCollection){
    serverConfig = ServerConfig
    Database = databaseModule
    OTP = otpModule
    URLTools = urlToolsModule
    SearchDatabase = searchDatabaseModule
    UsersCollection = usersCollection
    Logger.Log("Initialized Users!")
    return this
}

exports.SetSocketServer = function (socketServerModule){
    SocketServer = socketServerModule
}

function createUserData(id, username, hashedPassword, email){
    return {
        Id: id,
        Username: username,
        HashedPassword: hashedPassword,
        Email: email,
        isEmailVerified: false,
        emailVerificationToken: "",
        passwordResetToken: "",
        AccountTokens: [GenericToken.createToken("account-create")],
        is2FAVerified: false,
        TwoFA: undefined,
        BlockedUsers: [],
        Following: [],
        Followers: [],
        OutgoingFriendRequests: [],
        FriendRequests: [],
        Friends: [],
        Badges: [],
        Bio: {
            isPrivateAccount: false,
            /*
                Status should be Online by default, setting Offline is for invisible
                The WebSocket should handle Offline/invisibility
             */
            Status: exports.Status.Online,
            StatusText: "",
            Description: "",
            PfpURL: "",
            BannerURL: "",
            DisplayName: "",
            Pronouns: undefined
        },
        Rank: exports.Rank.Incompleter,
        AccountCreationDate: DateTools.getUnixTime(new Date()),
        BanStatus: {
            isBanned: false,
            BanBegin: 0,
            BanEnd: 0,
            BanReason: "",
            BanDescription: ""
        },
        BanCount: 0,
        WarnStatus: {
            isWarned: false,
            TimeWarned: 0,
            WarnReason: "",
            WarnDescription: ""
        },
        WarnCount: 0,
        Avatars: [],
        Worlds: []
    }
}

exports.censorUser = function (userdata){
    let d = {
        Id: userdata.Id,
        Username: userdata.Username,
        Badges: userdata.Badges,
        Bio: {
            Status: exports.Status.Offline,
            StatusText: userdata.Bio.StatusText,
            Description: userdata.Bio.Description,
            PfpURL: userdata.Bio.PfpURL,
            BannerURL: userdata.Bio.BannerURL,
            DisplayName: userdata.Bio.DisplayName,
            Pronouns: userdata.Bio.Pronouns
        },
        Rank: userdata.Rank
    }
    if(SocketServer.isUserIdConnected(userdata.Id))
        d.Bio.Status = userdata.Bio.Status
    if(!userdata.Bio.isPrivateAccount){
        d.Following = userdata.Following
        d.Followers = userdata.Followers
    }
    return d
}

exports.getPrivateUserData = function (userdata){
    // In scenarios where we store private user data that only the Server should see, this is what we return
    userdata.HashedPassword = undefined
    userdata.emailVerificationKey = undefined
    userdata.passwordResetKey = undefined
    userdata.TwoFA = undefined
    return userdata
}

exports.HashRounds = 10

function hashPassword(password){
    return new Promise((exec, reject) => {
        bcrypt.genSalt(exports.HashRounds, function (err, salt) {
            if(err) reject(err)
            bcrypt.hash(password, salt, function (herr, hash) {
                if(herr) reject(herr)
                exec(hash)
            })
        })
    })
}

const ACCEPTABLE_CHARACTERS_IN_USERNAME = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p",
                                            "q", "r", "s", "t", "u", "v", "w", "x", "y", "x", "A", "B", "C", "D", "E", "F",
                                            "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V",
                                            "W", "X", "Y", "Z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]

function isValidUsername(username){
    if(username.length < 3 || username.length > 20)
        return false
    let _s = 0
    for(let i = 0; i < username.length; i++){
        let letter = username[i]
        let ii = ArrayTools.find(ACCEPTABLE_CHARACTERS_IN_USERNAME, letter)
        if(ii === undefined){
            if(letter === "_" && _s < 1)
                _s++
            else
                return false
        }
    }
    return true
}

function isValidPassword(password){
    if(password.length < 8)
        return false
    let caps = 0
    for(let i = 0; i < password.length; i++){
        let f = ArrayTools.find(PASSWORD_CAPS, password[i])
        if(f !== undefined)
            caps++
    }
    if(caps < 2)
        return false
    let lower = 0
    for(let i = 0; i < password.length; i++){
        let f = ArrayTools.find(PASSWORD_LOWER, password[i])
        if(f !== undefined)
            lower++
    }
    if(lower < 2)
        return false
    let nums = 0
    for(let i = 0; i < password.length; i++){
        let f = ArrayTools.find(PASSWORD_NUM, password[i])
        if(f !== undefined)
            nums++
    }
    if(nums < 2)
        return false
    let special = 0
    for(let i = 0; i < password.length; i++){
        let f = ArrayTools.find(PASSWORD_CAPS, password[i])
        let ff = ArrayTools.find(PASSWORD_LOWER, password[i])
        let fff = ArrayTools.find(PASSWORD_NUM, password[i])
        if(f === undefined && ff === undefined && fff === undefined)
            special++
    }
    if(special < 2)
        return false
    return true
}

const PASSWORD_CAPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S",
                       "T", "U", "V", "W", "X", "Y", "Z"]

const PASSWORD_LOWER = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p",
                        "q", "r", "s", "t", "u", "v", "w", "x", "y", "x"]

const PASSWORD_NUM = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]

exports.createUser = function (username, password, email, inviteCode) {
    return new Promise((exec, reject) => {
        exports.isEmailRegistered(email.toLowerCase()).then(emailRegistered => {
            if(!emailRegistered){
                if(Emailing.isValidEmail(email)){
                    exports.isUsernameRegistered(username.toLowerCase()).then(usernameRegistered => {
                        if(!usernameRegistered){
                            if(isValidUsername(username) && isValidPassword(password)){
                                let id = ID.new(ID.IDTypes.User)
                                // TODO: Check if ID exists
                                Database.doesKeyExist(USERDATA_DATABASE_PREFIX + id).then(exists => {
                                    if(!exists){
                                        InviteCodes.validateInviteCode(inviteCode).then(allow => {
                                            if(allow){
                                                hashPassword(password).then(hashedPassword => {
                                                    let userdata = createUserData(id, username, hashedPassword, email)
                                                    Database.set(USERDATA_DATABASE_PREFIX + id, userdata).then(reply => {
                                                        if(!reply)
                                                            reject(new Error("Failed to save user " + username + " to database!"))
                                                        else{
                                                            FileUploading.initUser(id).then(r => {
                                                                if(r)
                                                                    SearchDatabase.createDocument(UsersCollection, {
                                                                        Id: userdata.Id,
                                                                        Username: userdata.Username,
                                                                        Email: userdata.Email
                                                                    }).then(sdr => {
                                                                        if(!sdr)
                                                                            reject(new Error("Failed to create SearchData for unknown reason"))
                                                                        else
                                                                            exec(userdata)
                                                                    }).catch(err => reject(err))
                                                                else
                                                                    reject(new Error("Failed to create FileUploading data for unknown reason"))
                                                            })
                                                        }
                                                    }).catch(err => {
                                                        Logger.Error("Failed to create user " + username + " for reason " + err)
                                                        reject(err)
                                                    })
                                                }).catch(err => {
                                                    Logger.Error("Failed to create user " + username + " for reason " + err)
                                                    reject(err)
                                                })
                                            }
                                            else{
                                                Logger.Error("Cannot create user " + username + " because they provided an invalid inviteCode!")
                                                reject(new Error("Invalid Invite Code"))
                                            }
                                        }).catch(err => {
                                            Logger.Error("Unknown error when validating invite code for user " + username + " with error " + err)
                                            reject(err)
                                        })
                                    }
                                    else
                                        reject(new Error("The rarest error ever"))
                                }).catch(err => {
                                    Logger.Error("Failed to check for existing Id")
                                    reject(err)
                                })
                            }
                            else{
                                Logger.Error("Cannot create user " + username + " because the username or password is invalid!")
                                reject(new Error("Username or Password is invalid"))
                            }
                        }
                        else{
                            Logger.Error("Cannot create user " + username + " because the username " + username + " is already registered!")
                            reject(new Error("Username already registered"))
                        }
                    })
                }
                else{
                    Logger.Error("Cannot create user " + username + " because the email " + email + " is invalid!")
                    reject(new Error("Invalid Email"))
                }
            }
            else{
                Logger.Error("Cannot create user " + username + " because the email " + email + " is already registered!")
                reject(new Error("Email already registered"))
            }
        })
    })
}

exports.doesUserExist = function (userid) {
    return new Promise((exec, reject) => {
        Database.doesKeyExist(USERDATA_DATABASE_PREFIX + userid).then(r => {
            exec(r)
        }).catch(err => {
            Logger.Error("Failed to check if userid " + userid + " exists!")
            reject(err)
        })
    })
}

// Safe for All
exports.getUserData = function (userid) {
    return new Promise((exec, reject) => {
        exports.doesUserExist(userid).then(r => {
            if(r){
                Database.get(USERDATA_DATABASE_PREFIX + userid).then(userdata => {
                    if(userdata)
                        exec(exports.censorUser(userdata))
                    else
                        reject(new Error("userdata for userid " + userid + " was undefined!"))
                })
            }
            else
                reject(new Error("User " + userid + " does not exist!"))
        }).catch(err => {
            reject(new Error("Could not check if userid " + userid + " exists!"))
        })
    })
}

function setUserData(userdata){
    return new Promise((exec, reject) => {
        exports.doesUserExist(userdata.Id).then(r => {
            if(r){
                Database.set(USERDATA_DATABASE_PREFIX + userdata.Id, userdata).then(rr => {
                    exec(rr)
                }).catch(uerr => {
                    Logger.Error("Failed to update userdata for " + userdata.Id + " for reason " + uerr)
                    reject(uerr)
                })
            }
            else{
                reject(new Error("User " + userdata.Id + " does not exist!"))
            }
        }).catch(derr => {
            Logger.Error("Failed to check for user " + userdata.Id + " for reason " + derr)
            reject(derr)
        })
    })
}

// Used to get client userdata for authorized clients
exports.getPrivateClientUserData = function (username, tokenContent) {
    return new Promise(exec => {
        exports.isUserTokenValid(username, tokenContent).then(tokenValid => {
            if(tokenValid){
                exports.getUserDataFromUsername(username).then(userdata => {
                    if(userdata){
                        let pcud = exports.getPrivateUserData(userdata)
                        exec(pcud)
                    }
                    else
                        exec(undefined)
                })
            }
            else
                exec(undefined)
        }).catch(err => {
            exec(undefined)
        })
    })
}

// This should only be used by the server, never shared to a client!
exports.getUserDataFromUserId = function (userid) {
    return new Promise((exec, reject) => {
        exports.doesUserExist(userid).then(userExists => {
            if(userExists){
                Database.get(USERDATA_DATABASE_PREFIX + userid).then(userdata => {
                    if(userdata)
                        exec(userdata)
                    else
                        reject(new Error("userdata for userid " + userid + " was undefined!"))
                }).catch(err => reject(err))
            }
            else
                reject(new Error("User does not exist!"))
        }).catch(err => reject(err))
    })
}

// This should only be used by the server, never shared to a client!
exports.getUserDataFromUsername = function (username) {
    return new Promise((exec, reject) => {
        SearchDatabase.find(UsersCollection, {"Username": username}).then(users => {
            let found = false
            for(let i in users){
                let user = users[i]
                if(user.Username.toLowerCase() === username.toLowerCase()){
                    found = true
                    let userid = user.Id
                    exports.getUserDataFromUserId(userid).then(u => {
                        if(u)
                            exec(u)
                        else
                            reject(new Error("Failed to find userid of " + userid))
                    }).catch(err => reject(err))
                }
            }
            if(!found)
                reject(new Error("Failed to find User with a Username of " + username))
        }).catch(err => reject(err))
    })
}

exports.isUsernameRegistered = function (username) {
    return new Promise(exec => {
        exports.getUserDataFromUsername(username.toLowerCase()).then(r => exec(true)).catch(err => exec(false))
    })
}

// This should only be used by the server, never shared to a client!
exports.getUserDataFromEmail = function (email) {
    return new Promise((exec, reject) => {
        SearchDatabase.find(UsersCollection, {"Email": email}).then(users => {
            let found = false
            for(let i in users){
                let user = users[i]
                if(user.Username.toLowerCase() === email.toLowerCase()){
                    found = true
                    let userid = user.Id
                    exports.getUserDataFromUserId(userid).then(u => {
                        if(u)
                            exec(u)
                        else
                            reject(new Error("Failed to find userid of " + userid))
                    }).catch(err => reject(err))
                }
            }
            if(!found)
                reject(new Error("Failed to find User with an Email of " + email))
        }).catch(err => reject(err))
    })
}

exports.isEmailRegistered = function (email) {
    return new Promise(exec => {
        exports.getUserDataFromEmail(email.toLowerCase()).then(r => exec(true)).catch(err => exec(false))
    })
}

exports.safeSearchUsername = function (username) {
    return new Promise((exec, reject) => {
        SearchDatabase.find(UsersCollection, {"Username": {$regex: `.*${username}.*`, $options: 'i'}}).then(users => {
            let candidates = []
            for(let i in users){
                let user = users[i]
                candidates.push(user.Id)
            }
            exec(candidates)
        }).catch(err => reject(err))
    })
}

exports.isPasswordCorrect = function (username, password){
    return new Promise((exec, reject) => {
        exports.getUserDataFromUsername(username).then(userdata => {
            if(userdata){
                let hashedPassword = userdata.HashedPassword
                bcrypt.compare(password, hashedPassword, function (err, result) {
                    if(err) reject(err)
                    exec(result)
                })
            }
            else
                exec(false)
        }).catch(err => {
            // Account probably doesn't exist
            exec(false)
        })
    })
}

exports.isUserIdTokenValid = function (userid, tokenContent) {
    return new Promise((exec, reject) => {
        exports.getUserDataFromUserId(userid).then(userdata => {
            let v = false
            let NewTokens = userdata.AccountTokens
            for (let tokenIndex = 0; tokenIndex < userdata.AccountTokens.length; tokenIndex++){
                let token = userdata.AccountTokens[tokenIndex]
                if(!GenericToken.isTokenValid(token) || (userdata.WarnStatus.isWarned || userdata.BanStatus.isBanned)){
                    NewTokens = ArrayTools.customFilterArray(userdata.AccountTokens,
                        item => item.content !== token.content)
                }
                else{
                    // Token is valid, check for same content
                    if(tokenContent === token.content){
                        v = true
                    }
                }
            }
            if(userdata.AccountTokens.length !== NewTokens.length){
                let nud = userdata
                nud.AccountTokens = NewTokens
                setUserData(nud).then(() => exec(v))
            }
            else
                exec(v)
        }).catch(err => reject(err))
    })
}

exports.isUserTokenValid = function (username, tokenContent) {
    // Because this sets userdata, we should grab a record from the server
    return new Promise((exec, reject) => {
        exports.getUserDataFromUsername(username).then(userdata => {
            if(userdata){
                let v = false
                let NewTokens = userdata.AccountTokens
                for (let tokenIndex = 0; tokenIndex < userdata.AccountTokens.length; tokenIndex++){
                    let token = userdata.AccountTokens[tokenIndex]
                    if(!GenericToken.isTokenValid(token) || (userdata.WarnStatus.isWarned || userdata.BanStatus.isBanned)){
                        NewTokens = ArrayTools.customFilterArray(userdata.AccountTokens,
                            item => item.content !== token.content)
                    }
                    else{
                        // Token is valid, check for same content
                        if(tokenContent === token.content){
                            v = true
                        }
                    }
                }
                if(userdata.AccountTokens.length !== NewTokens.length){
                    let nud = userdata
                    nud.AccountTokens = NewTokens
                    setUserData(nud).then(() => exec(v))
                }
                else
                    exec(v)
            }
            else
                reject(new Error("Failed to get UserData for Username " + username))
        }).catch(err => {
            // Probably just couldn't find the user, bugged client?
            exec(false)
        })
    })
}

exports.invalidateToken = function (userid, tokenContent) {
    return new Promise((exec, reject) => {
        exports.getUserDataFromUserId(userid).then(userdata => {
            if(userdata){
                let v = false
                let NewTokens = userdata.AccountTokens
                for (let tokenIndex = 0; tokenIndex < userdata.AccountTokens.length; tokenIndex++){
                    let token = userdata.AccountTokens[tokenIndex]
                    if(token.content === tokenContent){
                        NewTokens = ArrayTools.customFilterArray(userdata.AccountTokens,
                            item => item.content !== token.content)
                        v = true
                    }
                }
                if(userdata.AccountTokens.length !== NewTokens.length){
                    let nud = userdata
                    nud.AccountTokens = NewTokens
                    setUserData(nud).then(() => exec(v))
                }
                else
                    exec(v)
            }
            else
                reject(new Error("Failed to get UserData for Username " + username))
        }).catch(err => {
            // Probably just couldn't find the user, bugged client?
            exec(false)
        })
    })
}

// This is where functions that require a token go

/*
 * Returns a status code based on result
 * 0: Wrong Password
 * 1: Correct Password, but no 2FA provided, redo with 2FA
 * 2: Banned
 * 3: Warned
 * 4: Correct Password
 */
exports.Login = function (app, username, password, twofacode){
    return new Promise(exec => {
        exports.isPasswordCorrect(username, password).then(correct => {
            if(correct){
                exports.getUserDataFromUsername(username).then(userdata => {
                    let bane
                    if(userdata.BanStatus.isBanned){
                        bane = userdata.BanStatus.BanEnd
                    }
                    if((bane && DateTools.getUnixTime(new Date()) > bane) || !bane){
                        // remove ban
                        userdata.BanStatus.isBanned = false
                        if(!userdata.is2FAVerified){
                            // No 2FA, continue login
                            let token = GenericToken.createToken(app)
                            // Add token to userdata and save
                            userdata.AccountTokens.push(token)
                            if(userdata.WarnStatus.isWarned){
                                // Mark the warning as read, and let the client know they were warned
                                userdata.WarnStatus.isWarned = false
                                setUserData(userdata).then(r => {
                                    if(r){
                                        let tud = userdata
                                        tud.WarnStatus.isWarned = true
                                        exec({result: exports.LoginResult.Warned, token: token, status: tud.WarnStatus})
                                    }
                                    else
                                        exec({result: -1})
                                }).catch(() => exec({result: -1}))
                            }
                            else
                                setUserData(userdata).then(r => {
                                    if(r)
                                        exec({result: exports.LoginResult.Correct, token: token})
                                    else
                                        exec({result: -1})
                                }).catch(() => exec({result: -1}))
                        }
                        else{
                            if(twofacode === undefined || twofacode === "")
                                exec({result: exports.LoginResult.Missing2FA})
                            else if(OTP.verify2faOPT(userdata, twofacode)){
                                let token = GenericToken.createToken(app)
                                // Add token to userdata and save
                                userdata.AccountTokens.push(token)
                                if(userdata.WarnStatus.isWarned){
                                    // Mark the warning as read, and let the client know they were warned
                                    userdata.WarnStatus.isWarned = false
                                    setUserData(userdata).then(r => {
                                        if(r){
                                            let tud = userdata
                                            tud.WarnStatus.isWarned = true
                                            exec({result: exports.LoginResult.Warned, token: token, status: tud.WarnStatus})
                                        }
                                        else
                                            exec({result: -1})
                                    }).catch(() => exec({result: -1}))
                                }
                                else
                                    setUserData(userdata).then(r => {
                                        if(r)
                                            exec({result: exports.LoginResult.Correct, token: token})
                                        else
                                            exec({result: -1})
                                    }).catch(() => exec({result: -1}))
                            }
                            else
                                exec({result: exports.LoginResult.Incorrect})
                        }
                    }
                    else
                        exec({result: exports.LoginResult.Banned, status: userdata.BanStatus})
                }).catch(uerr => {
                    exec({result: -1})
                })
            }
            else
                exec({result: -1})
        }).catch(perr => {
            exec({result: -1})
        })
    })
}

exports.sendVerifyEmail = function (userid, tokenContent) {
    return new Promise(exec => {
        exports.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUserId(userid).then(userdata => {
                    if(userdata){
                        if(!userdata.isEmailVerified){
                            Emailing.sendVerificationEmailToUser(userdata).then(t => {
                                if(t){
                                    let nud = userdata
                                    nud.emailVerificationToken = t
                                    setUserData(nud).then(r => {
                                        if(r)
                                            exec(true)
                                        else
                                            exec(false)
                                    }).catch(() => exec(false))
                                }
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
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

exports.verifyEmailToken = function (userid, tokenContent, emailToken) {
    return new Promise(exec => {
        exports.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUserId(userid).then(userdata => {
                    if(userdata){
                        if(!userdata.isEmailVerified && userdata.emailVerificationToken !== "" &&
                            userdata.emailVerificationToken === emailToken){
                            let nud = userdata
                            nud.isEmailVerified = true
                            nud.emailVerificationToken = ""
                            if(userdata.Rank === exports.Rank.Incompleter)
                                nud.Rank = exports.Rank.Registered
                            setUserData(nud).then(r => {
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
            }
            else
                exec(false)
        })
    })
}

exports.changeEmail = function (userid, tokenContent, newEmail) {
    return new Promise((exec, reject) => {
        exports.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUserId(userid).then(userdata => {
                    if(userdata){
                        if(Emailing.isValidEmail(newEmail)){
                            exports.isEmailRegistered(newEmail).then(r => {
                                if(r)
                                    reject(new Error("Email already used!"))
                                else{
                                    SearchDatabase.updateDocument(UsersCollection, {"Id": userdata.Id}, {$set: {"Email": newEmail}}).then(rr => {
                                        if(rr){
                                            let nud = userdata
                                            nud.isEmailVerified = false
                                            nud.emailVerificationToken = ""
                                            nud.Email = newEmail
                                            if(nud.Rank < exports.Rank.Verified)
                                                nud.Rank = exports.Rank.Incompleter
                                            setUserData(nud).then(rr => {
                                                if(rr)
                                                    exec(true)
                                                else
                                                    exec(false)
                                            }).catch(err => reject(err))
                                        }
                                        else
                                            reject(new Error("Failed to update in SearchDatabase"))
                                    }).catch(err => reject(err))
                                }
                            })
                        }
                        else
                            reject(new Error("Invalid Email"))
                    }
                    else
                        reject(new Error("Failed to get user from username"))
                }).catch(err => reject(err))
            }
            else
                reject(new Error("Invalid Token"))
        }).catch(err => reject(err))
    })
}

// Returns the otpauth_url for the client to verify
exports.enable2fa = function (userid, tokenContent) {
    return new Promise((exec, reject) => {
        exports.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUserId(userid).then(userdata => {
                    if(userdata){
                        if(!userdata.is2FAVerified){
                            let nud = userdata
                            let t = OTP.create2faOTP(userdata)
                            nud.TwoFA = t
                            setUserData(nud).then(r => {
                                if(r)
                                    exec(t.otpauth_url)
                                else
                                    reject(new Error("Failed to create 2FA"))
                            }).catch(err => reject(err))
                        }
                        else
                            reject(new Error("2FA already verified!"))
                    }
                    else
                        reject(new Error("Failed to get user from username"))
                }).catch(err => reject(err))
            }
            else
                reject(new Error("Invalid Token"))
        }).catch(err => reject(err))
    })
}

exports.verify2fa = function (userid, tokenContent, code) {
    return new Promise(exec => {
        exports.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUserId(userid).then(userdata => {
                    if(userdata){
                        if(OTP.verify2faOPT(userdata, code)){
                            if(!userdata.is2FAVerified){
                                let nud = userdata
                                nud.is2FAVerified = true
                                setUserData(nud).then(r => {
                                    exec(true)
                                }).catch(() => exec(false))
                            }
                            else
                                exec(true)
                        }
                        else
                            exec(false)
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
        }).catch(() => exec(false))
    })
}

exports.remove2fa = function (userid, tokenContent) {
    return new Promise(exec => {
        exports.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUserId(userid).then(userdata => {
                    if(userdata){
                        let nud = userdata
                        nud.is2FAVerified = false
                        nud.TwoFA = undefined
                        setUserData(nud).then(r => {
                            if(r)
                                exec(true)
                        }).catch(() => exec(false))
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

exports.requestPasswordReset = function (email) {
    return new Promise(exec => {
        exports.getUserDataFromEmail(email).then(userdata => {
            if(userdata){
                let resetPasswordToken = ID.newSafeURLTokenPassword(50)
                let nud = userdata
                nud.passwordResetToken = resetPasswordToken
                Emailing.sendPasswordResetEmail(userdata, resetPasswordToken).then(r => {
                    if(r){
                        setUserData(nud).then(rr => {
                            if(rr)
                                exec(r)
                            else
                                exec(false)
                        }).catch(() => exec(false))
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

exports.resetPassword = function (userid, passwordResetContent, newPassword) {
    return new Promise(exec => {
        exports.getUserDataFromUserId(userid).then(userdata => {
            if(userdata){
                if(userdata.passwordResetToken !== undefined && userdata.passwordResetToken !== "" &&
                    userdata.passwordResetToken === passwordResetContent){
                    let nud = userdata
                    hashPassword(newPassword).then(hash => {
                        nud.HashedPassword = hash
                        nud.AccountTokens = []
                        nud.passwordResetToken = ""
                        setUserData(nud).then(r => {
                            if(r)
                                exec(true)
                            else
                                exec(false)
                        }).catch(() => exec(false))
                    }).catch(() => exec(false))
                }
                else
                    exec(false)
            }
            else
                exec(false)
        })
    })
}

exports.resetPasswordWithUserToken = function (userid, tokenContent, newPassword) {
    return new Promise(exec => {
        exports.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUserId(userid).then(userdata => {
                    let nud = userdata
                    hashPassword(newPassword).then(hash => {
                        nud.HashedPassword = hash
                        nud.AccountTokens = []
                        setUserData(nud).then(r => {
                            if(r)
                                exec(true)
                            else
                                exec(false)
                        }).catch(() => exec(false))
                    }).catch(() => exec(false))
                }).catch(() => exec(false))
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

function isValidBio(bio){
    try{
        let pav = false
        if(bio.isPrivateAccount === true || bio.isPrivateAccount === false)
            pav = true
        let statusValid = false
        // User can set Invisible, but not Offline
        if(bio.Status >= 1 && bio.Status <= 6)
            statusValid = true
        let statusTextValid = false
        if(typeof bio.StatusText === 'string' || bio.StatusText instanceof String)
            statusTextValid = true
        let descriptionValid = false
        if(typeof bio.Description === 'string' || bio.Description instanceof String)
            if(bio.Description.length <= MAX_DESCRIPTION_LENGTH)
                descriptionValid = true
        let pfpURLValid = false
        if(bio.PfpURL !== undefined && bio.PfpURL !== null && bio.PfpURL !== ""){
            if((typeof bio.PfpURL === 'string' || bio.PfpURL instanceof String) && URLTools.isURLAllowed(bio.PfpURL))
                pfpURLValid = true
        }
        else
            pfpURLValid = true
        let bannerURLValid = false
        if(bio.BannerURL !== undefined && bio.BannerURL !== null && bio.BannerURL !== ""){
            if((typeof bio.BannerURL === 'string' || bio.BannerURL instanceof String) && URLTools.isURLAllowed(bio.BannerURL))
                bannerURLValid = true
        }
        else
            bannerURLValid = true
        let displayNameValid = false
        if(typeof bio.DisplayName === 'string' || bio.DisplayName instanceof String)
            if(bio.DisplayName.length <= MAX_DISPLAYNAME_LENGTH)
                displayNameValid = true
        let proav = true
        if(bio.Pronouns !== undefined && bio.Pronouns !== "remove"){
            if(!PronounTools.isValidPronounId(bio.Pronouns.nominativeId))
                proav = false
            if(!PronounTools.isValidPronounId(bio.Pronouns.accusativeId))
                proav = false
            if(!PronounTools.isValidPronounId(bio.Pronouns.reflexiveId))
                proav = false
            if(!PronounTools.isValidPronounId(bio.Pronouns.independentId))
                proav = false
            if(!PronounTools.isValidPronounId(bio.Pronouns.dependentId))
                proav = false
            if(typeof bio.Pronouns.DisplayThree !== 'boolean')
                proav = false
            /*
            if(!PronounTools.isValidCaseId(bio.Pronouns.firstCase))
                proav = false
            if(!PronounTools.isValidCaseId(bio.Pronouns.secondCase))
                proav = false
            if(!PronounTools.isValidCaseId(bio.Pronouns.thirdCase))
                if(bio.Pronouns.DisplayThree)
                    proav = false
             */
        }
        return pav && statusValid && statusTextValid && descriptionValid && pfpURLValid && bannerURLValid && displayNameValid && proav
    }
    catch (e) {
        return false
    }
}

exports.updateBio = function (userid, tokenContent, bio){
    return new Promise((exec, reject) => {
        exports.isUserIdTokenValid(userid, tokenContent).then(r => {
            if(r){
                // verify bio
                if(isValidBio(bio)){
                    exports.getUserDataFromUserId(userid).then(userdata => {
                        // Should I inline?
                        let savedPronouns
                        if(userdata.Bio.Pronouns !== undefined)
                            savedPronouns = JSON.parse(JSON.stringify(userdata.Bio.Pronouns))
                        let nud = userdata
                        nud.Bio = {
                            isPrivateAccount: bio.isPrivateAccount,
                            Status: bio.Status,
                            StatusText: bio.StatusText,
                            Description: bio.Description,
                            PfpURL: bio.PfpURL,
                            BannerURL: bio.BannerURL,
                            DisplayName: bio.DisplayName
                        }
                        if(bio.Pronouns){
                            if(bio.Pronouns === "remove")
                                nud.Bio.Pronouns = undefined
                            else{
                                let pronouns = PronounTools.createPronouns(bio.Pronouns.nominativeId,
                                    bio.Pronouns.accusativeId, bio.Pronouns.reflexiveId, bio.Pronouns.independentId,
                                    bio.Pronouns.dependentId, bio.Pronouns.DisplayThree, bio.Pronouns.firstCase,
                                    bio.Pronouns.secondCase, bio.Pronouns.thirdCase)
                                nud.Bio.Pronouns = pronouns
                            }
                        }
                        else
                            nud.Bio.Pronouns = savedPronouns
                        setUserData(nud).then(r => {
                            if(r)
                                exec(true)
                            exec(false)
                        }).catch(err => {
                            Logger.Error("Failed to update bio for user " + userid + "! " + err)
                            reject(err)
                        })
                    })
                }
                else
                    exec(false)
            }
            else
                exec(false)
        })
    })
}

exports.isUserBlocked = function (userid, targetUserId) {
    return new Promise((exec, reject) => {
        exports.getUserDataFromUserId(userid).then(userdata => {
            if(userdata){
                exports.getUserDataFromUserId(targetUserId).then(targetUserData => {
                    if(targetUserData){
                        let i = ArrayTools.find(userdata.BlockedUsers, targetUserData.Id)
                        exec(i !== undefined)
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

exports.blockUser = function (userid, tokenContent, targetUserId) {
    return new Promise(exec => {
        exports.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUserId(userid).then(userdata => {
                    if(userdata){
                        exports.getUserDataFromUserId(targetUserId).then(targetUserData => {
                            if(targetUserData && (userdata.Id !== targetUserData.Id)){
                                let nud = userdata
                                if(ArrayTools.find(nud.BlockedUsers, targetUserData.Id) === undefined)
                                    nud.BlockedUsers.push(targetUserData.Id)
                                nud.FriendRequests = ArrayTools.filterArray(nud.FriendRequests, targetUserData.Id)
                                nud.Friends = ArrayTools.filterArray(nud.Friends, targetUserData.Id)
                                nud.Following = ArrayTools.filterArray(nud.Following, targetUserData.Id)
                                nud.Followers = ArrayTools.filterArray(nud.Followers, targetUserData.Id)
                                setUserData(nud).then(r => {
                                    if(r){
                                        let nbud = targetUserData
                                        nbud.FriendRequests = ArrayTools.filterArray(nbud.FriendRequests, userdata.Id)
                                        nbud.Friends = ArrayTools.filterArray(nbud.Friends, userdata.Id)
                                        nbud.Following = ArrayTools.filterArray(nbud.Following, userdata.Id)
                                        nbud.Followers = ArrayTools.filterArray(nbud.Followers, userdata.Id)
                                        setUserData(nbud).then(r => {
                                            if(r)
                                                exec(true)
                                            else
                                                exec(false)
                                        }).catch(() => exec(false))
                                    }
                                    else
                                        exec(false)
                                }).catch(() => exec(false))
                            }
                            else
                                exec(false)
                        }).catch(() => exec(false))
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

exports.unBlockUser = function (userid, tokenContent, targetUserId) {
    return new Promise(exec => {
        exports.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUserId(userid).then(userdata => {
                    if(userdata){
                        exports.getUserDataFromUserId(targetUserId).then(targetUserData => {
                            if(targetUserData){
                                let nud = userdata
                                let newBlockedUsers = ArrayTools.filterArray(nud.BlockedUsers, targetUserData.Id)
                                nud.BlockedUsers = newBlockedUsers
                                setUserData(nud).then(r => {
                                    if(r)
                                        exec(true)
                                    else
                                        exec(false)
                                }).catch(() => exec(false))
                            }
                            else
                                exec(false)
                        }).catch(() => exec(false))
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

// TODO: Verify that both ways are updated to database
// Not doing this isn't catastrophic, but can cause issues down the line if not chronologically verified

exports.followUser = function (fromUserId, tokenContent, targetUserId) {
    return new Promise(exec => {
        exports.isUserIdTokenValid(fromUserId, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUserId(fromUserId).then(fromUserData => {
                    if(fromUserData){
                        exports.getUserDataFromUserId(targetUserId).then(targetUserData => {
                            if(targetUserData && (fromUserData.Id !== targetUserData.Id)){
                                exports.isUserBlocked(fromUserId, targetUserId).then(isBlocked => {
                                    if(!isBlocked){
                                        let nfud = fromUserData
                                        if(ArrayTools.find(nfud.Following, targetUserData.Id) === undefined)
                                            nfud.Following.push(targetUserData.Id)
                                        let ntud = targetUserData
                                        if(ArrayTools.find(ntud.BlockedUsers, fromUserData.Id) === undefined)
                                            ntud.Followers.push(fromUserData.Id)
                                        setUserData(nfud)
                                        setUserData(ntud)
                                        exec(true)
                                    }
                                    else
                                        exec(false)
                                }).catch(() => exec(false))
                            }
                            else
                                exec(false)
                        }).catch(() => exec(false))
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

exports.unFollowUser = function (fromUserId, tokenContent, targetUserId) {
    return new Promise(exec => {
        exports.isUserIdTokenValid(fromUserId, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUserId(fromUserId).then(fromUserData => {
                    if(fromUserData){
                        exports.getUserDataFromUserId(targetUserId).then(targetUserData => {
                            if(targetUserData){
                                let nfud = fromUserData
                                let newFollowings = ArrayTools.filterArray(nfud.Following, targetUserData.Id)
                                nfud.Following = newFollowings
                                let ntud = targetUserData
                                let newFollowers = ArrayTools.filterArray(ntud.Followers, fromUserData.Id)
                                ntud.Followers = newFollowers
                                setUserData(nfud)
                                setUserData(ntud)
                                exec(true)
                            }
                            else
                                exec(false)
                        }).catch(() => exec(false))
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

exports.sendFriendRequest = function (fromUserId, tokenContent, targetUserId) {
    return new Promise(exec => {
        exports.isUserIdTokenValid(fromUserId, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUserId(fromUserId).then(fromUserData => {
                    if(fromUserData){
                        exports.getUserDataFromUserId(targetUserId).then(targetUserData => {
                            exports.isUserBlocked(fromUserId, targetUserId).then(isUserBlocked => {
                                if(!isUserBlocked){
                                    if(targetUserData && (fromUserData.Id !== targetUserData.Id)){
                                        if(ArrayTools.find(targetUserData.Friends, fromUserData.Id) === undefined && ArrayTools.find(fromUserData.Friends, targetUserData.Id) === undefined) {
                                            let nfud = fromUserData
                                            if (ArrayTools.find(nfud.OutgoingFriendRequests, targetUserData.Id) === undefined)
                                                nfud.OutgoingFriendRequests.push(targetUserData.Id)
                                            let ntud = targetUserData
                                            if (ArrayTools.find(ntud.FriendRequests, fromUserData.Id) === undefined)
                                                ntud.FriendRequests.push(fromUserData.Id)
                                            setUserData(nfud)
                                            setUserData(ntud)
                                            exec(true)
                                        }
                                        else
                                            exec(false)
                                    }
                                    else
                                        exec(false)
                                }
                                else
                                    exec(false)
                            }).catch(() => exec(false))
                        }).catch(() => exec(false))
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

exports.acceptFriendRequest = function (userid, tokenContent, fromUserId) {
    return new Promise(exec => {
        exports.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUserId(userid).then(userdata => {
                    if(userdata){
                        exports.getUserDataFromUserId(fromUserId).then(fromUserData => {
                            if(fromUserData){
                                let isOutgoing = ArrayTools.find(fromUserData.OutgoingFriendRequests, userdata.Id)
                                let isRequested = ArrayTools.find(userdata.FriendRequests, fromUserData.Id)
                                if(isOutgoing !== undefined && isRequested !== undefined){
                                    let nud = userdata
                                    let newFriendRequests = ArrayTools.filterArray(nud.FriendRequests, fromUserData.Id)
                                    nud.FriendRequests = newFriendRequests
                                    if(ArrayTools.find(nud.Friends, fromUserData.Id) === undefined)
                                        nud.Friends.push(fromUserData.Id)
                                    let nfud = fromUserData
                                    let newOutgoingFriends = ArrayTools.filterArray(nfud.OutgoingFriendRequests, userdata.Id)
                                    nfud.OutgoingFriendRequests = newOutgoingFriends
                                    if(ArrayTools.find(nfud.Friends, userdata.Id) === undefined)
                                        nfud.Friends.push(userdata.Id)
                                    setUserData(nud)
                                    setUserData(nfud)
                                    exec(true)
                                }
                                else{
                                    // Broken? Custom message?
                                    if(!isRequested){
                                        let nud = userdata
                                        let newFriendRequests = ArrayTools.filterArray(nud.FriendRequests, fromUserData.Id)
                                        nud.FriendRequests = newFriendRequests
                                        setUserData(nud)
                                    }
                                    if(!isOutgoing){
                                        let nfud = fromUserData
                                        let newOutgoingFriends = ArrayTools.filterArray(nfud.OutgoingFriendRequests, userdata.Id)
                                        nfud.OutgoingFriendRequests = newOutgoingFriends
                                        setUserData(nfud)
                                    }
                                    exec(false)
                                }
                            }
                            else
                                exec(false)
                        }).catch(() => exec(false))
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

exports.declineFriendRequest = function (userid, tokenContent, fromUserId) {
    return new Promise(exec => {
        exports.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUserId(userid).then(userdata => {
                    if(userdata){
                        exports.getUserDataFromUserId(fromUserId).then(fromUserData => {
                            if(fromUserData){
                                let isOutgoing = ArrayTools.find(fromUserData.OutgoingFriendRequests, userdata.Id)
                                let isRequested = ArrayTools.find(userdata.FriendRequests, fromUserData.Id)
                                if(isOutgoing !== undefined){
                                    let nfud = fromUserData
                                    let newOutgoingFriends = ArrayTools.filterArray(nfud.OutgoingFriendRequests, userdata.Id)
                                    nfud.OutgoingFriendRequests = newOutgoingFriends
                                    setUserData(nfud)
                                }
                                if(isRequested !== undefined){
                                    let nud = userdata
                                    let newFriendRequests = ArrayTools.filterArray(nud.FriendRequests, fromUserData.Id)
                                    nud.FriendRequests = newFriendRequests
                                    setUserData(nud)
                                }
                                exec(true)
                            }
                            else
                                exec(false)
                        }).catch(() => exec(false))
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

exports.removeFriend = function (userid, tokenContent, targetUserId) {
    return new Promise(exec => {
        exports.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUserId(userid).then(userdata => {
                    if(userdata){
                        exports.getUserDataFromUserId(targetUserId).then(targetUserData => {
                            if(targetUserData){
                                let nud = userdata
                                let nudFriends = ArrayTools.filterArray(nud.Friends, targetUserData.Id)
                                nud.Friends = nudFriends
                                let ntud = targetUserData
                                let ntudFriends = ArrayTools.filterArray(ntud.Friends, userdata.Id)
                                ntud.Friends = ntudFriends
                                setUserData(nud)
                                setUserData(ntud)
                                exec(true)
                            }
                            else
                                exec(false)
                        }).catch(() => exec(false))
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

exports.addAvatar = function (userid, avatarMeta) {
    return new Promise(exec => {
        exports.getUserDataFromUserId(userid).then(userdata => {
            if(userdata){
                if(ArrayTools.find(userdata.Avatars, avatarMeta.Id) === undefined){
                    userdata.Avatars.push(avatarMeta.Id)
                    setUserData(userdata).then(r => {
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
        }).catch(() => exec(false))
    })
}

exports.removeAvatar = function (userid, tokenContent, avatarId) {
    return new Promise(exec => {
        exports.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUserId(userid).then(userdata => {
                    if(userdata){
                        userdata.Avatars = ArrayTools.customFilterArray(userdata.Avatars, item => item.Id !== avatarId)
                        setUserData(userdata).then(r => {
                            if(r)
                                exec(true)
                            else
                                exec(false)
                        }).catch(() => exec(false))
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

exports.addWorld = function (userid, worldMeta) {
    return new Promise(exec => {
        exports.getUserDataFromUserId(userid).then(userdata => {
            if(userdata){
                if(ArrayTools.find(userdata.Worlds, worldMeta.Id) === undefined){
                    userdata.Worlds.push(worldMeta.Id)
                    setUserData(userdata).then(r => {
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
        }).catch(() => exec(false))
    })
}

exports.removeWorld = function (userid, tokenContent, worldId) {
    return new Promise(exec => {
        exports.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUserId(userid).then(userdata => {
                    if(userdata){
                        userdata.Worlds = ArrayTools.customFilterArray(userdata.Worlds, item => item.Id !== worldId)
                        setUserData(userdata).then(r => {
                            if(r)
                                exec(true)
                            else
                                exec(false)
                        }).catch(() => exec(false))
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

exports.Rank = {
    Guest: 0,
    Incompleter: 1,
    Registered: 2,
    Verified: 3,
    Moderator: 4,
    Admin: 5,
    Owner: 6
}

exports.Status = {
    Offline: 0,
    Online: 1,
    Absent: 2,
    Party: 3,
    DoNotDisturb: 4
}

exports.LoginResult = {
    Incorrect: 0,
    Missing2FA: 1,
    Banned: 2,
    Warned: 3,
    Correct: 4
}