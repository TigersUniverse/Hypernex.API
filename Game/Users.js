const bcrypt = require("bcrypt")
const date = require("date-and-time")

const Social = require("./../Social/Social.js")
const ID = require("./../Data/ID.js")
const InviteCodes = require("./../Data/InviteCodes.js")
const Logger = require("./../Logging/Logger.js")
const GenericToken = require("./../Security/GenericToken.js")
const Emailing = require("./../Data/Emailing.js")
const DateTools = require("./../Tools/DateTools.js")
const ArrayTools = require("./../Tools/ArrayTools.js")
const PronounTools = require("./../Tools/PronounTools.js")

let Database
let OTP

const USERDATA_DATABASE_PREFIX = "user/"
const MAX_BIO_LENGTH = 250

const USERNAME_TO_USERID_PREFIX = "username-userid/"
const EMAIL_TO_USERID_PREFIX = "email-userid/"

let serverConfig

exports.init = function (ServerConfig, databaseModule, otpModule){
    serverConfig = ServerConfig
    Database = databaseModule
    OTP = otpModule
    Logger.Log("Initialized Users!")
    return this
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
        Bio: {
            isPrivateAccount: false,
            /*
                Status should be Online by default, setting Offline is for invisible
                The WebSocket should handle Offline/invisibility
             */
            Status: exports.Status.Online,
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
            BanBegin: undefined,
            BanEnd: undefined,
            BanReason: "",
            BanDescription: ""
        },
        BanCount: 0,
        WarnStatus: {
            isWarned: false,
            TimeWarned: undefined,
            WarnReason: "",
            WarnDescription: ""
        },
        WarnCount: 0
    }
}

exports.censorUser = function (userdata){
    let d = {
        Id: userdata.Id,
        Username: userdata.Username,
        Bio: {
            // TODO: Get Status from WebSocket Info
            Status: exports.Status.Offline,
            Description: userdata.Bio.Description,
            PfpURL: userdata.Bio.PfpURL,
            BannerURL: userdata.Bio.BannerURL,
            DisplayName: userdata.Bio.DisplayName
        },
        Rank: userdata.Rank
    }
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
        if(!ii){
            if(letter === "_" && _s < 1)
                _s++
            else
                return false
        }
    }
    return true
}

exports.createUser = function (username, password, email, inviteCode) {
    return new Promise((exec, reject) => {
        exports.isEmailRegistered(email.toLowerCase()).then(emailRegistered => {
            if(!emailRegistered){
                if(Emailing.isValidEmail(email)){
                    exports.isUsernameRegistered(username.toLowerCase()).then(usernameRegistered => {
                        if(!usernameRegistered){
                            if(isValidUsername(username)){
                                InviteCodes.validateInviteCode(inviteCode, serverConfig.LoadedConfig.SignupRules.RemoveCodeAfterUse).then(allow => {
                                    if(allow){
                                        let id
                                        let alreadyExists = true
                                        // TODO: Can we make this faster?
                                        while(alreadyExists){
                                            id = ID.new(ID.IDTypes.User)
                                            let exec = false
                                            Database.doesKeyExist(USERDATA_DATABASE_PREFIX + id).then(exists => {
                                                alreadyExists = exists
                                                exec = true
                                            })
                                            while(!exec){}
                                        }
                                        hashPassword(password).then(hashedPassword => {
                                            let userdata = createUserData(id, username, hashedPassword, email)
                                            Database.set(USERDATA_DATABASE_PREFIX + id, userdata).then(reply => {
                                                if(!reply)
                                                    reject(new Error("Failed to save user " + username + " to database!"))
                                                else{
                                                    // Lookup Cache
                                                    Database.set(USERNAME_TO_USERID_PREFIX + username.toLowerCase(), {
                                                        Id: id
                                                    }).then(r => {
                                                        if(r){
                                                            Database.set(EMAIL_TO_USERID_PREFIX + email.toLowerCase(), {
                                                                Id: id
                                                            }).then(r => {
                                                                if(r){
                                                                    Social.initUser(userdata).then(r => {
                                                                        if(!r)
                                                                            reject(new Error("Failed to create socialdata for unknown reason"))
                                                                        exec(userdata)
                                                                    }).catch(err => {
                                                                        Logger.Error("Failed to create user " + username + " for reason " + err)
                                                                        reject(err)
                                                                    })
                                                                }
                                                                else
                                                                    reject(new Error("Failed to save Lookup Cache for user " + username))
                                                            }).catch(err => {
                                                                Logger.Error("Failed to create user " + username + " for reason " + err)
                                                                reject(err)
                                                            })
                                                        }
                                                        else
                                                            reject(new Error("Failed to save Lookup Cache for user " + username))
                                                    }).catch(err => {
                                                        Logger.Error("Failed to create user " + username + " for reason " + err)
                                                        reject(err)
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
                            else{
                                Logger.Error("Cannot create user " + username + " because the username " + username + " is invalid!")
                                reject(new Error("Username is invalid"))
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
                })
            }
            else
                reject(new Error("User does not exist!"))
        }).catch(err => reject(err))
    })
}

// This should only be used by the server, never shared to a client!
exports.getUserDataFromUsername = function (username) {
    return new Promise((exec, reject) => {
        Database.get(USERNAME_TO_USERID_PREFIX + username.toLowerCase()).then(lookupcache => {
            if(lookupcache){
                exports.getUserDataFromUserId(lookupcache.Id).then(userdata => {
                    if(userdata)
                        exec(userdata)
                    else
                        reject(new Error("No user found under username " + username))
                }).catch(err => reject(err))
            }
            else
                reject(new Error("No LookupCache found under username " + username))
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
        Database.get(EMAIL_TO_USERID_PREFIX + email.toLowerCase()).then(lookupcache => {
            if(lookupcache){
                exports.getUserDataFromUserId(lookupcache.Id).then(userdata => {
                    if(userdata)
                        exec(userdata)
                    else
                        reject(new Error("No user found under email " + email))
                }).catch(err => reject(err))
            }
            else
                reject(new Error("No LookupCache found under email " + email))
        }).catch(err => reject(err))
    })
}

exports.isEmailRegistered = function (email) {
    return new Promise(exec => {
        exports.getUserDataFromEmail(email.toLowerCase()).then(r => exec(true)).catch(err => exec(false))
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
            if(userdata){
                for (let tokenIndex = 0; tokenIndex < userdata.AccountTokens.length; tokenIndex++){
                    let token = userdata.AccountTokens[tokenIndex]
                    if(!GenericToken.isTokenValid(token)){
                        let newtokens = ArrayTools.customFilterArray(userdata.AccountTokens,
                            item => item.content !== token.content)
                        let nud = userdata
                        nud.AccountTokens = newtokens
                        setUserData(nud).then(r => {
                            // Not a huge deal if this fails, token is still invalid regardless
                            exec(false)
                        })
                    }
                    else{
                        // Token is valid, check for same content
                        if(tokenContent === token.content){
                            exec(true)
                        }
                    }
                }
            }
            else
                reject(new Error("Failed to get UserData for UserId " + userid))
        })
    })
}

exports.isUserTokenValid = function (username, tokenContent) {
    // Because this sets userdata, we should grab a record from the server
    return new Promise((exec, reject) => {
        exports.getUserDataFromUsername(username).then(userdata => {
            if(userdata){
                for (let tokenIndex = 0; tokenIndex < userdata.AccountTokens.length; tokenIndex++){
                    let token = userdata.AccountTokens[tokenIndex]
                    if(!GenericToken.isTokenValid(token)){
                        let newtokens = ArrayTools.customFilterArray(userdata.AccountTokens,
                            item => item.content !== token.content)
                        let nud = userdata
                        nud.AccountTokens = newtokens
                        setUserData(nud).then(r => {
                            // Not a huge deal if this fails, token is still invalid regardless
                            exec(false)
                        })
                    }
                    else{
                        // Token is valid, check for same content
                        if(tokenContent === token.content){
                            exec(true)
                        }
                    }
                }
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
exports.Login = function (username, password, twofacode){
    return new Promise(exec => {
        exports.isPasswordCorrect(username, password).then(correct => {
            if(correct){
                exports.getUserDataFromUsername(username).then(userdata => {
                    if(userdata.BanStatus.isBanned){
                        exec(exports.LoginResult.Banned, userdata.BanStatus)
                    }
                    else
                        if(!userdata.is2FAVerified){
                            // No 2FA, continue login
                            let token = GenericToken.createToken("login")
                            // Add token to userdata and save
                            userdata.AccountTokens[userdata.AccountTokens] = token
                            if(userdata.WarnStatus.isWarned){
                                // Mark the warning as read, and let the client know they were warned
                                userdata.WarnStatus.isWarned = false
                                setUserData(userdata).then(r => {
                                    if(r){
                                        let tud = userdata
                                        tud.WarnStatus.isWarned = true
                                        exec(exports.LoginResult.Warned, token, tud.WarnStatus)
                                    }
                                    else
                                        exec(-1)
                                }).catch(() => exec(-1))
                            }
                            else
                                setUserData(userdata).then(r => {
                                    if(r)
                                        exec(exports.LoginResult.Correct, token)
                                    else
                                        exec(-1)
                                }).catch(() => exec(-1))
                        }
                        else{
                            // this is a duplicate of above, maybe function it later but idk
                            if(OTP.verify2faOPT(userdata, twofacode)){
                                let token = GenericToken.createToken("login")
                                // Add token to userdata and save
                                userdata.AccountTokens[userdata.AccountTokens] = token
                                if(userdata.WarnStatus.isWarned){
                                    // Mark the warning as read, and let the client know they were warned
                                    userdata.WarnStatus.isWarned = false
                                    setUserData(userdata).then(r => {
                                        if(r){
                                            let tud = userdata
                                            tud.WarnStatus.isWarned = true
                                            exec(exports.LoginResult.Warned, token, tud.WarnStatus)
                                        }
                                        else
                                            exec(-1)
                                    }).catch(() => exec(-1))
                                }
                                else
                                    setUserData(userdata).then(r => {
                                        if(r)
                                            exec(exports.LoginResult.Correct, token)
                                        else
                                            exec(-1)
                                    }).catch(() => exec(-1))
                            }
                            else
                                exec(exports.LoginResult.Incorrect)
                        }
                }).catch(uerr => {
                    exec(-1)
                })
            }
            else
                exec(-1)
        }).catch(perr => {
            exec(-1)
        })
    })
}

exports.sendVerifyEmail = function (username, tokenContent) {
    return new Promise(exec => {
        exports.isUserTokenValid(username, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUsername(username).then(userdata => {
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

exports.verifyEmailToken = function (userid, tokenContent) {
    return new Promise(exec => {
        exports.getUserDataFromUserId(userid).then(userdata => {
            if(userdata){
                if(!userdata.isEmailVerified && userdata.emailVerificationToken !== "" &&
                    userdata.emailVerificationToken === tokenContent){
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
    })
}

exports.changeEmail = function (username, tokenContent, newEmail) {
    return new Promise((exec, reject) => {
        exports.isUserTokenValid(username, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUsername(username).then(userdata => {
                    if(userdata){
                        if(Emailing.isValidEmail(newEmail)){
                            exports.getUserDataFromEmail(newEmail).then(r => {
                                if(r)
                                    reject(new Error("Email already used!"))
                                else{
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
                                    }).catch(err => exec(false))
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
exports.enable2fa = function (username, tokenContent) {
    return new Promise((exec, reject) => {
        exports.isUserTokenValid(username, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUsername(username).then(userdata => {
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

exports.verify2fa = function (username, tokenContent, code) {
    return new Promise(exec => {
        exports.isUserTokenValid(username, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUsername(username).then(userdata => {
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
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
        }).catch(() => exec(false))
    })
}

exports.remove2fa = function (username, tokenContent) {
    return new Promise(exec => {
        exports.isUserTokenValid(username, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUsername(username).then(userdata => {
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
                let resetPasswordToken = ID.newTokenPassword(50)
                let nud = userdata
                nud.passwordResetToken = resetPasswordToken
                Emailing.sendPasswordResetEmail(userdata, resetPasswordToken).then(r => {
                    exec(r)
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

function isValidBio(bio){
    try{
        let pav = false
        if(bio.isPrivateAccount === true || bio.isPrivateAccount === false)
            pav = true
        let statusValid = false
        // User can set Invisible, but not Offline
        if(bio.Status >= 1 && bio.Status <= 6)
            statusValid = true
        let descriptionValid = false
        if(typeof bio.Description === 'string' || bio.Description instanceof String)
            descriptionValid = true
        let pfpURLValid = false
        if(typeof bio.PfpURL === 'string' || bio.PfpURL instanceof String)
            pfpURLValid = true
        let bannerURLValid = false
        if(typeof bio.BannerURL === 'string' || bio.BannerURL instanceof String)
            bannerURLValid = true
        let displayNameValid = false
        if(typeof bio.DisplayName === 'string' || bio.DisplayName instanceof String)
            if(bio.DisplayName.length <= MAX_BIO_LENGTH)
                displayNameValid = true
        let proav = true
        if(bio.Pronouns !== undefined){
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
        }
        return pav && statusValid && descriptionValid && pfpURLValid && bannerURLValid && displayNameValid && proav
    }
    catch (e) {
        return false
    }
}

exports.updateBio = function (username, tokenContent, bio){
    return new Promise((exec, reject) => {
        exports.isUserTokenValid(username, tokenContent).then(r => {
            if(r){
                // verify bio
                if(isValidBio(bio)){
                    exports.getUserDataFromUsername(username).then(userdata => {
                        // Should I inline?
                        let nud = userdata
                        nud.Bio = {
                            isPrivateAccount: bio.isPrivateAccount,
                            Status: bio.Status,
                            Description: bio.Description,
                            PfpURL: bio.PfpURL,
                            BannerURL: bio.BannerURL,
                            DisplayName: bio.DisplayName
                        }
                        if(bio.Pronouns){
                            let pronouns = PronounTools.createPronouns(bio.Pronouns.nominativeId,
                                bio.Pronouns.accusativeId, bio.Pronouns.reflexiveId, bio.Pronouns.independentId,
                                bio.Pronouns.dependentId)
                            nud.Bio.Pronouns = pronouns
                        }
                        setUserData(nud).then(r => {
                            if(r)
                                exec(true)
                            exec(false)
                        }).catch(err => {
                            Logger.Error("Failed to update bio for user " + username + "! " + err)
                            reject(err)
                        })
                    })
                }
                else
                    exec(false)
            }
        })
    })
}

exports.blockUser = function (username, tokenContent, targetUserId) {
    return new Promise(exec => {
        exports.isUserTokenValid(username, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUsername(username).then(userdata => {
                    if(userdata){
                        exports.getUserDataFromUserId(targetUserId).then(targetUserData => {
                            if(targetUserData){
                                let nud = userdata
                                nud.BlockedUsers.push(targetUserData.Id)
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

exports.unBlockUser = function (username, tokenContent, targetUserId) {
    return new Promise(exec => {
        exports.isUserTokenValid(username, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUsername(username).then(userdata => {
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

exports.followUser = function (fromUsername, tokenContent, targetUserId) {
    return new Promise(exec => {
        exports.isUserTokenValid(fromUsername, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUsername(fromUsername).then(fromUserData => {
                    if(fromUserData){
                        exports.getUserDataFromUserId(targetUserId).then(targetUserData => {
                            if(targetUserData){
                                let nfud = fromUserData
                                nfud.Following.push(targetUserData.Id)
                                let ntud = targetUserData
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
    })
}

exports.unFollowUser = function (fromUsername, tokenContent, targetUserId) {
    return new Promise(exec => {
        exports.isUserTokenValid(fromUsername, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUsername(fromUsername).then(fromUserData => {
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

exports.sendFriendRequest = function (fromUsername, tokenContent, targetUserId) {
    return new Promise(exec => {
        exports.isUserTokenValid(fromUsername, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUsername(fromUsername).then(fromUserData => {
                    if(fromUserData){
                        exports.getUserDataFromUserId(targetUserId).then(targetUserData => {
                            if(targetUserData){
                                let nfud = fromUserData
                                nfud.OutgoingFriendRequests.push(targetUserData.Id)
                                let ntud = targetUserData
                                ntud.FriendRequests.push(fromUserData.Id)
                                setUserData(nfud)
                                setUserData(ntud)
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

exports.acceptFriendRequest = function (username, tokenContent, fromUserId) {
    return new Promise(exec => {
        exports.isUserTokenValid(username, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUsername(username).then(userdata => {
                    if(userdata){
                        exports.getUserDataFromUserId(fromUserId).then(fromUserData => {
                            if(fromUserData){
                                let isOutgoing = ArrayTools.find(fromUserData.OutgoingFriendRequests, userdata.Id)
                                let isRequested = ArrayTools.find(userdata.FriendRequests, fromUserData.Id)
                                if(isOutgoing && isRequested){
                                    let nud = userdata
                                    let newFriendRequests = ArrayTools.filterArray(nud.FriendRequests, fromUserData.Id)
                                    nud.FriendRequests = newFriendRequests
                                    nud.Friends[nud.Friends] = fromUserData.Id
                                    let nfud = fromUserData
                                    let newOutgoingFriends = ArrayTools.filterArray(nfud.OutgoingFriendRequests, userdata.Id)
                                    nfud.OutgoingFriendRequests = newOutgoingFriends
                                    nfud.Friends[nfud.Friends] = userdata.Id
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

exports.declineFriendRequest = function (username, tokenContent, fromUserId) {
    return new Promise(exec => {
        exports.isUserTokenValid(username, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUsername(username).then(userdata => {
                    if(userdata){
                        exports.getUserDataFromUserId(fromUserId).then(fromUserData => {
                            if(fromUserData){
                                let isOutgoing = ArrayTools.find(fromUserData.OutgoingFriendRequests, userdata.Id)
                                let isRequested = ArrayTools.find(userdata.FriendRequests, fromUserData.Id)
                                if(isOutgoing){
                                    let nfud = fromUserData
                                    let newOutgoingFriends = ArrayTools.filterArray(nfud.OutgoingFriendRequests, userdata.Id)
                                    nfud.OutgoingFriendRequests = newOutgoingFriends
                                    setUserData(nfud)
                                }
                                if(isRequested){
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

exports.removeFriend = function (username, tokenContent, targetUserId) {
    return new Promise(exec => {
        exports.isUserTokenValid(username, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUsername(username).then(userdata => {
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

// Moderator Section
// These functions should be called AFTER authentication

function runModeratorCommand(command){
    return new Promise(exec => {
        let args = command.split(' ')
        if(args <= 0)
            exec(false)
        else{
            let cmd = args[0]
            switch (cmd) {
                case "warnuser": {
                    let userid = args[1]
                    let warnreason = args[2]
                    let warndescription = args[3]
                    if(userid === undefined || warnreason === undefined || warndescription === undefined){
                        exec(false)
                    } else{
                        exports.getUserDataFromUserId(userid).then(userdata => {
                            if(userdata){
                                let nud = userdata
                                nud.WarnStatus.isWarned = true
                                nud.WarnStatus.TimeWarned = DateTools.getUnixTime(new Date())
                                nud.WarnStatus.WarnReason = warnreason
                                nud.WarnStatus.WarnDescription = warndescription
                                nud.WarnCount = nud.WarnCount + 1
                                setUserData(nud).then(r => {
                                    if(r)
                                        exec(true)
                                    else
                                        exec(false)
                                }).catch(serr => {
                                    Logger.Error("Failed to run Moderator Command " + cmd + " with error " + serr)
                                    exec(false)
                                })
                            }
                            else
                                exec(false)
                        }).catch(err => {
                            Logger.Error("Failed to run Moderator Command " + cmd + " with error " + err)
                            exec(false)
                        })
                    }
                }
                case "banuser": {
                    let userid = args[1]
                    let hours = args[2]
                    let banreason = args[3]
                    let bandescription = args[4]
                    if (userid === undefined || (hours === undefined || isNaN(hours)) || banreason === undefined || bandescription === undefined) {
                        exec(false)
                    } else {
                        exports.getUserDataFromUserId(userid).then(userdata => {
                            if (userdata){
                                let nud = userdata
                                let banstatus = {
                                    isBanned: true,
                                    BanBegin: DateTools.getUnixTime(new Date()),
                                    BanEnd: DateTools.getUnixTime(date.addHours(new Date(), hours)),
                                    BanReason: banreason,
                                    BanDescription: bandescription
                                }
                                nud.BanStatus = banstatus
                                nud.BanCount = nud.BanCount + 1
                                setUserData(nud).then(r => {
                                    if(r)
                                        exec(true)
                                    else
                                        exec(false)
                                }).catch(serr => {
                                    Logger.Error("Failed to run Moderator Command " + cmd + " with error " + serr)
                                    exec(false)
                                })
                            }
                            else
                                exec(false)
                        }).catch(err => {
                            Logger.Error("Failed to run Moderator Command " + cmd + " with error " + err)
                            exec(false)
                        })
                    }
                }
            }
        }
    })
}

exports.runModeratorCommand = function (username, tokenContent, command) {
    return new Promise(exec => {
        exports.isUserTokenValid(username, tokenContent).then(validToken => {
            if(validToken){
                exports.getUserDataFromUsername(username).then(userdata => {
                    if(userdata){
                        if(userdata.Rank >= exports.Rank.Moderator){
                            runModeratorCommand(command).then(r => {
                                exec(r)
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