let SearchDatabase
let FileUploading

let AvatarPopularityCollections
let WorldPopularityCollections

const RefreshTime = 60000

exports.Init = function (searchDatabase, fileUploading, avatarPopularityCollections, worldPopularityCollections) {
    SearchDatabase = searchDatabase
    FileUploading = fileUploading
    AvatarPopularityCollections = avatarPopularityCollections
    WorldPopularityCollections = worldPopularityCollections
    refresh()
    setInterval(refresh, RefreshTime)
    return this
}

exports.GetOrCreatePopularity = function (id) {
    return new Promise((exec, reject) => {
        let collection
        let split = id.split('_')[0]
        if(split === "avatar")
            collection = AvatarPopularityCollections
        else if(split === "world")
            collection = WorldPopularityCollections
        else {
            reject(new Error("Failed to parse Id correctly"))
            return
        }
        SearchDatabase.find(collection, {"Id": id}).then(objects => {
            let found = false
            for(let i in objects){
                let obj = objects[i]
                if(obj.Id === id){
                    found = obj
                    break
                }
            }
            if(!found){
                // Create a new one
                let obj = createNewPopularityObject(id)
                SearchDatabase.createDocument(collection, obj).then(sdr => {
                    if(sdr)
                        exec(true)
                    else
                        exec(new Error("Failed to create new document"))
                }).catch(err => reject(err))
            }
            else
                exec(found)
        }).catch(err => reject(err))
    })
}

exports.AddUsage = function (PopularityObject){
    PopularityObject.Hourly.Usages++
    PopularityObject.Daily.Usages++
    PopularityObject.Weekly.Usages++
    PopularityObject.Monthly.Usages++
    PopularityObject.Yearly.Usages++
}

exports.UpdateDocument = function (PopularityObject) {
    return new Promise((exec, reject) => {
        let collection
        let split = PopularityObject.Id.split('_')[0]
        if(split === "avatar")
            collection = AvatarPopularityCollections
        else if(split === "world")
            collection = WorldPopularityCollections
        else {
            reject(new Error("Failed to parse Id correctly"))
            return
        }
        SearchDatabase.updateDocument(collection, {"Id": PopularityObject.Id}, {$set: PopularityObject}).then(r => {
            if(r)
                exec(true)
            else
                exec(false)
        }).catch(err => reject(err))
    })
}

exports.GetPopularity = function (fileType, type, page, itemsPerPage) {
    return new Promise(exec => {
        let collection
        if(fileType === FileUploading.UploadType.Avatar)
            collection = AvatarPopularityCollections
        else if(fileType === FileUploading.UploadType.World)
            collection = WorldPopularityCollections
        else{
            exec(undefined)
            return
        }
        let sortByUsages
        switch (type){
            case exports.PopularityType.Hourly:
                sortByUsages = { 'Hourly.Usages': -1 }
                break
            case exports.PopularityType.Daily:
                sortByUsages = { 'Daily.Usages': -1 }
                break
            case exports.PopularityType.Weekly:
                sortByUsages = { 'Weekly.Usages': -1 }
                break
            case exports.PopularityType.Monthly:
                sortByUsages = { 'Monthly.Usages': -1 }
                break
            case exports.PopularityType.Yearly:
                sortByUsages = { 'Yearly.Usages': -1 }
                break
            default:
                exec(undefined)
                return
        }
        SearchDatabase.sortfind(collection, {}, sortByUsages).then(f => {
            if(f){
                let arr = f
                let newArr = []
                let startIndex = page * itemsPerPage
                let endIndex = startIndex + itemsPerPage - 1
                for(let i in arr){
                    if(i < startIndex) continue
                    if(i > endIndex) continue
                    let newArrObj = arr[i]
                    delete newArrObj["_id"]
                    newArr.push(newArrObj)
                }
                exec(newArr)
            }
            else
                exec(undefined)
        }).catch(_ => exec(undefined))
    })
}

exports.DeleteWorldPublicity = function (id){
    return new Promise((exec, reject) => {
        SearchDatabase.removeDocument(WorldPopularityCollections, {"Id": id}).then(r => {
            if(r)
                exec(true)
            else
                exec(false)
        }).catch(err => reject(err))
    })
}

exports.DeleteAvatarPublicity = function (id){
    return new Promise((exec, reject) => {
        SearchDatabase.removeDocument(AvatarPopularityCollections, {"Id": id}).then(r => {
            if(r)
                exec(true)
            else
                exec(false)
        }).catch(err => reject(err))
    })
}

exports.VerifyPopularityType = function (input) {
    switch (input) {
        case 0:
            return exports.PopularityType.Hourly
        case 1:
            return exports.PopularityType.Daily
        case 2:
            return exports.PopularityType.Weekly
        case 3:
            return exports.PopularityType.Monthly
        case 4:
            return exports.PopularityType.Yearly
    }
    return exports.PopularityType.Hourly
}

exports.PopularityType = {
    Hourly: 0,
    Daily: 1,
    Weekly: 2,
    Monthly: 3,
    Yearly: 4
}

function createNewPopularityObject (id) {
    // Assume id is either a world or avatar id
    return {
        Id: id,
        Hourly: getPopularityObjectInfo(),
        Daily: getPopularityObjectInfo(),
        Weekly: getPopularityObjectInfo(),
        Monthly: getPopularityObjectInfo(),
        Yearly: getPopularityObjectInfo()
    }
}

function getPopularityObjectInfo(){
    return {
        Usages: 0
    }
}

function resetHourlyCollection(collection){
    return new Promise(exec => {
        collection.updateMany({}, { $set: { "Hourly": getPopularityObjectInfo() }})
    }).catch(() => {})
}

function resetDailyCollection(collection){
    return new Promise(exec => {
        collection.updateMany({}, { $set: { "Daily": getPopularityObjectInfo() }})
    }).catch(() => {})
}

function resetWeeklyCollection(collection){
    return new Promise(exec => {
        collection.updateMany({}, { $set: { "Weekly": getPopularityObjectInfo() }})
    }).catch(() => {})
}

function resetMonthlyCollection(collection){
    return new Promise(exec => {
        collection.updateMany({}, { $set: { "Monthly": getPopularityObjectInfo() }})
    }).catch(() => {})
}

function resetYearlyCollection(collection){
    return new Promise(exec => {
        collection.updateMany({}, { $set: { "Yearly": getPopularityObjectInfo() }})
    }).catch(() => {})
}

function refresh(){
    let now = new Date()
    if(now.getMinutes() === 0){
        // Reset Hourly
        resetHourlyCollection(AvatarPopularityCollections)
        resetHourlyCollection(WorldPopularityCollections)
    }
    if(now.getHours() === 12){
        // Reset Daily
        resetDailyCollection(AvatarPopularityCollections)
        resetDailyCollection(WorldPopularityCollections)
        if (now.getDay() === 0) {
            // Reset Weekly
            resetWeeklyCollection(AvatarPopularityCollections)
            resetWeeklyCollection(WorldPopularityCollections)
        }
        if(now.getDate() === 1){
            // Reset Monthly
            resetMonthlyCollection(AvatarPopularityCollections)
            resetMonthlyCollection(WorldPopularityCollections)
            if(now.getMonth() === 0){
                // Reset Yearly
                resetYearlyCollection(AvatarPopularityCollections)
                resetYearlyCollection(WorldPopularityCollections)
            }
        }
    }
}