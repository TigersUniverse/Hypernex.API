const date = require("date-and-time")

const DateTools = require("../Tools/DateTools.js")
const ID = require("../Data/ID")

const DAY_HOUR = 24

exports.createToken = function (app, hoursExpire, noExpire) {
    // Default time is 7 days
    if(hoursExpire === null)
        hoursExpire = DateTools.getUnixTime(date.addHours(new Date(), DAY_HOUR * 7))
    if(noExpire)
        hoursExpire = null
    let tokenId = ID.newTokenPassword(50)
    return {
        content: tokenId,
        dateCreated: DateTools.getUnixTime(new Date()),
        dateExpire: hoursExpire,
        app: app
    }
}

exports.isTokenValid = function (token){
    if(token.dateExpire === null)
        return true;
    return token.dateExpire < new DateTools.getUnixTime(new Date())
}