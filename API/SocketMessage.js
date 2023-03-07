exports.craftSocketMessage = function (message, result) {
    return JSON.stringify({
        message: message,
        result: result
    })
}