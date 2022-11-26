exports.getUnixTime = function (date) {
    return Math.floor(date.getTime() / 1000)
}