const uuid = require('uuid')

exports.new = function (idtype){
    let idprefix = "_"
    switch (idtype) {
        case 0:
            idprefix = "user_"
            break
        case 1:
            idprefix = "avatar_"
            break
        case 2:
            idprefix = "world_"
            break
        case 3:
            idprefix = "post_"
            break
        case 4:
            idprefix = "file_"
            break
        case 5:
            idprefix = "gameserver_"
            break
        case 6:
            idprefix = "instance_"
            break
        default:
            throw new Error("invalid idprefix!")
    }
    let id = uuid.v4()
    return idprefix + id
}

exports.newTokenPassword = function (length){
    if(length === undefined)
        length = 16
    let charset = "@#$&*0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    let password = "";
    for (let i = 0, n = charset.length; i < length; ++i) {
        password += charset.charAt(Math.floor(Math.random() * n));
    }
    return password;
}

exports.newSafeURLTokenPassword = function (length){
    if(length === undefined)
        length = 16
    let charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    let password = "";
    for (let i = 0, n = charset.length; i < length; ++i) {
        password += charset.charAt(Math.floor(Math.random() * n));
    }
    return password;
}

exports.IDTypes = {
    User: 0,
    Avatar: 1,
    World: 2,
    Post: 3,
    File: 4,
    GameServer: 5,
    Instance: 6
}