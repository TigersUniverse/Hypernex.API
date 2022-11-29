exports.filterArray = function (haystack, needle) {
    let x = 0;
    let newHaystack = []
    for(let y = 0; y < haystack.length; y++){
        let item = haystack[y]
        if(item !== needle){
            newHaystack[x] = item
            x++
        }
    }
    return newHaystack
}

exports.customFilterArray = function (haystack, isItemAllowed) {
    let x = 0;
    let newHaystack = []
    for(let y = 0; y < haystack.length; y++){
        let item = haystack[y]
        if(isItemAllowed(item)){
            newHaystack[x] = item
            x++
        }
    }
    return newHaystack
}

exports.find = function (haystack, needle) {
    for(let i = 0; i < haystack.length; i++){
        let item = haystack[i]
        if(item === needle)
            return i
    }
    return undefined
}

exports.customFind = function (haystack, isItem) {
    for(let i = 0; i < haystack.length; i++){
        let item = haystack[i]
        if(isItem(item))
            return i
    }
    return undefined
}