const date = require("date-and-time")

const DateTools = require("./../Tools/DateTools.js")
const ID = require("./../Data/ID")

const DAY_HOUR = 24

exports.createToken = function (app, hoursExpire, noExpire) {
    // Default time is 7 days
    if(hoursExpire === undefined)
        hoursExpire = DateTools.getUnixTime(date.addHours(new Date(), DAY_HOUR * 7))
    if(noExpire)
        hoursExpire = undefined
    let tokenId = ID.newTokenPassword(50)
    return {
        content: tokenId,
        dateCreated: DateTools.getUnixTime(new Date()),
        dateExpire: hoursExpire,
        app: app
    }
}

exports.isTokenValid = function (token){
    if(token.dateExpire === undefined)
        return true;
    return token.dateExpire > DateTools.getUnixTime(new Date())
}